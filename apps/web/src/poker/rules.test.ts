import { describe, expect, it } from "vitest";

import { applyOptimistic, legalActions, secondsLeft, seatOnTurn } from "./rules";
import type { TableView } from "./types";

const view = (overrides: Partial<TableView> = {}): TableView => ({
  id: 1,
  phase: "betting",
  playerA: "0xA",
  playerB: "0xB",
  mySeat: "A",
  turn: "A",
  turnDeadlineMs: 0,
  history: [],
  contribA: 1,
  contribB: 1,
  fundsConfirmed: false,
  winner: null,
  endKind: null,
  ...overrides,
});

describe("legalActions", () => {
  it("should allow check or bet when no action was taken", () => {
    expect(legalActions([])).toEqual(["check", "bet"]);
  });
  it("should allow call or fold when facing a bet", () => {
    expect(legalActions(["bet"])).toEqual(["call", "fold"]);
  });
  it("should allow check or bet when the opponent checked", () => {
    expect(legalActions(["check"])).toEqual(["check", "bet"]);
  });
  it("should allow call or fold when a bet follows a check", () => {
    expect(legalActions(["check", "bet"])).toEqual(["call", "fold"]);
  });
  it.each([
    [["bet", "call"]],
    [["bet", "fold"]],
    [["check", "check"]],
    [["check", "bet", "call"]],
    [["check", "bet", "fold"]],
  ] as const)("should allow nothing when the hand is over (%j)", (history) => {
    expect(legalActions(history)).toEqual([]);
  });
});

describe("seatOnTurn", () => {
  it("should alternate seats starting with A until the hand is over", () => {
    expect(seatOnTurn([])).toBe("A");
    expect(seatOnTurn(["bet"])).toBe("B");
    expect(seatOnTurn(["check"])).toBe("B");
    expect(seatOnTurn(["check", "bet"])).toBe("A");
  });
  it("should return null when the hand is over", () => {
    expect(seatOnTurn(["bet", "call"])).toBeNull();
    expect(seatOnTurn(["check", "check"])).toBeNull();
  });
});

describe("applyOptimistic", () => {
  it("should add the action and flip the turn without changing the phase when the hand continues", () => {
    const next = applyOptimistic(view(), "A", "bet", 1000);
    expect(next.history).toEqual(["bet"]);
    expect(next.turn).toBe("B");
    expect(next.phase).toBe("betting");
    expect(next.contribA).toBe(2);
  });
  it("should mark the hand as ended with a showdown when a call finishes it", () => {
    const next = applyOptimistic(view({ history: ["bet"], turn: "B", mySeat: "B", contribA: 2 }), "B", "call", 1000);
    expect(next.turn).toBeNull();
    expect(next.contribB).toBe(2);
    expect(next.endKind).toBe("showdown");
  });
  it("should mark the hand as ended by fold when a player folds", () => {
    const next = applyOptimistic(view({ history: ["bet"], turn: "B", mySeat: "B", contribA: 2 }), "B", "fold", 1000);
    expect(next.endKind).toBe("fold");
    expect(next.turn).toBeNull();
  });
  it("should return the same view when the action is illegal", () => {
    const v = view();
    expect(applyOptimistic(v, "A", "call", 1000)).toBe(v);
    expect(applyOptimistic(v, "B", "check", 1000)).toBe(v);
  });
});

describe("secondsLeft", () => {
  it("should count down to the deadline using the given chain time", () => {
    expect(secondsLeft(46_000, 1_000)).toBe(45);
  });
  it("should clamp at zero when the deadline has passed", () => {
    expect(secondsLeft(1_000, 5_000)).toBe(0);
  });
});
