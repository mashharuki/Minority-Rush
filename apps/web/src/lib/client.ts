import { createDemoClient } from "./demoClient";
import { isDeployed } from "./env";
import { createLiveClient } from "./liveClient";
import type { GameClient } from "./types";

export function createGameClient(): GameClient {
  return isDeployed ? createLiveClient() : createDemoClient();
}
