import type { OnStep } from "@/lib/types";

import type { PokerAction, TableView } from "./types";

export type { OnStep };

/** One interface, two implementations: Sepolia (live) and an offline simulation (demo). */
export interface PokerClient {
  readonly mode: "live" | "demo";
  connect(): Promise<string>;
  /** Faucet + operator approval when needed. */
  onboard(onStep: OnStep): Promise<void>;
  readBalance(): Promise<number>;
  /** `opponent` reserves the second seat (null: anyone). Resolves with the table id. */
  createTable(opponent: string | null, onStep: OnStep): Promise<number>;
  joinTable(id: number, onStep: OnStep): Promise<void>;
  cancelTable(id: number, onStep: OnStep): Promise<void>;
  act(id: number, action: PokerAction, onStep: OnStep): Promise<void>;
  claimTimeout(id: number, onStep: OnStep): Promise<void>;
  getTable(id: number): Promise<TableView>;
  listOpenTables(): Promise<number[]>;
  /** The OPPONENT's card (1..13). The caller's own card is never requested. */
  revealOpponentCard(id: number): Promise<number>;
  /** confirmFunds / finalize when due. A step another client already did counts as success. */
  settleIfReady(id: number, onStep: OnStep): Promise<void>;
  /** Chain time in unix ms (so timers never depend on the browser clock). */
  chainNowMs(): Promise<number>;
}
