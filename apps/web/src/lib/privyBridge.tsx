import { PrivyProvider, usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useEffect, useRef, type ReactNode } from "react";
import type { EIP1193Provider } from "viem";

import { env } from "./env";

const LOGIN_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 250;

export type LoginMethod = "email" | "wallet";

export type OwnerWallet = { address: `0x${string}`; provider: EIP1193Provider; isEmbedded: boolean };

type Snapshot = {
  ready: boolean;
  authenticated: boolean;
  login: (method?: LoginMethod) => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  wallets: ConnectedWallet[];
  walletsReady: boolean;
};

const empty: Snapshot = {
  ready: false,
  authenticated: false,
  login: () => undefined,
  logout: async () => undefined,
  getAccessToken: async () => null,
  wallets: [],
  walletsReady: false,
};

let snapshot: Snapshot = empty;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(POLL_MS);
  }
}

/** Imperative handle onto Privy's React hooks, so non-React code (the game client) can log in and get tokens. */
export const privyBridge = {
  /** Opens the Privy modal (email OTP or wallet) and resolves once logged in with a wallet. */
  async login(method?: LoginMethod): Promise<OwnerWallet> {
    await waitFor(() => snapshot.ready, "Privy to load");
    // Choosing "wallet" after an email login must not silently reuse the embedded wallet: start over.
    const hasExternalWallet = snapshot.wallets.some((w) => w.walletClientType !== "privy");
    if (method === "wallet" && snapshot.authenticated && !hasExternalWallet) {
      await snapshot.logout();
      await waitFor(() => !snapshot.authenticated, "logout");
    }
    if (!snapshot.authenticated) snapshot.login(method);
    await waitFor(() => snapshot.authenticated, "login");
    await waitFor(() => snapshot.walletsReady && snapshot.wallets.length > 0, "your private wallet");
    // Prefer the embedded wallet created at email login; fall back to a linked external wallet.
    const embedded = snapshot.wallets.find((w) => w.walletClientType === "privy");
    const external = snapshot.wallets.find((w) => w.walletClientType !== "privy");
    const wallet = method === "wallet" ? (external ?? embedded) : (embedded ?? external);
    if (!wallet) throw new Error("No wallet available after login");
    const isEmbedded = wallet.walletClientType === "privy";
    // An external wallet only signs one message (see gameKey.ts), so it needs no chain switch (no extra prompt).
    if (isEmbedded) await wallet.switchChain(11155111);
    // Privy and viem declare structurally different EIP-1193 types; at runtime both are a standard `request()` provider.
    const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
    return { address: wallet.address as `0x${string}`, provider, isEmbedded };
  },
  /** Fresh Privy access token for the sponsor API (never stored or logged). */
  getAccessToken: (): Promise<string | null> => snapshot.getAccessToken(),
  logout: (): Promise<void> => snapshot.logout(),
};

function BridgeSync() {
  const privy = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const latest = useRef<Snapshot>(empty);
  latest.current = {
    ready: privy.ready,
    authenticated: privy.authenticated,
    login: (method) => privy.login(method ? { loginMethods: [method] } : undefined),
    logout: () => privy.logout(),
    getAccessToken: () => privy.getAccessToken(),
    wallets,
    walletsReady,
  };
  useEffect(() => {
    snapshot = latest.current;
  });
  useEffect(() => {
    return () => {
      snapshot = empty;
    };
  }, []);
  return null;
}

/** Wraps the app with Privy (email OTP + external wallets, embedded wallet auto-created at login). */
export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={env.privyAppId}
      clientId={env.privyClientId || undefined}
      config={{
        loginMethods: ["email", "wallet"],
        // Sign silently with the embedded wallet: a hand needs many signatures (user operations and
        // decryption permits) and a confirmation dialog for each one ruins the game flow.
        embeddedWallets: { showWalletUIs: false, ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: { theme: "dark", accentColor: "#f99a57" },
      }}
    >
      <BridgeSync />
      {children}
    </PrivyProvider>
  );
}
