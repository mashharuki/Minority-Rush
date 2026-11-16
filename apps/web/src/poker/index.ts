import { connectPrivySession } from "@/lib/aaSession";
import { isAaEnabled, isPokerDeployed } from "@/lib/env";
import { connectInjectedSession } from "@/lib/injectedSession";

import type { PokerClient } from "./client";
import { createDemoPokerClient } from "./demoPokerClient";
import { createLivePokerClient } from "./livePokerClient";

export type LoginKind = "email" | "wallet";

/**
 * Offline simulation when nothing is deployed; otherwise Sepolia. With Privy configured both login kinds play through
 * the gasless smart account (an external wallet signs once; see gameKey.ts). Without it, a plain injected wallet pays
 * gas and confirms every transaction.
 */
export function createPokerClient(kind: LoginKind): PokerClient {
  if (!isPokerDeployed) return createDemoPokerClient();
  if (!isAaEnabled && kind === "wallet") return createLivePokerClient(connectInjectedSession);
  return createLivePokerClient(() => connectPrivySession(kind));
}

export type { PokerClient } from "./client";
