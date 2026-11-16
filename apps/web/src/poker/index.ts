import { connectPrivySession } from "@/lib/aaSession";
import { isPokerDeployed } from "@/lib/env";
import { connectInjectedSession } from "@/lib/injectedSession";

import type { PokerClient } from "./client";
import { createDemoPokerClient } from "./demoPokerClient";
import { createLivePokerClient } from "./livePokerClient";

export type LoginKind = "email" | "wallet";

/** Offline simulation when nothing is deployed; otherwise Sepolia with a Privy smart account or an injected wallet. */
export function createPokerClient(kind: LoginKind): PokerClient {
  if (!isPokerDeployed) return createDemoPokerClient();
  return createLivePokerClient(kind === "email" ? connectPrivySession : connectInjectedSession);
}

export type { PokerClient } from "./client";
