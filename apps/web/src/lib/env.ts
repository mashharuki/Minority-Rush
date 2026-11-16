import deployment from "@/contracts/deployment.sepolia.json";

const ZERO = "0x0000000000000000000000000000000000000000";

export const env = {
  rpcUrl: (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) || "https://ethereum-sepolia-rpc.publicnode.com",
  chipAddress: (import.meta.env.VITE_RUSH_CHIP_ADDRESS as string | undefined) || deployment.rushChip,
  pokerAddress: (import.meta.env.VITE_POKER_ADDRESS as string | undefined) || deployment.poker,
  /** The bot's on-chain address (public) and its API; both are empty when the bot is not configured. */
  botAddress: (import.meta.env.VITE_BOT_ADDRESS as string | undefined) || "",
  botApiUrl: (import.meta.env.VITE_BOT_API_URL as string | undefined) || "",
  /** Force the offline simulation, e.g. `VITE_DEMO_MODE=true`. */
  forceDemo: import.meta.env.VITE_DEMO_MODE === "true",
  privyAppId: (import.meta.env.VITE_PRIVY_APP_ID as string | undefined) || "",
  privyClientId: (import.meta.env.VITE_PRIVY_CLIENT_ID as string | undefined) || "",
  /** Public URL of apps/sponsor-api (`.../api/sponsor`). Holds no secrets; calls need a Privy access token. */
  sponsorApiUrl: (import.meta.env.VITE_SPONSOR_API_URL as string | undefined) || "",
};

export const isPokerDeployed: boolean = env.chipAddress !== ZERO && env.pokerAddress !== ZERO && !env.forceDemo;

/** Email login + gasless smart-account play needs Privy and the sponsor API; otherwise only injected wallets. */
export const isAaEnabled: boolean = isPokerDeployed && env.privyAppId !== "" && env.sponsorApiUrl !== "";
