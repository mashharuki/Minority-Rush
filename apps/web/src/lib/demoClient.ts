import { outcomeOf } from "./outcomes";
import type { DailyChips, GameClient, MyResult, OnStep, Outcome, RoundRecord, RoundState, Side } from "./types";

const DEMO_ROUND_MS = 15_000;
const START_BALANCE = 20;
const FAUCET_AMOUNT = 20;
const FAUCET_COOLDOWN_MS = 24 * 3600 * 1000;

type DemoRound = {
  id: number;
  endTime: number;
  mine: { side: Side; stake: number } | null;
  bots: { side: Side; stake: number }[];
  winner: Side | null;
  claimed: boolean;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const randomSide = (): Side => (Math.random() < 0.5 ? "sun" : "moon");

/** Offline simulation of the same flow, so the UI can be explored without a deployment. Nothing is encrypted here. */
export function createDemoClient(): GameClient {
  let balance = START_BALANCE;
  /** Onboarding mints the starter chips, like the live faucet; 0 = never. */
  let lastFaucetMs = 0;
  let round: DemoRound | null = null;
  /** Every round created so far (same objects as `round`, so winner/mine stay current). */
  const history: DemoRound[] = [];

  const toRecord = (r: DemoRound): RoundRecord => ({
    id: r.id,
    endTime: Math.floor(r.endTime / 1000),
    status: r.winner ? "settled" : "open",
    entered: r.mine !== null,
    claimed: r.claimed,
    winner: r.winner,
  });

  const findRound = (roundId: number): DemoRound | null => history.find((r) => r.id === roundId) ?? null;

  /** Like the live game: a round past its deadline is never joined; a new one starts. */
  const openRound = (): DemoRound => {
    if (round && !round.winner && Date.now() < round.endTime) return round;
    const botCount = 2 + Math.floor(Math.random() * 4);
    const next: DemoRound = {
      id: (round?.id ?? 0) + 1,
      endTime: Date.now() + DEMO_ROUND_MS,
      mine: null,
      bots: Array.from({ length: botCount }, () => ({ side: randomSide(), stake: 1 + Math.floor(Math.random() * 10) })),
      winner: null,
      claimed: false,
    };
    history.push(next);
    round = next;
    return next;
  };

  const toState = (): RoundState => {
    if (!round) {
      return { id: 0, status: "none", endTime: 0, playerCount: 0, hasEntered: false, hasClaimed: false, winner: null };
    }
    const status = round.winner ? "settled" : "open";
    return {
      id: round.id,
      status,
      endTime: round.endTime,
      playerCount: round.bots.length + (round.mine ? 1 : 0),
      hasEntered: round.mine !== null,
      hasClaimed: round.claimed,
      winner: round.winner,
    };
  };

  return {
    mode: "demo",
    async connect() {
      await sleep(300);
      return "0xDemo000000000000000000000000000000000001";
    },
    async onboard(onStep: OnStep) {
      onStep("Creating private wallet");
      await sleep(500);
      onStep("Minting starter chips");
      await sleep(500);
      if (lastFaucetMs === 0) lastFaucetMs = Date.now();
    },
    async getRound() {
      return toState();
    },
    async readBalance() {
      await sleep(300);
      return balance;
    },
    async enter(side, stake, onStep): Promise<number> {
      onStep("Encrypting your move");
      await sleep(600);
      const target = openRound();
      onStep("Sealing on-chain");
      await sleep(600);
      // Like the chip contract: a balance below the stake transfers (and stakes) 0.
      const staked = balance >= stake ? stake : 0;
      balance -= staked;
      target.mine = { side, stake: staked };
      return target.id;
    },
    async settle(roundId, onStep) {
      const target = findRound(roundId);
      if (!target || target.winner) return;
      onStep("Computing on encrypted stakes");
      await sleep(900);
      const all = [...target.bots, ...(target.mine ? [target.mine] : [])];
      const total = (s: Side): number => all.filter((p) => p.side === s).reduce((sum, p) => sum + p.stake, 0);
      const sun = total("sun");
      const moon = total("moon");
      target.winner = sun === moon ? randomSide() : moon < sun ? "moon" : "sun";
    },
    async claimDailyChips(onStep): Promise<DailyChips> {
      const availableAtMs = lastFaucetMs === 0 ? 0 : lastFaucetMs + FAUCET_COOLDOWN_MS;
      if (Date.now() < availableAtMs) return { claimed: false, availableAtMs };
      onStep("Minting today's chips");
      await sleep(500);
      lastFaucetMs = Date.now();
      balance += FAUCET_AMOUNT;
      return { claimed: true, availableAtMs: lastFaucetMs + FAUCET_COOLDOWN_MS };
    },
    async getSchedule() {
      return null;
    },
    async getRecentRounds(count): Promise<RoundRecord[]> {
      return history.slice(-Math.max(0, count)).map((r) => toRecord(r));
    },
    async getOutcomes(records): Promise<ReadonlyMap<number, Outcome>> {
      const byId = new Map(history.map((r) => [r.id, r]));
      return new Map(records.map((r) => [r.id, outcomeOf(r, byId.get(r.id)?.mine?.side ?? null)]));
    },
    async claim(roundId, onStep): Promise<MyResult> {
      const target = findRound(roundId);
      if (!target?.winner || !target.mine) throw new Error(`Nothing to claim in round ${roundId}`);
      onStep("Decrypting your reward");
      await sleep(700);
      const won = target.mine.side === target.winner;
      const reward = won ? target.mine.stake * 2 : 0;
      if (!target.claimed) balance += reward;
      target.claimed = true;
      return { winner: target.winner, won, reward, cancelled: false };
    },
  };
}
