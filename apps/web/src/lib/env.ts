import deployment from "@/contracts/deployment.sepolia.json";

const ZERO = "0x0000000000000000000000000000000000000000";

export const env = {
  rpcUrl: (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) || "https://ethereum-sepolia-rpc.publicnode.com",
  chipAddress: (import.meta.env.VITE_RUSH_CHIP_ADDRESS as string | undefined) || deployment.rushChip,
  gameAddress: (import.meta.env.VITE_GAME_ADDRESS as string | undefined) || deployment.game,
  /** Force the offline simulation, e.g. `VITE_DEMO_MODE=true`. */
  forceDemo: import.meta.env.VITE_DEMO_MODE === "true",
};

export const isDeployed: boolean = env.chipAddress !== ZERO && env.gameAddress !== ZERO && !env.forceDemo;
