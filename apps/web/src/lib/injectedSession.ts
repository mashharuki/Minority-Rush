import { createPublicClient, createWalletClient, custom, http, type Address, type EIP1193Provider } from "viem";
import { sepolia } from "viem/chains";

import { env } from "./env";
import { errorMessage } from "./types";
import type { Session } from "./session";

type EthereumWindow = Window & { ethereum?: EIP1193Provider };

/** Plain browser wallet (MetaMask etc.) paying its own gas. */
export async function connectInjectedSession(): Promise<Session> {
  const ethereum = (window as EthereumWindow).ethereum;
  if (!ethereum) throw new Error("No wallet found. Install MetaMask or another EIP-1193 wallet.");
  const [address] = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  if (!address) throw new Error("No account selected");
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
  } catch (error) {
    console.error("connectInjectedSession: switching to Sepolia failed", errorMessage(error));
    throw new Error("Please switch your wallet to Sepolia");
  }
  const walletClient = createWalletClient({ account: address, chain: sepolia, transport: custom(ethereum) });
  const publicClient = createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) });

  return {
    kind: "injected",
    account: address,
    owner: address,
    ownerWalletClient: walletClient,
    needsObserver: false,
    async send(calls, onStep) {
      for (const call of calls) {
        onStep("Confirm in your wallet");
        const hash = await walletClient.sendTransaction({ account: address, chain: sepolia, to: call.to, data: call.data });
        onStep("Waiting for Sepolia");
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`Transaction reverted (${hash})`);
      }
    },
  };
}
