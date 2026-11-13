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
}

export const MIN_STAKE = 1;
export const MAX_STAKE = 10;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.split("\n")[0] ?? error.message;
  return String(error);
}
