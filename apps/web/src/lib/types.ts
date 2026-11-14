import { BaseError, ContractFunctionRevertedError } from "viem";

export type Side = "sun" | "moon";

export type RoundStatus = "none" | "open" | "closing" | "settled" | "cancelled";

export type RoundState = {
  id: number;
  status: RoundStatus;
  /** Unix ms. 0 when there is no round. */
  endTime: number;
  playerCount: number;
  hasEntered: boolean;
  hasClaimed: boolean;
  winner: Side | null;
};

export type MyResult = {
  winner: Side | null;
  won: boolean;
  /** Net chips paid out to you for this round (private: only you can decrypt it). */
  reward: number;
  cancelled: boolean;
};

export type OnStep = (label: string) => void;

/** One interface, two implementations: Sepolia (live) and an offline simulation (demo). */
export interface GameClient {
  readonly mode: "live" | "demo";
  connect(): Promise<string>;
  /** Faucet + operator approval (gas is paid by the wallet in this MVP). */
  onboard(onStep: OnStep): Promise<void>;
  getRound(): Promise<RoundState>;
  /** Decrypts the caller's private balance (asks for a signature in live mode). */
  readBalance(): Promise<number>;
  /** Starts a round if needed, then seals side + stake. */
  enter(side: Side, stake: number, onStep: OnStep): Promise<void>;
  /** Anyone may call after the deadline: compare pools, public-decrypt the winner, finalize. */
  settle(onStep: OnStep): Promise<void>;
  /** Claim the payout and decrypt your reward. */
  claim(onStep: OnStep): Promise<MyResult>;
  /** The fixed daily schedule. null = free play (demo): rounds can be started at any time. */
  getSchedule(): Promise<Schedule | null>;
  /** The latest `count` rounds, oldest first. Ids are >= 1; `endTime` is unix seconds. */
  getRecentRounds(count: number): Promise<RoundRecord[]>;
  /** Won/lost/none for each record, keyed by round id. Only entered + settled rounds need a decryption. */
  getOutcomes(records: readonly RoundRecord[]): Promise<ReadonlyMap<number, Outcome>>;
}

export const MIN_STAKE = 1;
export const MAX_STAKE = 10;

const FRIENDLY_ERRORS: Record<string, string> = {
  OutsideWindow: "No round is open right now",
};

/** Name of a decoded custom error (viem walks the cause chain), or null when it is not one. */
function revertErrorName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? (reverted.data?.errorName ?? null) : null;
}

export function errorMessage(error: unknown): string {
  const friendly = FRIENDLY_ERRORS[revertErrorName(error) ?? ""];
  if (friendly) return friendly;
  // Bundler/paymaster paths may only carry the error name in the text.
  if (error instanceof Error && error.message.includes("OutsideWindow")) return FRIENDLY_ERRORS.OutsideWindow!;
  if (error instanceof Error) return error.message.split("\n")[0] ?? error.message;
  return String(error);
}

/** Fixed daily schedule. Deadlines are UTC seconds-of-day; a round may be started `windowSec` before each. */
export type Schedule = { deadlinesUtcSec: readonly number[]; windowSec: number };

export type Outcome = "won" | "lost" | "none";

/** One finished/active round as seen by the player. `endTime` is unix SECONDS. */
export type RoundRecord = {
  id: number;
  endTime: number;
  status: RoundStatus;
  entered: boolean;
  winner: Side | null;
};

export type JoinState =
  | { kind: "free" }
  | { kind: "open"; endMs: number }
  | { kind: "startable"; endMs: number }
  | { kind: "waiting"; opensMs: number; endMs: number };
