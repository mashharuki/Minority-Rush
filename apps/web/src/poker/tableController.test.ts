import { afterEach, describe, expect, it, vi } from "vitest";

import type { PokerClient } from "./client";
import { createTableController } from "./tableController";
import type { TableView } from "./types";

const baseView = (o: Partial<TableView> = {}): TableView => ({
  id: 1,
  phase: "betting",
  playerA: "0xA",
  playerB: "0xB",
  mySeat: "A",
  turn: "A",
  turnDeadlineMs: 1_045_000,
  history: [],
  contribA: 1,
  contribB: 1,
  fundsConfirmed: true,
  winner: null,
  endKind: null,
  ...o,
});

function fake(initial: TableView, chainNowMs = 1_000_000) {
  const state = { view: initial, now: chainNowMs };
  const client = {
    mode: "demo",
    connect: vi.fn(),
    onboard: vi.fn(),
    readBalance: vi.fn(),
    createTable: vi.fn(),
    joinTable: vi.fn(),
    cancelTable: vi.fn(),
    act: vi.fn(async () => undefined),
    claimTimeout: vi.fn(async () => undefined),
    getTable: vi.fn(async () => state.view),
    listOpenTables: vi.fn(),
    revealOpponentCard: vi.fn(async () => 9),
    settleIfReady: vi.fn(async () => undefined),
    chainNowMs: vi.fn(async () => state.now),
  } satisfies Record<Exclude<keyof PokerClient, "botPing">, unknown>;
  return { client: client as unknown as PokerClient, spies: client, state };
}

afterEach(() => vi.useRealTimers());

describe("tableController", () => {
  it("should show the optimistic action immediately when act is pressed", async () => {
    const { client, spies } = fake(baseView());
    let release: () => void = () => undefined;
    spies.act.mockImplementation(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined))));
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    const pending = c.act("bet");
    expect(c.getState().view?.history).toEqual(["bet"]);
    expect(c.getState().view?.turn).toBe("B");
    release();
    await pending;
  });

  it("should drop the optimistic action and report the error when the transaction fails", async () => {
    const { client, spies } = fake(baseView());
    spies.act.mockRejectedValue(new Error("rejected"));
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    await c.act("bet");
    expect(c.getState().view?.history).toEqual([]);
    expect(c.getState().error).toBe("rejected");
  });

  it("should request the opponent card once the table is dealt and never again", async () => {
    const { client, spies, state } = fake(baseView());
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    await c.poll();
    expect(c.getState().opponentCard).toBe(9);
    state.view = baseView({ phase: "settled", winner: "A", endKind: "showdown" });
    await c.poll();
    expect(spies.revealOpponentCard).toHaveBeenCalledTimes(1);
    expect(spies.revealOpponentCard).toHaveBeenCalledWith(1);
  });

  it("should not request a card while the table is still open", async () => {
    const { client, spies } = fake(baseView({ phase: "open", playerB: null, turn: null }));
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    expect(spies.revealOpponentCard).not.toHaveBeenCalled();
  });

  it("should restore turn, timer and opponent card when it starts on an existing table", async () => {
    const { client } = fake(baseView({ history: ["check"], turn: "B", turnDeadlineMs: 1_020_000 }));
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    const s = c.getState();
    expect(s.view?.history).toEqual(["check"]);
    expect(s.view?.turn).toBe("B");
    expect(s.opponentCard).toBe(9);
    expect(c.secondsLeft()).toBe(20);
  });

  it("should clear the decrypted card and optimistic state when the account changes", async () => {
    const { client } = fake(baseView());
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    expect(c.getState().opponentCard).toBe(9);
    const second = c.start(1, "0xOther");
    expect(c.getState().opponentCard).toBeNull();
    expect(c.getState().view).toBeNull();
    await second;
  });

  it("should call claimTimeout once when the opponent's clock has run out", async () => {
    const { client, spies } = fake(baseView({ turn: "B", turnDeadlineMs: 1_045_000 }), 1_046_000);
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    await c.poll();
    expect(spies.claimTimeout).toHaveBeenCalledTimes(1);
  });

  it("should not claim a timeout when it is my own turn", async () => {
    const { client, spies } = fake(baseView({ turn: "A", turnDeadlineMs: 1_045_000 }), 1_046_000);
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    expect(spies.claimTimeout).not.toHaveBeenCalled();
  });

  it("should settle automatically when funds are unconfirmed or a showdown awaits its result", async () => {
    const { client, spies, state } = fake(baseView({ fundsConfirmed: false }));
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    expect(spies.settleIfReady).toHaveBeenCalledTimes(1);
    state.view = baseView({ phase: "ended", endKind: "showdown", fundsConfirmed: true });
    await c.poll();
    expect(spies.settleIfReady).toHaveBeenCalledTimes(2);
  });

  it("should compute the countdown from chain time when the browser clock is skewed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
    const { client } = fake(baseView({ turnDeadlineMs: 1_045_000 }), 1_000_000);
    const c = createTableController(client, { pollMs: 0 });
    await c.start(1, "0xA");
    expect(c.secondsLeft()).toBe(45);
    vi.advanceTimersByTime(10_000);
    expect(c.secondsLeft()).toBe(35);
  });
});

describe("tableController bot pings", () => {
  const ok = { ok: true } as const;

  it("should call the bot endpoint after the user acts when playing the bot", async () => {
    const { client } = fake(baseView());
    const ping = vi.fn(async () => ok);
    const c = createTableController(client, { pollMs: 0, ping });
    await c.start(1, "0xA");
    ping.mockClear();
    await c.act("bet");
    expect(ping).toHaveBeenCalledWith(1);
  });

  it("should ping the bot when it is the bot's turn", async () => {
    const { client } = fake(baseView({ turn: "B" }));
    const ping = vi.fn(async () => ok);
    const c = createTableController(client, { pollMs: 0, ping });
    await c.start(1, "0xA");
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("should not ping again within the retry window when nothing changed", async () => {
    let t = 0;
    const { client } = fake(baseView({ turn: "B" }));
    const ping = vi.fn(async () => ok);
    const c = createTableController(client, { pollMs: 0, ping, now: () => t });
    await c.start(1, "0xA");
    t += 3_000;
    await c.poll();
    expect(ping).toHaveBeenCalledTimes(1);
    t += 20_000;
    await c.poll();
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("should not ping when it is the human's turn and nothing is pending", async () => {
    const { client } = fake(baseView({ turn: "A", fundsConfirmed: true }));
    const ping = vi.fn(async () => ok);
    const c = createTableController(client, { pollMs: 0, ping });
    await c.start(1, "0xA");
    expect(ping).not.toHaveBeenCalled();
  });

  it("should show a busy message when the bot endpoint returns bot_busy", async () => {
    const { client } = fake(baseView({ phase: "open", playerB: null, turn: null }));
    const ping = vi.fn(async () => ({ ok: false, reason: "bot_busy" }) as const);
    const c = createTableController(client, { pollMs: 0, ping });
    await c.start(1, "0xA");
    expect(c.getState().error).toMatch(/busy/i);
    expect(c.getState().botProblem).toBe("bot_busy");
  });

  it("should show an out-of-chips message when the bot is broke", async () => {
    const { client } = fake(baseView({ phase: "open", playerB: null, turn: null }));
    const ping = vi.fn(async () => ({ ok: false, reason: "bot_broke" }) as const);
    const c = createTableController(client, { pollMs: 0, ping });
    await c.start(1, "0xA");
    expect(c.getState().error).toMatch(/chips/i);
    expect(c.getState().botProblem).toBe("bot_broke");
  });

  it("should never ping when no ping function is given", async () => {
    const { client } = fake(baseView({ turn: "B" }));
    const c = createTableController(client, { pollMs: 0 });
    await expect(c.start(1, "0xA")).resolves.toBeUndefined();
  });
});
