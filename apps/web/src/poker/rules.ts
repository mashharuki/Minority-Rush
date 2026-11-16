import type { PokerAction, Seat, TableView } from "./types";

type History = readonly PokerAction[];

/** Kuhn-style betting without raises. Mirrors `IndianPokerGame._isLegal` in the contract. */
export function legalActions(history: History): PokerAction[] {
  if (history.length === 0) return ["check", "bet"];
  if (history.length === 1) return history[0] === "bet" ? ["call", "fold"] : ["check", "bet"];
  if (history.length === 2 && history[0] === "check" && history[1] === "bet") return ["call", "fold"];
  return [];
}

export function seatOnTurn(history: History): Seat | null {
  if (legalActions(history).length === 0) return null;
  return history.length % 2 === 0 ? "A" : "B";
}

/** Shows the effect of `action` right away, before the transaction is mined. Illegal moves return `view` unchanged. */
export function applyOptimistic(view: TableView, seat: Seat, action: PokerAction, nowMs: number): TableView {
  if (view.phase !== "betting" || seatOnTurn(view.history) !== seat) return view;
  if (!legalActions(view.history).includes(action)) return view;

  const history = [...view.history, action];
  const adds = action === "bet" || action === "call" ? 1 : 0;
  const next: TableView = {
    ...view,
    history,
    contribA: view.contribA + (seat === "A" ? adds : 0),
    contribB: view.contribB + (seat === "B" ? adds : 0),
    turn: seatOnTurn(history),
  };
  if (next.turn !== null) return { ...next, turnDeadlineMs: nowMs + 45_000 };
  return { ...next, turnDeadlineMs: 0, endKind: action === "fold" ? "fold" : "showdown" };
}

/** Whole seconds left on the turn timer, computed from CHAIN time so browser clock skew cannot matter. */
export function secondsLeft(deadlineMs: number, chainNowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - chainNowMs) / 1000));
}
