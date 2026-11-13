import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { createPublicClient, encodeFunctionData, http, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

import abis from "@/contracts/abi.json";
import { env } from "./env";
import type { Session } from "./session";
import {
  MAX_STAKE,
  MIN_STAKE,
  type GameClient,
  type MyResult,
  type OnStep,
  type RoundState,
  type RoundStatus,
  type Side,
} from "./types";

const chipAbi = abis.rushChipAbi as Abi;
const gameAbi = abis.gameAbi as Abi;
const ZERO_HANDLE = `0x${"0".repeat(64)}`;
const OPERATOR_VALIDITY_SECONDS = 7 * 24 * 3600;
const STATUS: RoundStatus[] = ["none", "open", "closing", "settled", "cancelled"];

type RoundTuple = [bigint, bigint, number, number, boolean, Hex];

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

  const ensureRound = async (onStep: OnStep): Promise<number> => {
    const current = await getRound();
    if (current.status === "open" || current.status === "closing") return current.id;
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

  /** Everything a new player needs, as one batch: observer (smart accounts), starter chips, operator approval. */
  const onboardingCalls = async (s: Session): Promise<{ to: Address; data: Hex }[]> => {
    const calls: { to: Address; data: Hex }[] = [];
    if (s.needsObserver) {
      const observer = await read<Address>(chip, chipAbi, "observer", [s.account]);
      if (observer.toLowerCase() !== s.owner.toLowerCase()) calls.push(call(chip, chipAbi, "setObserver", [s.account, s.owner]));
    }
    if ((await read<bigint>(chip, chipAbi, "lastFaucetAt", [s.account])) === 0n) calls.push(call(chip, chipAbi, "faucet", []));
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

    async enter(side: Side, stake: number, onStep) {
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
    },

    async settle(onStep) {
      let round = await getRound();
      if (round.status === "open") {
        onStep("Closing the round");
        await write(game, gameAbi, "closeRound", [BigInt(round.id)], onStep);
        round = await getRound();
      }
      if (round.status !== "closing") return;
      onStep("Computing on encrypted stakes");
      const [, , , , , handle] = await read<RoundTuple>(game, gameAbi, "getRound", [BigInt(round.id)]);
      const { clearValues, decryptionProof } = await sdk!.decryption.decryptPublicValues([handle]);
      const moonWon = Boolean(Object.values(clearValues)[0]);
      onStep("Publishing the verified result");
      await write(game, gameAbi, "finalizeRound", [BigInt(round.id), moonWon, decryptionProof], onStep);
    },

    async claim(onStep): Promise<MyResult> {
      const s = requireSession();
      const round = await getRound();
      if (!round.hasClaimed) {
        onStep("Collecting your payout");
        await write(game, gameAbi, "claim", [BigInt(round.id)], onStep);
      }
      onStep("Decrypting your reward");
      const entry = await read<[boolean, boolean, Hex, Hex, Hex]>(game, gameAbi, "getEntry", [BigInt(round.id), s.account]);
      const reward = Number(await decryptOne(entry[4], game));
      const choice = Number(await decryptOne(entry[2], game));
      const cancelled = round.status === "cancelled";
      const won = !cancelled && round.winner !== null && (round.winner === "moon") === (choice === 1);
      return { winner: round.winner, won, reward, cancelled };
    },
  };
}
