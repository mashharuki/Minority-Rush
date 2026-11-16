import { errorMessage } from "@/lib/types";

import type { PokerClient } from "./client";
import { applyOptimistic, secondsLeft as secondsLeftFrom } from "./rules";
import type { PokerAction, TableView } from "./types";

export type TableState = {
  view: TableView | null;
  /** The OPPONENT's card (1..13) once decrypted. Never the caller's own card. */
  opponentCard: number | null;
  busy: string | null;
  error: string | null;
};

export type TableController = {
  getState(): TableState;
  subscribe(listener: () => void): () => void;
  /** Starts (or restarts) following a table. Resets everything decrypted for a previous table or account. */
  start(id: number, account: string): Promise<void>;
  stop(): void;
  poll(): Promise<void>;
  act(action: PokerAction): Promise<void>;
  claimTimeout(): Promise<void>;
  /** Whole seconds left on the turn timer, from chain time. */
  secondsLeft(): number;
};

export type ControllerOptions = { pollMs?: number; now?: () => number };

const EMPTY: TableState = { view: null, opponentCard: null, busy: null, error: null };
const SETTLE_RETRY_MS = 4_000;
const REVEALED_PHASES = new Set(["betting", "ended", "settled"]);

/**
 * Framework-free table logic: polls the chain, shows optimistic moves at once, decrypts the opponent's card as soon as
 * it is dealt, and does the background work (confirm funds, finalize, claim a timeout) so the player never has to.
 */
export function createTableController(client: PokerClient, options: ControllerOptions = {}): TableController {
  const pollMs = options.pollMs ?? 2_000;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();

  let state: TableState = EMPTY;
  let tableId = 0;
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let chainOffsetMs = 0;
  let serverView: TableView | null = null;
  let optimistic: TableView | null = null;
  let revealStarted = false;
  let lastSettle = { key: "", at: 0 };
  let claimedDeadline = -1;

  const chainNow = (): number => now() + chainOffsetMs;
  const set = (patch: Partial<TableState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const step = (gen: number) => (label: string): void => {
    if (gen === generation) set({ busy: label });
  };

  async function reveal(gen: number, view: TableView): Promise<void> {
    if (revealStarted || !view.mySeat || !REVEALED_PHASES.has(view.phase)) return;
    revealStarted = true;
    try {
      const card = await client.revealOpponentCard(tableId);
      if (gen === generation) set({ opponentCard: card });
    } catch (error) {
      revealStarted = false;
      if (gen === generation) set({ error: errorMessage(error) });
    }
  }

  async function settle(gen: number, view: TableView): Promise<void> {
    const due = (view.phase === "betting" && !view.fundsConfirmed) || (view.phase === "ended" && (!view.fundsConfirmed || view.endKind === "showdown"));
    if (!due) return;
    const key = `${view.phase}:${view.fundsConfirmed}`;
    if (lastSettle.key === key && now() - lastSettle.at < SETTLE_RETRY_MS) return;
    lastSettle = { key, at: now() };
    try {
      await client.settleIfReady(tableId, step(gen));
    } catch (error) {
      console.error("settleIfReady failed", { tableId, error: errorMessage(error) });
    } finally {
      if (gen === generation) set({ busy: null });
    }
  }

  async function timeoutIfDue(gen: number, view: TableView): Promise<void> {
    const isOpponentsTurn = view.phase === "betting" && view.turn !== null && view.turn !== view.mySeat;
    if (!isOpponentsTurn || view.turnDeadlineMs === 0 || chainNow() < view.turnDeadlineMs) return;
    if (claimedDeadline === view.turnDeadlineMs) return;
    claimedDeadline = view.turnDeadlineMs;
    try {
      await client.claimTimeout(tableId, step(gen));
    } catch (error) {
      console.error("claimTimeout failed", { tableId, error: errorMessage(error) });
    } finally {
      if (gen === generation) set({ busy: null });
    }
  }

  function stop(): void {
    generation += 1;
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function poll(): Promise<void> {
    const gen = generation;
    if (tableId === 0) return;
    let view: TableView;
    try {
      const [v, chain] = await Promise.all([client.getTable(tableId), client.chainNowMs()]);
      if (gen !== generation) return;
      chainOffsetMs = chain - now();
      view = v;
    } catch (error) {
      if (gen === generation) set({ error: errorMessage(error) });
      return;
    }
    serverView = view;
    if (optimistic && view.history.length >= optimistic.history.length) optimistic = null;
    set({ view: optimistic ?? view, error: null });
    await reveal(gen, view);
    await settle(gen, view);
    await timeoutIfDue(gen, view);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start(id, account) {
      void account; // a new account always means a fresh start: nothing decrypted for another account may survive
      stop();
      generation += 1;
      tableId = id;
      serverView = null;
      optimistic = null;
      revealStarted = false;
      lastSettle = { key: "", at: 0 };
      claimedDeadline = -1;
      state = EMPTY;
      listeners.forEach((l) => l());
      await poll();
      if (pollMs > 0) timer = setInterval(() => void poll(), pollMs);
    },
    stop,
    poll,
    async act(action) {
      const gen = generation;
      const base = optimistic ?? serverView;
      if (!base?.mySeat) return;
      const next = applyOptimistic(base, base.mySeat, action, chainNow());
      if (next === base) return;
      optimistic = next;
      set({ view: next, busy: "Sending your move", error: null });
      try {
        await client.act(tableId, action, step(gen));
      } catch (error) {
        optimistic = null;
        if (gen === generation) set({ view: serverView, error: errorMessage(error) });
        return;
      } finally {
        if (gen === generation) set({ busy: null });
      }
      await poll();
    },
    async claimTimeout() {
      const gen = generation;
      try {
        await client.claimTimeout(tableId, step(gen));
      } catch (error) {
        if (gen === generation) set({ error: errorMessage(error) });
      } finally {
        if (gen === generation) set({ busy: null });
      }
      await poll();
    },
    secondsLeft() {
      const view = state.view;
      if (!view || view.turnDeadlineMs === 0) return 0;
      return secondsLeftFrom(view.turnDeadlineMs, chainNow());
    },
  };
}
