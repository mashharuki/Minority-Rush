import { z } from "zod";

import type { BotConfig } from "./config";
import type { RateLimiter } from "./rateLimit";
import { decideAction } from "./strategy";
import type { PokerAction, Seat } from "./types";

export type Phase = "none" | "open" | "betting" | "ended" | "settled" | "voided" | "cancelled";

export type TableSnapshot = {
  id: bigint;
  a: string;
  b: string | null;
  phase: Phase;
  turn: Seat | null;
  history: PokerAction[];
  fundsConfirmed: boolean;
  showdown: boolean;
  /** Unix seconds; 0 when no timer runs. `nowSec` is the latest block time (never the server clock). */
  turnDeadlineSec: number;
  nowSec: number;
};

/** Everything the bot does on-chain. The real adapter is `chain.ts`; tests inject a fake. */
export type Chain = {
  botAddress: string;
  readTable(id: bigint): Promise<TableSnapshot>;
  join(id: bigint): Promise<void>;
  act(id: bigint, action: PokerAction): Promise<void>;
  confirmFunds(id: bigint): Promise<void>;
  finalizeShowdown(id: bigint): Promise<void>;
  claimTimeout(id: bigint): Promise<void>;
  /** Tables the bot currently plays (seated as B, not finished). */
  activeBotTables(): Promise<{ id: bigint; creator: string }[]>;
  /** `chips` is null when the balance cannot be read; the chip check is then skipped. */
  balances(): Promise<{ ethWei: bigint; chips: number | null }>;
};

export type Deps = {
  config: BotConfig;
  limiter: RateLimiter;
  /** Returns the Privy user id for a valid access token, otherwise null. */
  verifyToken: (token: string) => Promise<{ userId: string } | null>;
  /** EIP-191 personal-message check: did `address` sign `message`? */
  verifySignature: (address: string, message: string, signature: string) => Promise<boolean>;
  chain: Chain;
  /** Decrypts the card held by `ownerSeat`. The handler only ever asks for the OPPONENT's seat (A). */
  decryptCard: (tableId: bigint, ownerSeat: Seat) => Promise<number>;
  random: () => number;
};

export type BotRequest = { method: string; headers: Record<string, string | undefined>; body: unknown };
export type BotResponse = { status: number; headers: Record<string, string>; body: unknown };

const bodySchema = z.object({
  tableId: z.number().int().positive(),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .optional(),
});

const BOT_SEAT: Seat = "B";
const HUMAN_SEAT: Seat = "A";
const same = (x: string, y: string): boolean => x.toLowerCase() === y.toLowerCase();

const cors = (origin: string | undefined, allowed: string[]): Record<string, string> =>
  origin && allowed.includes(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "POST, OPTIONS",
        vary: "Origin",
      }
    : {};

const fail = (status: number, reason: string, headers: Record<string, string>): BotResponse => ({
  status,
  headers,
  body: { ok: false, reason },
});

const done = (action: string, phase: Phase, headers: Record<string, string>): BotResponse => ({
  status: 200,
  headers,
  body: { ok: true, action, phase },
});

async function authenticate(
  req: BotRequest,
  tableId: bigint,
  signature: string | undefined,
  deps: Deps,
): Promise<string | null> {
  const header = req.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (bearer) return (await deps.verifyToken(bearer))?.userId ?? null;
  if (!signature) return null;
  const table = await deps.chain.readTable(tableId);
  if (table.phase === "none") return null;
  const isCreator = await deps.verifySignature(table.a, `bot:${tableId}`, signature);
  return isCreator ? `addr:${table.a.toLowerCase()}` : null;
}

/** Checks the caps and the bankroll before the bot takes a new table. Returns the refusal reason, if any. */
async function refusalForNewTable(table: TableSnapshot, deps: Deps): Promise<string | null> {
  const active = await deps.chain.activeBotTables();
  if (active.length >= deps.config.maxTables) return "bot_busy";
  if (active.some((t) => same(t.creator, table.a))) return "bot_busy";
  const { ethWei, chips } = await deps.chain.balances();
  if (ethWei < deps.config.minEthWei) return "bot_broke";
  if (chips !== null && chips < deps.config.minChips) return "bot_broke";
  return null;
}

/** Advances the bot by exactly one step on this table. Idempotent: safe to call at any time. */
async function advance(table: TableSnapshot, deps: Deps, headers: Record<string, string>): Promise<BotResponse> {
  const { chain } = deps;
  const id = table.id;
  const phase = table.phase;

  if (phase === "open") {
    const refusal = await refusalForNewTable(table, deps);
    if (refusal) return fail(503, refusal, headers);
    await chain.join(id);
    return done("joined", phase, headers);
  }
  if (phase !== "betting" && phase !== "ended") return done("none", phase, headers);
  if (!table.b || !same(table.b, chain.botAddress)) return fail(403, "not_bot_table", headers);

  if (!table.fundsConfirmed) {
    await chain.confirmFunds(id);
    if (phase === "ended" || table.turn !== BOT_SEAT) return done("confirmed", phase, headers);
  }
  if (phase === "ended") {
    if (!table.showdown) return done("none", phase, headers);
    await chain.finalizeShowdown(id);
    return done("finalized", phase, headers);
  }
  if (table.turn === BOT_SEAT) {
    const opponentCard = await deps.decryptCard(id, HUMAN_SEAT);
    const action = decideAction(opponentCard, table.history, BOT_SEAT, deps.random);
    await chain.act(id, action);
    return done("acted", phase, headers);
  }
  if (table.turnDeadlineSec > 0 && table.nowSec > table.turnDeadlineSec) {
    await chain.claimTimeout(id);
    return done("claimed", phase, headers);
  }
  return done("none", phase, headers);
}

export async function handleBotRequest(req: BotRequest, deps: Deps): Promise<BotResponse> {
  const headers = cors(req.headers.origin, deps.config.allowedOrigins);
  const originAllowed = Boolean(headers["access-control-allow-origin"]);
  if (req.method === "OPTIONS") return { status: originAllowed ? 204 : 403, headers, body: null };
  if (req.method !== "POST") return fail(405, "method_not_allowed", headers);
  if (!originAllowed) return fail(403, "origin_not_allowed", headers);

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return fail(400, "invalid_request", headers);
  const tableId = BigInt(parsed.data.tableId);

  try {
    const userId = await authenticate(req, tableId, parsed.data.signature, deps);
    if (!userId) return fail(401, "unauthorized", headers);
    if (!deps.limiter.allow(userId)) return fail(429, "rate_limited", headers);

    const table = await deps.chain.readTable(tableId);
    if (table.phase === "none") return fail(404, "unknown_table", headers);
    if (same(table.a, deps.chain.botAddress)) return fail(403, "own_table", headers);
    return await advance(table, deps, headers);
  } catch (error) {
    // Server logs only: the response never carries RPC details.
    console.error("bot request failed", {
      tableId: String(tableId),
      message: error instanceof Error ? error.message : "unknown",
    });
    return fail(502, "upstream_error", headers);
  }
}
