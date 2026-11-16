import { describe, expect, it } from "vitest";

import { isActiveBotTable } from "./activity";
import type { TableSnapshot } from "./handler";

const BOT = "0x00000000000000000000000000000000000000b0";

const table = (o: Partial<TableSnapshot> = {}): TableSnapshot => ({
  id: 1n,
  a: "0x01",
  b: BOT,
  phase: "betting",
  turn: "A",
  history: [],
  fundsConfirmed: true,
  showdown: false,
  turnDeadlineSec: 1_000,
  nowSec: 1_010,
  ...o,
});

describe("isActiveBotTable", () => {
  it("should count a table in betting when the clock is still running", () => {
    expect(isActiveBotTable(table({ nowSec: 990 }), BOT)).toBe(true);
  });

  it("should still count a table shortly after its deadline when the grace period has not passed", () => {
    expect(isActiveBotTable(table({ nowSec: 1_030 }), BOT)).toBe(true);
  });

  it("should not count an abandoned table when the human left long after the deadline", () => {
    expect(isActiveBotTable(table({ nowSec: 1_000 + 61 }), BOT)).toBe(false);
  });

  it("should not count a table the bot is not seated at", () => {
    expect(isActiveBotTable(table({ b: "0x99" }), BOT)).toBe(false);
  });

  it("should not count finished or open tables", () => {
    expect(isActiveBotTable(table({ phase: "settled" }), BOT)).toBe(false);
    expect(isActiveBotTable(table({ phase: "ended" }), BOT)).toBe(false);
    expect(isActiveBotTable(table({ phase: "open", b: null }), BOT)).toBe(false);
  });
});
