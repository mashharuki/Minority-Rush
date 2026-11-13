import { connectPrivySession } from "./aaSession";
import { createDemoClient } from "./demoClient";
import { isDeployed } from "./env";
import { connectInjectedSession } from "./injectedSession";
import { createLiveClient } from "./liveClient";
import type { GameClient } from "./types";

export type LoginKind = "email" | "wallet";

/**
 * - demo (nothing deployed): offline simulation
 * - "email": Privy login + gas-sponsored smart account
 * - "wallet": plain injected wallet paying its own gas
 */
export function createGameClient(kind: LoginKind): GameClient {
  if (!isDeployed) return createDemoClient();
  return createLiveClient(kind === "email" ? connectPrivySession : connectInjectedSession);
}
