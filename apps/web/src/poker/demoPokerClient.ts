import type { OnStep, PokerClient } from "./client";
import { legalActions, seatOnTurn } from "./rules";
import type { PokerAction, Seat, TablePhase, TableView } from "./types";

const START_BALANCE = 20;
const DEPOSIT = 2;
const TURN_MS = 45_000;

type DemoTable = {
  id: number;
  phase: TablePhase;
  history: PokerAction[];
  contribA: number;
  contribB: number;
  cardA: number;
  cardB: number;
  turnDeadlineMs: number;
  winner: Seat | null;
  endKind: "fold" | "showdown" | null;
};

export type DemoOptions = { botDelayMs?: number };

const randomCards = (): [number, number] => {
  const a = 1 + Math.floor(Math.random() * 13);
  let b = 1 + Math.floor(Math.random() * 12);
  if (b >= a) b += 1;
  return [a, b];
};

/** Offline simulation: the human always sits in seat A against a built-in bot in seat B. Nothing is encrypted. */
export function createDemoPokerClient(options: DemoOptions = {}): PokerClient {
  const botDelayMs = options.botDelayMs ?? 700;
  const tables = new Map<number, DemoTable>();
  let balance = START_BALANCE;
  let nextId = 1;

  const get = (id: number): DemoTable => {
    const t = tables.get(id);
    if (!t) throw new Error("Unknown table");
    return t;
  };

  /** Ends the hand and pays out like the contract: unused deposit back, the winner takes everything put in. */
  const finish = (t: DemoTable, loser: Seat | null): void => {
    const winner: Seat = loser ? (loser === "A" ? "B" : "A") : t.cardA > t.cardB ? "A" : "B";
    t.winner = winner;
    t.endKind = loser ? "fold" : "showdown";
    t.phase = "settled";
    t.turnDeadlineMs = 0;
    balance += DEPOSIT - t.contribA + (winner === "A" ? t.contribA + t.contribB : 0);
  };

  const apply = (t: DemoTable, seat: Seat, action: PokerAction): void => {
    t.history.push(action);
    const adds = action === "bet" || action === "call" ? 1 : 0;
    if (seat === "A") t.contribA += adds;
    else t.contribB += adds;
    if (action === "fold") return finish(t, seat);
    if (seatOnTurn(t.history) === null) return finish(t, null);
    t.turnDeadlineMs = Date.now() + TURN_MS;
    if (seatOnTurn(t.history) === "B") setTimeout(() => botMove(t), botDelayMs);
  };

  /** The bot sees the human's card (rule of the game) and bets more often against low cards. */
  const botMove = (t: DemoTable): void => {
    if (t.phase !== "betting" || seatOnTurn(t.history) !== "B") return;
    const legal = legalActions(t.history);
    const strong = t.cardA <= 6 || Math.random() < 0.15;
    const pick = (aggressive: PokerAction, passive: PokerAction): PokerAction => (strong ? aggressive : passive);
    const action = legal.includes("bet") ? pick("bet", "check") : pick("call", "fold");
    apply(t, "B", action);
  };

  const view = (t: DemoTable): TableView => ({
    id: t.id,
    phase: t.phase,
    playerA: "0xDemoYou",
    playerB: t.phase === "open" || t.phase === "cancelled" ? null : "0xDemoBot",
    mySeat: "A",
    turn: t.phase === "betting" ? seatOnTurn(t.history) : null,
    turnDeadlineMs: t.turnDeadlineMs,
    history: [...t.history],
    contribA: t.contribA,
    contribB: t.contribB,
    fundsConfirmed: t.phase !== "open",
    winner: t.winner,
    endKind: t.endKind,
  });

  return {
    mode: "demo",
    async connect() {
      return "0xDemoYou";
    },
    async onboard(_onStep: OnStep) {
      return;
    },
    async readBalance() {
      return balance;
    },
    async createTable(_opponent, _onStep) {
      if (balance < DEPOSIT) throw new Error("Not enough chips");
      balance -= DEPOSIT;
      const [cardA, cardB] = randomCards();
      const t: DemoTable = {
        id: nextId++,
        phase: "open",
        history: [],
        contribA: 1,
        contribB: 1,
        cardA,
        cardB,
        turnDeadlineMs: 0,
        winner: null,
        endKind: null,
      };
      tables.set(t.id, t);
      setTimeout(() => {
        t.phase = "betting";
        t.turnDeadlineMs = Date.now() + TURN_MS;
      }, botDelayMs);
      return t.id;
    },
    async joinTable() {
      throw new Error("Demo tables are played against the built-in bot");
    },
    async cancelTable(id) {
      const t = get(id);
      if (t.phase !== "open") throw new Error("Table is not open");
      t.phase = "cancelled";
      balance += DEPOSIT;
    },
    async act(id, action) {
      const t = get(id);
      if (t.phase !== "betting" || seatOnTurn(t.history) !== "A") throw new Error("Not your turn");
      if (!legalActions(t.history).includes(action)) throw new Error("Illegal action");
      apply(t, "A", action);
    },
    async claimTimeout(id) {
      const t = get(id);
      if (t.phase !== "betting" || Date.now() <= t.turnDeadlineMs) throw new Error("Deadline not reached");
      finish(t, seatOnTurn(t.history));
    },
    async getTable(id) {
      return view(get(id));
    },
    async listOpenTables() {
      return [];
    },
    async revealOpponentCard(id) {
      const t = get(id);
      if (t.phase === "open") throw new Error("Table is not dealt yet");
      return t.cardB;
    },
    async settleIfReady() {
      return;
    },
    async chainNowMs() {
      return Date.now();
    },
  };
}
