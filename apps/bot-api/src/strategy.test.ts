import { describe, expect, it } from "vitest";

import { decideAction, legalActions } from "./strategy";
import type { PokerAction, Seat } from "./types";

/** Small deterministic generator so the statistical tests are repeatable. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const HISTORIES: { history: PokerAction[]; seat: Seat }[] = [
  { history: [], seat: "A" },
  { history: ["bet"], seat: "B" },
  { history: ["check"], seat: "B" },
  { history: ["check", "bet"], seat: "A" },
];

const rate = (n: number, pick: () => PokerAction, target: PokerAction): number => {
  let hits = 0;
  for (let i = 0; i < n; i++) if (pick() === target) hits++;
  return hits / n;
};

describe("legalActions", () => {
  it("should match the contract's betting rules", () => {
    expect(legalActions([])).toEqual(["check", "bet"]);
    expect(legalActions(["bet"])).toEqual(["call", "fold"]);
    expect(legalActions(["check"])).toEqual(["check", "bet"]);
    expect(legalActions(["check", "bet"])).toEqual(["call", "fold"]);
    expect(legalActions(["bet", "call"])).toEqual([]);
  });
});

describe("decideAction", () => {
  it("should always return a legal action when given any card and history", () => {
    const random = seeded(7);
    for (const { history, seat } of HISTORIES) {
      for (let card = 1; card <= 13; card++) {
        for (let i = 0; i < 50; i++) {
          expect(legalActions(history)).toContain(decideAction(card, history, seat, random));
        }
      }
    }
  });

  it("should call a bet more often when the opponent holds a low card", () => {
    const random = seeded(11);
    const low = rate(1000, () => decideAction(2, ["bet"], "B", random), "call");
    const high = rate(1000, () => decideAction(12, ["bet"], "B", random), "call");
    expect(low).toBeGreaterThan(high + 0.3);
  });

  it("should fold to a bet more often when the opponent holds a high card", () => {
    const random = seeded(13);
    const high = rate(1000, () => decideAction(13, ["bet"], "B", random), "fold");
    const low = rate(1000, () => decideAction(1, ["bet"], "B", random), "fold");
    expect(high).toBeGreaterThan(low + 0.3);
  });

  it("should bet more often than it checks when the opponent holds a low card", () => {
    const random = seeded(17);
    expect(rate(1000, () => decideAction(2, ["check"], "B", random), "bet")).toBeGreaterThan(0.6);
  });

  it("should still bluff sometimes when the opponent holds a high card", () => {
    const random = seeded(19);
    const bluffRate = rate(2000, () => decideAction(13, ["check"], "B", random), "bet");
    expect(bluffRate).toBeGreaterThan(0.03);
    expect(bluffRate).toBeLessThan(0.3);
  });
});
