import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";

import abis from "@/contracts/abi.json";
import { env } from "./env";
import { errorMessage, MAX_STAKE, MIN_STAKE, type GameClient, type MyResult, type OnStep, type RoundState, type RoundStatus, type Side } from "./types";

const chipAbi = abis.rushChipAbi as Abi;
const gameAbi = abis.gameAbi as Abi;
const ZERO_HANDLE = `0x${"0".repeat(64)}`;
const OPERATOR_VALIDITY_SECONDS = 7 * 24 * 3600;
const STATUS: RoundStatus[] = ["none", "open", "closing", "settled", "cancelled"];

type EthereumWindow = Window & { ethereum?: EIP1193Provider };

/** Live Sepolia client: viem for chain IO, @zama-fhe/sdk for encryption and decryption. */
export function createLiveClient(): GameClient {
  const chip = env.chipAddress as Address;
  const game = env.gameAddress as Address;
  const ethereum = (window as EthereumWindow).ethereum;

  let account: Address | null = null;
  let walletClient: WalletClient | null = null;
  let sdk: ZamaSDK | null = null;
  const publicClient: PublicClient = createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) });

  const requireAccount = (): Address => {
    if (!account || !walletClient || !sdk) throw new Error("Wallet not connected");
    return account;
  };

  const read = <T,>(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> =>
    publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

  const write = async (address: Address, abi: Abi, functionName: string, args: unknown[]): Promise<void> => {
    const from = requireAccount();
    const hash = await walletClient!.writeContract({ address, abi, functionName, args, account: from, chain: sepolia });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  };

  const latestRoundId = async (): Promise<number> => Number(await read<bigint>(game, gameAbi, "latestRoundId"));

  const ensureRound = async (onStep: OnStep): Promise<number> => {
    const current = await getRound();
    const needsNew = current.status === "none" || current.status === "settled" || current.status === "cancelled";
    if (!needsNew) return current.id;
    onStep("Opening a new round");
    await write(game, gameAbi, "startRound", []);
    return latestRoundId();
  };

  async function getRound(): Promise<RoundState> {
    const id = await latestRoundId();
    const empty: RoundState = { id: 0, status: "none", endTime: 0, playerCount: 0, hasEntered: false, hasClaimed: false, winner: null };
    if (id === 0) return empty;
    const [, endTime, status, playerCount, moonWon] = await read<[bigint, bigint, number, number, boolean, Hex]>(
      game, gameAbi, "getRound", [BigInt(id)],
    );
    let hasEntered = false;
    let hasClaimed = false;
    if (account) {
      const entry = await read<[boolean, boolean]>(game, gameAbi, "getEntry", [BigInt(id), account]);
      [hasEntered, hasClaimed] = entry;
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

  const decryptOne = async (handle: Hex, contract: Address): Promise<bigint> => {
    if (handle === ZERO_HANDLE) return 0n;
    await sdk!.permits.grantPermit([contract]);
    const values = await sdk!.decryption.decryptValues([{ encryptedValue: handle, contractAddress: contract }]);
    return BigInt(values[handle] as bigint | boolean | string);
  };

  return {
    mode: "live",

    async connect() {
      if (!ethereum) throw new Error("No wallet found. Install MetaMask or another EIP-1193 wallet.");
      const [address] = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
      if (!address) throw new Error("No account selected");
      try {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
      } catch (error) {
        console.error("connect: switching to Sepolia failed", errorMessage(error));
        throw new Error("Please switch your wallet to Sepolia");
      }
      account = address;
      walletClient = createWalletClient({ account: address, chain: sepolia, transport: custom(ethereum) });
      const chain = { ...fheSepolia, network: env.rpcUrl } as const satisfies FheChain;
      sdk = new ZamaSDK(
        createConfig({ chains: [chain], publicClient, walletClient, relayers: { [chain.id]: web() } }),
      );
      return address;
    },

    async onboard(onStep) {
      const from = requireAccount();
      const lastFaucet = await read<bigint>(chip, chipAbi, "lastFaucetAt", [from]);
      if (lastFaucet === 0n) {
        onStep("Claiming starter chips");
        await write(chip, chipAbi, "faucet", []);
      }
      const isOperator = await read<boolean>(chip, chipAbi, "isOperator", [from, game]);
      if (!isOperator) {
        onStep("Letting the game pull your stake");
        const until = Math.floor(Date.now() / 1000) + OPERATOR_VALIDITY_SECONDS;
        await write(chip, chipAbi, "setOperator", [game, until]);
      }
    },

    getRound,

    async readBalance() {
      const from = requireAccount();
      const handle = await read<Hex>(chip, chipAbi, "confidentialBalanceOf", [from]);
      return Number(await decryptOne(handle, chip));
    },

    async enter(side: Side, stake: number, onStep) {
      const from = requireAccount();
      const roundId = await ensureRound(onStep);
      onStep("Encrypting your move");
      const { encryptedValues, inputProof } = await sdk!.encrypt({
        values: [
          { type: "euint8", value: side === "moon" ? 1n : 0n },
          { type: "euint64", value: BigInt(Math.min(MAX_STAKE, Math.max(MIN_STAKE, stake))) },
        ],
        contractAddress: game,
        userAddress: from,
      });
      onStep("Sealing on Sepolia");
      await write(game, gameAbi, "enter", [BigInt(roundId), encryptedValues[0], encryptedValues[1], inputProof]);
    },

    async settle(onStep) {
      let round = await getRound();
      if (round.status === "open") {
        onStep("Closing the round");
        await write(game, gameAbi, "closeRound", [BigInt(round.id)]);
        round = await getRound();
      }
      if (round.status !== "closing") return;
      onStep("Computing on encrypted stakes");
      const [, , , , , handle] = await read<[bigint, bigint, number, number, boolean, Hex]>(
        game, gameAbi, "getRound", [BigInt(round.id)],
      );
      const { clearValues, decryptionProof } = await sdk!.decryption.decryptPublicValues([handle]);
      const moonWon = Boolean(Object.values(clearValues)[0]);
      onStep("Publishing the verified result");
      await write(game, gameAbi, "finalizeRound", [BigInt(round.id), moonWon, decryptionProof]);
    },

    async claim(onStep): Promise<MyResult> {
      const from = requireAccount();
      const round = await getRound();
      if (!round.hasClaimed) {
        onStep("Collecting your payout");
        await write(game, gameAbi, "claim", [BigInt(round.id)]);
      }
      onStep("Decrypting your reward");
      const entry = await read<[boolean, boolean, Hex, Hex, Hex]>(game, gameAbi, "getEntry", [BigInt(round.id), from]);
      const reward = Number(await decryptOne(entry[4], game));
      const choice = Number(await decryptOne(entry[2], game));
      const cancelled = round.status === "cancelled";
      const won = !cancelled && round.winner !== null && (round.winner === "moon") === (choice === 1);
      return { winner: round.winner, won, reward, cancelled };
    },
  };
}
