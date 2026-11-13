import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { sepolia } from "viem/chains";

import { env } from "./env";
import { privyBridge } from "./privyBridge";
import type { Session } from "./session";

const entryPoint = { address: entryPoint07Address, version: "0.7" } as const;

type RpcParams = readonly unknown[] | object | undefined;

/**
 * JSON-RPC transport to apps/sponsor-api. Every request carries a fresh Privy access token; the sponsor API
 * verifies it, validates the UserOperation and only then talks to Pimlico (the API key never reaches the browser).
 */
const sponsorTransport = custom({
  async request({ method, params }: { method: string; params?: RpcParams }) {
    const token = await privyBridge.getAccessToken();
    if (!token) throw new Error("Not signed in");
    const response = await fetch(env.sponsorApiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message ?? "Sponsor request failed");
    return json.result;
  },
});

/** Privy login (email OTP or wallet), then a gas-sponsored ERC-4337 smart account owned by that wallet. */
export async function connectPrivySession(): Promise<Session> {
  const owner = await privyBridge.login();
  const ownerWalletClient = createWalletClient({
    account: owner.address,
    chain: sepolia,
    transport: custom(owner.provider),
  });
  const publicClient = createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) });
  const account = await toSimpleSmartAccount({ client: publicClient, owner: ownerWalletClient, entryPoint });
  const pimlico = createPimlicoClient({ transport: sponsorTransport, entryPoint });
  const smartAccountClient = createSmartAccountClient({
    account,
    chain: sepolia,
    bundlerTransport: sponsorTransport,
    paymaster: pimlico,
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  });

  return {
    kind: "privy",
    account: account.address,
    owner: owner.address,
    ownerWalletClient,
    needsObserver: true,
    async send(calls, onStep) {
      onStep("Sponsoring gas");
      const hash = await smartAccountClient.sendUserOperation({
        calls: calls.map((call) => ({ to: call.to, data: call.data, value: 0n })),
      });
      onStep("Waiting for Sepolia");
      const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash });
      if (!receipt.success) throw new Error(`UserOperation reverted (${hash})`);
    },
  };
}
