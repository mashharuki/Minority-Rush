import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { createPublicClient, encodeFunctionData, http, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

import abis from "@/contracts/abi.json";
import { env } from "./env";
import type { Session } from "./session";
import { faucetAvailableAtSec, FAUCET_COOLDOWN_SECONDS, isFaucetReady } from "./faucet";
import { isAlreadyDoneRevert, isSettleStepDone, nextSettleStep, type SettleStep } from "./settleQueue";
import {
  MAX_STAKE,
  MIN_STAKE,
  revertErrorName,
  type DailyChips,
  type GameClient,
  type MyResult,
  type OnStep,
  type Outcome,
  type RoundRecord,
  type RoundState,
  type RoundStatus,
  type Schedule,
  type Side,
} from "./types";
import { outcomeOf } from "./outcomes";

const chipAbi = abis.rushChipAbi as Abi;
const gameAbi = abis.gameAbi as Abi;
const ZERO_HANDLE = `0x${"0".repeat(64)}`;
const OPERATOR_VALIDITY_SECONDS = 7 * 24 * 3600;
const STATUS: RoundStatus[] = ["none", "open", "closing", "settled", "cancelled"];

type RoundTuple = [bigint, bigint, number, number, boolean, Hex];
/** getEntry: entered, claimed, choice, stake, reward. */
type EntryTuple = [boolean, boolean, Hex, Hex, Hex];
type Call = { to: Address; data: Hex };

const SETTLE_STEP_LABEL: Record<SettleStep, string> = {
  close: "Closing the round",
  finalize: "Publishing the verified result",
};

/**
 * Live Sepolia client: viem for chain IO, @zama-fhe/sdk for encryption and decryption.
 * Who plays (injected wallet or Privy smart account) is abstracted by the `Session` that `connectSession` builds.
 */
export function createLiveClient(connectSession: () => Promise<Session>): GameClient {
  const chip = env.chipAddress as Address;
  const game = env.gameAddress as Address;
  const publicClient: PublicClient = createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) });

  let session: Session | null = null;
  let sdk: ZamaSDK | null = null;

  const requireSession = (): Session => {
    if (!session || !sdk) throw new Error("Not connected");
    return session;
  };

  const read = <T,>(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> =>
    publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

  const call = (to: Address, abi: Abi, functionName: string, args: unknown[]): { to: Address; data: Hex } => ({
    to,
    data: encodeFunctionData({ abi, functionName, args }),
  });

  const write = (to: Address, abi: Abi, functionName: string, args: unknown[], onStep: OnStep): Promise<void> =>
    requireSession().send([call(to, abi, functionName, args)], onStep);

  const latestRoundId = async (): Promise<number> => Number(await read<bigint>(game, gameAbi, "latestRoundId"));

  async function getRound(): Promise<RoundState> {
    const id = await latestRoundId();
    const empty: RoundState = { id: 0, status: "none", endTime: 0, playerCount: 0, hasEntered: false, hasClaimed: false, winner: null };
    if (id === 0) return empty;
    const [, endTime, status, playerCount, moonWon] = await read<RoundTuple>(game, gameAbi, "getRound", [BigInt(id)]);
    let hasEntered = false;
    let hasClaimed = false;
    if (session) {
      [hasEntered, hasClaimed] = await read<[boolean, boolean]>(game, gameAbi, "getEntry", [BigInt(id), session.account]);
    }
    const mapped = STATUS[Number(status)] ?? "none";
    return {
      id,
      status: mapped,
      endTime: Number(endTime) * 1000,
      playerCount: Number(playerCount),
      hasEntered,
      hasClaimed,
      winner: mapped === "settled" ? (moonWon ? "moon" : "sun") : null,
    };
  }

  const roundStatus = async (roundId: number): Promise<RoundStatus> => {
    const [, , status] = await read<RoundTuple>(game, gameAbi, "getRound", [BigInt(roundId)]);
    return STATUS[Number(status)] ?? "none";
  };

  /**
   * Simulates, then sends one settle step. Skipped when the simulation says another client already did it; a write
   * that loses the same race (the round moved on in between) also counts as done.
   */
  const sendSettleStep = async (step: SettleStep, roundId: number, args: unknown[], onStep: OnStep): Promise<void> => {
    const functionName = step === "close" ? "closeRound" : "finalizeRound";
    try {
      await publicClient.simulateContract({ address: game, abi: gameAbi, functionName, args, account: requireSession().account });
    } catch (error) {
      if (isAlreadyDoneRevert(step, revertErrorName(error))) return;
      throw error;
    }
    onStep(SETTLE_STEP_LABEL[step]);
    try {
      await write(game, gameAbi, functionName, args, onStep);
    } catch (error) {
      if (!isSettleStepDone(step, await roundStatus(roundId))) throw error;
      console.info("settle step already done by another client", { step, roundId });
    }
  };

  /** Public-decrypts the Closing round's winner flag and finalizes with the proof. */
  const finalize = async (roundId: number, onStep: OnStep): Promise<void> => {
    onStep("Computing on encrypted stakes");
    const [, , , , , handle] = await read<RoundTuple>(game, gameAbi, "getRound", [BigInt(roundId)]);
    const { clearValues, decryptionProof } = await sdk!.decryption.decryptPublicValues([handle]);
    const moonWon = Boolean(Object.values(clearValues)[0]);
    await sendSettleStep("finalize", roundId, [BigInt(roundId), moonWon, decryptionProof], onStep);
  };

  /** Close, then finalize, any round id; at most one pass per step. */
  const settle = async (roundId: number, onStep: OnStep): Promise<void> => {
    requireSession();
    if (nextSettleStep(await roundStatus(roundId)) === "close") {
      await sendSettleStep("close", roundId, [BigInt(roundId)], onStep);
    }
    if (nextSettleStep(await roundStatus(roundId)) === "finalize") await finalize(roundId, onStep);
  };

  /**
   * Past its deadline an Open round still blocks startRound, so close it first. A Closing round does not block; the
   * home screen finalizes it afterwards from the history.
   */
  const ensureRound = async (onStep: OnStep): Promise<number> => {
    const current = await getRound();
    if (current.status === "open" && Date.now() < current.endTime) return current.id;
    if (current.status === "open") await sendSettleStep("close", current.id, [BigInt(current.id)], onStep);
    // Writes are ABI-less calldata, so a revert would surface undecoded; simulate to get the named custom error.
    await publicClient.simulateContract({ address: game, abi: gameAbi, functionName: "startRound", account: requireSession().account });
    onStep("Opening a new round");
    await write(game, gameAbi, "startRound", [], onStep);
    return latestRoundId();
  };

  const decryptOne = async (handle: Hex, contract: Address): Promise<bigint> => {
    if (handle === ZERO_HANDLE) return 0n;
    await sdk!.permits.grantPermit([contract]);
    const values = await sdk!.decryption.decryptValues([{ encryptedValue: handle, contractAddress: contract }]);
    return BigInt(values[handle] as bigint | boolean | string);
  };

  /** Faucet cooldown, compared against the latest block timestamp like the contract does. */
  const faucetStatus = async (s: Session): Promise<{ isReady: boolean; availableAtSec: bigint; nowSec: bigint }> => {
    const lastFaucet = await read<bigint>(chip, chipAbi, "lastFaucetAt", [s.account]);
    const { timestamp } = await publicClient.getBlock();
    return { isReady: isFaucetReady(lastFaucet, timestamp), availableAtSec: faucetAvailableAtSec(lastFaucet), nowSec: timestamp };
  };

  /** Everything a new player needs, as one batch: observer (smart accounts), starter chips, operator approval. */
  const onboardingCalls = async (s: Session): Promise<Call[]> => {
    const calls: Call[] = [];
    if (s.needsObserver) {
      const observer = await read<Address>(chip, chipAbi, "observer", [s.account]);
      if (observer.toLowerCase() !== s.owner.toLowerCase()) calls.push(call(chip, chipAbi, "setObserver", [s.account, s.owner]));
    }
    if ((await faucetStatus(s)).isReady) calls.push(call(chip, chipAbi, "faucet", []));
    if (!(await read<boolean>(chip, chipAbi, "isOperator", [s.account, game]))) {
      const until = Math.floor(Date.now() / 1000) + OPERATOR_VALIDITY_SECONDS;
      calls.push(call(chip, chipAbi, "setOperator", [game, until]));
    }
    return calls;
  };

  return {
    mode: "live",

    async connect() {
      session = await connectSession();
      const chain = { ...fheSepolia, network: env.rpcUrl } as const satisfies FheChain;
      sdk = new ZamaSDK(
        createConfig({ chains: [chain], publicClient, walletClient: session.ownerWalletClient, relayers: { [chain.id]: web() } }),
      );
      return session.account;
    },

    async onboard(onStep) {
      const s = requireSession();
      const calls = await onboardingCalls(s);
      if (calls.length > 0) await s.send(calls, onStep);
    },

    getRound,

    async readBalance() {
      const s = requireSession();
      const handle = await read<Hex>(chip, chipAbi, "confidentialBalanceOf", [s.account]);
      return Number(await decryptOne(handle, chip));
    },

    async enter(side: Side, stake: number, onStep): Promise<number> {
      const s = requireSession();
      const roundId = await ensureRound(onStep);
      onStep("Encrypting your move");
      const { encryptedValues, inputProof } = await sdk!.encrypt({
        values: [
          { type: "euint8", value: side === "moon" ? 1n : 0n },
          { type: "euint64", value: BigInt(Math.min(MAX_STAKE, Math.max(MIN_STAKE, stake))) },
        ],
        contractAddress: game,
        userAddress: s.account, // the on-chain msg.sender (smart account for gasless play)
      });
      onStep("Sealing on Sepolia");
      await write(game, gameAbi, "enter", [BigInt(roundId), encryptedValues[0], encryptedValues[1], inputProof], onStep);
      return roundId;
    },

    settle,

    async claimDailyChips(onStep): Promise<DailyChips> {
      const s = requireSession();
      const status = await faucetStatus(s);
      if (!status.isReady) return { claimed: false, availableAtMs: Number(status.availableAtSec) * 1000 };
      onStep("Minting today's chips");
      await write(chip, chipAbi, "faucet", [], onStep);
      return { claimed: true, availableAtMs: Number(status.nowSec + FAUCET_COOLDOWN_SECONDS) * 1000 };
    },

    async getSchedule(): Promise<Schedule> {
      const [deadlinesUtc, window] = await read<[readonly number[], number]>(game, gameAbi, "schedule");
      return { deadlinesUtcSec: deadlinesUtc.map(Number), windowSec: Number(window) };
    },

    async getRecentRounds(count): Promise<RoundRecord[]> {
      const latest = await latestRoundId();
      const first = Math.max(1, latest - count + 1);
      const ids = Array.from({ length: Math.max(0, latest - first + 1) }, (_, i) => first + i);
      if (ids.length === 0) return [];
      const player = session?.account;
      const contracts = ids.flatMap((id) => [
        { address: game, abi: gameAbi, functionName: "getRound", args: [BigInt(id)] },
        ...(player ? [{ address: game, abi: gameAbi, functionName: "getEntry", args: [BigInt(id), player] }] : []),
      ]);
      const results = await publicClient.multicall({ contracts, allowFailure: false });
      const stride = player ? 2 : 1;
      return ids.map((id, i): RoundRecord => {
        const [, endTime, status, , moonWon] = results[i * stride] as RoundTuple;
        const entry = player ? (results[i * stride + 1] as EntryTuple) : null;
        const mapped = STATUS[Number(status)] ?? "none";
        return {
          id,
          endTime: Number(endTime),
          status: mapped,
          entered: entry?.[0] ?? false,
          claimed: entry?.[1] ?? false,
          winner: mapped === "settled" ? (moonWon ? "moon" : "sun") : null,
        };
      });
    },

    async getOutcomes(records): Promise<ReadonlyMap<number, Outcome>> {
      const outcomes = new Map<number, Outcome>();
      const toDecrypt = records.filter((r) => r.entered && r.status === "settled");
      for (const r of records) if (!toDecrypt.includes(r)) outcomes.set(r.id, outcomeOf(r, null));
      if (toDecrypt.length === 0) return outcomes;
      const s = requireSession();
      const entries = await publicClient.multicall({
        contracts: toDecrypt.map((r) => ({ address: game, abi: gameAbi, functionName: "getEntry", args: [BigInt(r.id), s.account] })),
        allowFailure: false,
      });
      const handles = entries.map((e) => (e as EntryTuple)[2]);
      await sdk!.permits.grantPermit([game]);
      const values = await sdk!.decryption.decryptValues(handles.map((h) => ({ encryptedValue: h, contractAddress: game })));
      toDecrypt.forEach((r, i) => {
        const choice = BigInt(values[handles[i]!] as bigint | boolean | string);
        outcomes.set(r.id, outcomeOf(r, choice === 1n ? "moon" : "sun"));
      });
      return outcomes;
    },

    async claim(roundId, onStep): Promise<MyResult> {
      const s = requireSession();
      const id = BigInt(roundId);
      const [, , status, , moonWon] = await read<RoundTuple>(game, gameAbi, "getRound", [id]);
      const [, hasClaimed] = await read<EntryTuple>(game, gameAbi, "getEntry", [id, s.account]);
      if (!hasClaimed) {
        onStep("Collecting your payout");
        await write(game, gameAbi, "claim", [id], onStep);
      }
      onStep("Decrypting your reward");
      const entry = await read<EntryTuple>(game, gameAbi, "getEntry", [id, s.account]);
      const reward = Number(await decryptOne(entry[4], game));
      const choice = Number(await decryptOne(entry[2], game));
      const mapped = STATUS[Number(status)] ?? "none";
      const winner: Side | null = mapped === "settled" ? (moonWon ? "moon" : "sun") : null;
      const cancelled = mapped === "cancelled";
      const won = !cancelled && winner !== null && (winner === "moon") === (choice === 1);
      return { winner, won, reward, cancelled };
    },
  };
}
