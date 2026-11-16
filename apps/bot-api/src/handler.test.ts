import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BotConfig } from "./config";
import { handleBotRequest, type Chain, type Deps, type TableSnapshot } from "./handler";

const CREATOR = "0x00000000000000000000000000000000000000c1";
const BOT = "0x00000000000000000000000000000000000000b0";
const ORIGIN = "https://app.example";
const CREATOR_SIG = `0x${"ab".repeat(65)}`;
const OTHER_SIG = `0x${"cd".repeat(65)}`;

const config: BotConfig = {
  botPrivateKey: `0x${"11".repeat(32)}`,
  poker: "0x00000000000000000000000000000000000000a1",
  chip: "0x00000000000000000000000000000000000000c0",
  rpcUrl: "http://rpc",
  privyAppId: "app",
  privyVerificationKey: "key",
  allowedOrigins: [ORIGIN],
  maxTables: 2,
  minEthWei: 10n,
  minChips: 4,
  rateLimitPerMinute: 30,
};

const table = (o: Partial<TableSnapshot> = {}): TableSnapshot => ({
  id: 7n,
  a: CREATOR,
  b: null,
  phase: "open",
  turn: null,
  history: [],
  fundsConfirmed: false,
  showdown: false,
  turnDeadlineSec: 0,
  nowSec: 1_000,
  ...o,
});

function setup(initial: TableSnapshot, over: Partial<Deps> = {}) {
  const state = { table: initial, active: [] as { id: bigint; creator: string }[] };
  const chain = {
    botAddress: BOT,
    readTable: vi.fn(async () => state.table),
    join: vi.fn(async () => undefined),
    act: vi.fn(async () => undefined),
    confirmFunds: vi.fn(async () => undefined),
    finalizeShowdown: vi.fn(async () => undefined),
    claimTimeout: vi.fn(async () => undefined),
    activeBotTables: vi.fn(async () => state.active),
    balances: vi.fn(async () => ({ ethWei: 1_000n, chips: 20 })),
  } satisfies Record<keyof Chain, unknown>;
  const decryptCard = vi.fn(async (_id: bigint, _seat: "A" | "B") => 3);
  const deps: Deps = {
    config,
    limiter: { allow: () => true },
    verifyToken: async (t) => (t === "good" ? { userId: "user-1" } : null),
    verifySignature: async (address, message, signature) =>
      signature === CREATOR_SIG && address === CREATOR && message === "bot:7",
    chain: chain as unknown as Chain,
    decryptCard,
    random: () => 0,
    ...over,
  };
  const call = (body: unknown = { tableId: 7 }, headers: Record<string, string> = { authorization: "Bearer good", origin: ORIGIN }) =>
    handleBotRequest({ method: "POST", headers, body }, deps);
  return { call, chain, state, decryptCard };
}

describe("handleBotRequest", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));

  it("should join a table when the table is open", async () => {
    const { call, chain } = setup(table());
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, action: "joined" });
    expect(chain.join).toHaveBeenCalledWith(7n);
  });

  it("should act with the strategy decision when it is the bot's turn", async () => {
    const { call, chain } = setup(table({ phase: "betting", b: BOT, turn: "B", history: ["check"], fundsConfirmed: true }));
    const res = await call();
    expect(res.body).toMatchObject({ ok: true, action: "acted" });
    expect(chain.act).toHaveBeenCalledWith(7n, "bet"); // card 3 is low and random() = 0
  });

  it("should confirm funds when betting has started and funds are unconfirmed", async () => {
    const { call, chain } = setup(table({ phase: "betting", b: BOT, turn: "A", fundsConfirmed: false }));
    await call();
    expect(chain.confirmFunds).toHaveBeenCalledWith(7n);
  });

  it("should finalize a showdown when the hand ended and funds are confirmed", async () => {
    const { call, chain } = setup(table({ phase: "ended", b: BOT, showdown: true, fundsConfirmed: true }));
    await call();
    expect(chain.finalizeShowdown).toHaveBeenCalledWith(7n);
  });

  it("should do nothing when it is the opponent's turn", async () => {
    const { call, chain } = setup(table({ phase: "betting", b: BOT, turn: "A", fundsConfirmed: true, turnDeadlineSec: 2_000 }));
    const res = await call();
    expect(res.body).toMatchObject({ ok: true, action: "none" });
    expect(chain.act).not.toHaveBeenCalled();
    expect(chain.claimTimeout).not.toHaveBeenCalled();
  });

  it("should claim the timeout when the opponent ran out of time", async () => {
    const { call, chain } = setup(table({ phase: "betting", b: BOT, turn: "A", fundsConfirmed: true, turnDeadlineSec: 900 }));
    const res = await call();
    expect(res.body).toMatchObject({ action: "claimed" });
    expect(chain.claimTimeout).toHaveBeenCalledWith(7n);
  });

  it("should never request the decrypt of the bot's own card", async () => {
    const { call, decryptCard } = setup(table({ phase: "betting", b: BOT, turn: "B", history: [], fundsConfirmed: true }));
    await call();
    expect(decryptCard).toHaveBeenCalled();
    for (const [, seat] of decryptCard.mock.calls) expect(seat).toBe("A");
  });

  it("should not put the card value in the response", async () => {
    const { call } = setup(table({ phase: "betting", b: BOT, turn: "B", fundsConfirmed: true }));
    const res = await call();
    expect(JSON.stringify(res.body)).not.toMatch(/card/i);
  });

  it("should reject 401 when no valid token or signature is given", async () => {
    const { call } = setup(table());
    expect((await call({ tableId: 7 }, { origin: ORIGIN })).status).toBe(401);
    expect((await call({ tableId: 7 }, { authorization: "Bearer bad", origin: ORIGIN })).status).toBe(401);
  });

  it("should accept the table creator's signature when no token is given", async () => {
    const { call, chain } = setup(table());
    const res = await call({ tableId: 7, signature: CREATOR_SIG }, { origin: ORIGIN });
    expect(res.status).toBe(200);
    expect(chain.join).toHaveBeenCalled();
  });

  it("should reject 401 when the signature is not the creator's", async () => {
    const { call } = setup(table());
    expect((await call({ tableId: 7, signature: OTHER_SIG }, { origin: ORIGIN })).status).toBe(401);
  });

  it("should reject 403 when the origin is not allowed", async () => {
    const { call } = setup(table());
    expect((await call({ tableId: 7 }, { authorization: "Bearer good", origin: "https://evil.example" })).status).toBe(403);
  });

  it("should reject 400 when the body is invalid", async () => {
    const { call } = setup(table());
    expect((await call({ tableId: "x" })).status).toBe(400);
  });

  it("should reject 429 when the user exceeds the rate limit", async () => {
    const { call } = setup(table(), { limiter: { allow: () => false } });
    expect((await call()).status).toBe(429);
  });

  it("should reject 503 bot_busy when the global table cap is reached", async () => {
    const { call, state, chain } = setup(table());
    state.active = [
      { id: 1n, creator: "0x01" },
      { id: 2n, creator: "0x02" },
    ];
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ reason: "bot_busy" });
    expect(chain.join).not.toHaveBeenCalled();
  });

  it("should reject 503 bot_busy when the creator already has an active bot table", async () => {
    const { call, state } = setup(table());
    state.active = [{ id: 3n, creator: CREATOR.toUpperCase().replace("0X", "0x") }];
    expect((await call()).body).toMatchObject({ reason: "bot_busy" });
  });

  it("should reject 503 bot_broke when the bankroll is below the floor", async () => {
    const { call, chain } = setup(table());
    chain.balances.mockResolvedValue({ ethWei: 1n, chips: 20 });
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ reason: "bot_broke" });
    chain.balances.mockResolvedValue({ ethWei: 1_000n, chips: 1 });
    expect((await call()).body).toMatchObject({ reason: "bot_broke" });
  });

  it("should refuse a table the bot created itself", async () => {
    const { call } = setup(table({ a: BOT }));
    expect((await call()).status).toBe(403);
  });

  it("should map an on-chain failure to 502 without leaking details", async () => {
    const { call, chain } = setup(table());
    chain.join.mockRejectedValue(new Error("secret rpc detail"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});
