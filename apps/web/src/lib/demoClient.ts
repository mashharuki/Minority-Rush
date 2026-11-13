import type { GameClient, MyResult, OnStep, RoundState, Side } from "./types";

const DEMO_ROUND_MS = 15_000;
const START_BALANCE = 20;

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
  let round: DemoRound | null = null;

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
    },
    async getRound() {
      return toState();
    },
    async readBalance() {
      await sleep(300);
      return balance;
    },
    async enter(side, stake, onStep) {
      onStep("Encrypting your move");
      await sleep(600);
      if (!round || round.winner) {
        const botCount = 2 + Math.floor(Math.random() * 4);
        round = {
          id: (round?.id ?? 0) + 1,
          endTime: Date.now() + DEMO_ROUND_MS,
          mine: null,
          bots: Array.from({ length: botCount }, () => ({
            side: randomSide(),
            stake: 1 + Math.floor(Math.random() * 10),
          })),
          winner: null,
          claimed: false,
        };
      }
      onStep("Sealing on-chain");
      await sleep(600);
      balance -= stake;
      round.mine = { side, stake };
    },
    async settle(onStep) {
      if (!round || round.winner) return;
      onStep("Computing on encrypted stakes");
      await sleep(900);
      const all = [...round.bots, ...(round.mine ? [round.mine] : [])];
      const total = (s: Side): number => all.filter((p) => p.side === s).reduce((sum, p) => sum + p.stake, 0);
      const sun = total("sun");
      const moon = total("moon");
      round.winner = sun === moon ? randomSide() : moon < sun ? "moon" : "sun";
    },
    async claim(onStep): Promise<MyResult> {
      if (!round?.winner || !round.mine) throw new Error("Nothing to claim");
      onStep("Decrypting your reward");
      await sleep(700);
      const won = round.mine.side === round.winner;
      const reward = won ? round.mine.stake * 2 : 0;
      if (!round.claimed) balance += reward;
      round.claimed = true;
      return { winner: round.winner, won, reward, cancelled: false };
    },
  };
}
