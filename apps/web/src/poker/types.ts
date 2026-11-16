export type Seat = "A" | "B";
export type PokerAction = "check" | "bet" | "call" | "fold";
export type TablePhase = "open" | "betting" | "ended" | "settled" | "voided" | "cancelled";

/** Everything public about a table, from the viewpoint of `mySeat` (null: a spectator or not seated). */
export type TableView = {
  id: number;
  phase: TablePhase;
  playerA: string;
  playerB: string | null;
  mySeat: Seat | null;
  turn: Seat | null;
  /** Unix ms, taken from chain time. 0 when no timer runs. */
  turnDeadlineMs: number;
  history: PokerAction[];
  contribA: number;
  contribB: number;
  fundsConfirmed: boolean;
  winner: Seat | null;
  endKind: "fold" | "showdown" | null;
};
