import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, createWalletClient, custom, http, type Address, type WalletClient } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { sepolia } from "viem/chains";

import { env } from "./env";
import { deriveGameAccount } from "./gameKey";
import { privyBridge, type OwnerWallet } from "./privyBridge";
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

/**
 * An external wallet (MetaMask etc.) would prompt for every UserOperation and decryption permit. Instead it signs one
 * message that derives a browser-held game key, and that key owns the smart account and signs everything silently.
 */
async function createGameOwner(wallet: OwnerWallet): Promise<{ address: Address; client: WalletClient }> {
  const external = createWalletClient({ account: wallet.address, chain: sepolia, transport: custom(wallet.provider) });
  const account = await deriveGameAccount(wallet.address, (message) => external.signMessage({ account: wallet.address, message }));
  return { address: account.address, client: createWalletClient({ account, chain: sepolia, transport: http(env.rpcUrl) }) };
}

/** Privy login (email OTP or wallet), then a gas-sponsored ERC-4337 smart account owned by that wallet. */
export async function connectPrivySession(): Promise<Session> {
  const wallet = await privyBridge.login();
  const publicClient = createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) });
  const owner = wallet.isEmbedded
    ? { address: wallet.address, client: createWalletClient({ account: wallet.address, chain: sepolia, transport: custom(wallet.provider) }) }
    : await createGameOwner(wallet);
  const ownerWalletClient = owner.client;
  const account = await toSimpleSmartAccount({ client: publicClient, owner: ownerWalletClient, entryPoint });
  // Everything below uses the account that actually signs: the embedded wallet, or the derived game key.
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
