import type { PokerAction, Seat } from "./types";

/** Mirrors `IndianPokerGame._isLegal`: Kuhn-style betting without raises. */
export function legalActions(history: readonly PokerAction[]): PokerAction[] {
  if (history.length === 0) return ["check", "bet"];
  if (history.length === 1) return history[0] === "bet" ? ["call", "fold"] : ["check", "bet"];
  if (history.length === 2 && history[0] === "check" && history[1] === "bet") return ["call", "fold"];
  return [];
}

/** The bot's own card is unknown to it. These constants shape how it plays against the card it can see. */
const VALUE_BET_MAX_OPPONENT_CARD = 7;
const VALUE_BET_PROBABILITY = 0.8;
const BLUFF_PROBABILITY = 0.15;
const CALL_MAX_OPPONENT_CARD = 8;
const BLUFF_CATCH_PROBABILITY = 0.1;

/**
 * Picks the bot's move. It sees only the OPPONENT's card (1..13), as the rules give it; its own card is hidden from it
 * (and from its operator). A low opponent card means the bot's card is likely higher, so it bets and calls more.
 */
export function decideAction(
  opponentCard: number,
  history: readonly PokerAction[],
  _seat: Seat,
  random: () => number,
): PokerAction {
  const legal = legalActions(history);
  if (legal.includes("bet")) {
    const betChance = opponentCard <= VALUE_BET_MAX_OPPONENT_CARD ? VALUE_BET_PROBABILITY : BLUFF_PROBABILITY;
    return random() < betChance ? "bet" : "check";
  }
  const shouldCall = opponentCard <= CALL_MAX_OPPONENT_CARD || random() < BLUFF_CATCH_PROBABILITY;
  return shouldCall ? "call" : "fold";
}
