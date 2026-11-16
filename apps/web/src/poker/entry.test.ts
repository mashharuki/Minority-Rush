import { describe, expect, it, vi } from "vitest";

import type { PokerClient } from "./client";
import { resolveTableEntry } from "./entry";
import type { TableView } from "./types";

const view = (mySeat: TableView["mySeat"]): TableView => ({
  id: 4,
  phase: "betting",
  playerA: "0xA",
  playerB: "0xB",
  mySeat,
  turn: "A",
  turnDeadlineMs: 0,
  history: [],
  contribA: 1,
  contribB: 1,
  fundsConfirmed: false,
  winner: null,
  endKind: null,
});

const clientFor = (v: TableView): PokerClient => ({ getTable: vi.fn(async () => v) }) as unknown as PokerClient;

describe("resolveTableEntry", () => {
  it("should resume when the player already sits at the table", async () => {
    expect(await resolveTableEntry(clientFor(view("B")), 4)).toBe("resume");
    expect(await resolveTableEntry(clientFor(view("A")), 4)).toBe("resume");
  });

  it("should join when the player is not seated", async () => {
    expect(await resolveTableEntry(clientFor(view(null)), 4)).toBe("join");
  });
});
