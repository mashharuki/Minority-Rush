import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { asyncLocalStorage, node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import type { BotConfig } from "./config";
import type { Chain, Phase, TableSnapshot } from "./handler";
import type { PokerAction, Seat } from "./types";

const pokerAbi = parseAbi([
  "error AlreadyConfirmed()",
  "error NotEnded()",
  "error NotBetting()",
  "function tableCount() view returns (uint256)",
  "function getTable(uint256 id) view returns ((address a, address b, uint8 phase, uint8 turn, uint64 turnDeadline, uint8 contribA, uint8 contribB, uint8[] history, bool fundsConfirmed, bool aWon, bool showdown, uint8 loserSeat) info)",
  "function getCardHandles(uint256 id) view returns (bytes32 cardA, bytes32 cardB)",
  "function getFundsHandles(uint256 id) view returns (bytes32 okA, bytes32 okB)",
  "function getShowdownHandle(uint256 id) view returns (bytes32 aWins)",
  "function joinTable(uint256 id)",
  "function act(uint256 id, uint8 action)",
  "function claimTimeout(uint256 id)",
  "function confirmFunds(uint256 id, bool okA, bool okB, bytes proof)",
  "function finalizeShowdown(uint256 id, bool aWins, bytes proof)",
]);

const chipAbi = parseAbi([
  "function isOperator(address holder, address spender) view returns (bool)",
  "function setOperator(address operator, uint48 until)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
]);

const PHASES: Phase[] = ["none", "open", "betting", "ended", "settled", "voided", "cancelled"];
const ACTIONS: PokerAction[] = ["check", "bet", "call", "fold"];
const ALREADY_DONE = new Set(["AlreadyConfirmed", "NotEnded", "NotBetting"]);
const OPERATOR_VALIDITY_SECONDS = 30 * 24 * 3600;
const RECENT_TABLES = 20;

type Sdk = Pick<ZamaSDK, "permits" | "decryption">;

export type BotRuntime = { chain: Chain; decryptCard: (tableId: bigint, ownerSeat: Seat) => Promise<number> };

/** Real on-chain adapter for the bot (viem + the Zama SDK in Node). One SDK per request, as the SDK requires. */
export function createBotRuntime(config: BotConfig): BotRuntime {
  const account = privateKeyToAccount(config.botPrivateKey);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(config.rpcUrl) });
  const fheChain = { ...fheSepolia, network: config.rpcUrl } as const satisfies FheChain;

  const withSdk = async <T,>(work: (sdk: Sdk) => Promise<T>): Promise<T> =>
    asyncLocalStorage.run(async () => {
      const sdk = new ZamaSDK(
        createConfig({
          chains: [fheChain],
          publicClient,
          walletClient,
          storage: asyncLocalStorage,
          relayers: { [fheChain.id]: node() },
        }),
      );
      try {
        return await work(sdk);
      } finally {
        sdk.terminate();
      }
    });

  const write = async (functionName: string, args: unknown[]): Promise<void> => {
    const hash = await walletClient.writeContract({ address: config.poker, abi: pokerAbi, functionName, args } as never);
    await publicClient.waitForTransactionReceipt({ hash });
  };

  /** A step another client already did is not an error. */
  const writeOnce = async (functionName: string, args: unknown[]): Promise<void> => {
    try {
      await write(functionName, args);
    } catch (error) {
      const reverted = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : null;
      const name = reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined;
      if (name && ALREADY_DONE.has(name)) return;
      throw error;
    }
  };

  const readTable = async (id: bigint): Promise<TableSnapshot> => {
    const [info, block] = await Promise.all([
      publicClient.readContract({ address: config.poker, abi: pokerAbi, functionName: "getTable", args: [id] }),
      publicClient.getBlock(),
    ]);
    const phase = PHASES[info.phase] ?? "none";
    const zero = "0x0000000000000000000000000000000000000000";
    return {
      id,
      a: info.a,
      b: info.b.toLowerCase() === zero ? null : info.b,
      phase,
      turn: phase === "betting" ? (info.turn === 0 ? "A" : "B") : null,
      history: info.history.map((n) => ACTIONS[n] ?? "check"),
      fundsConfirmed: info.fundsConfirmed,
      showdown: info.showdown,
      turnDeadlineSec: phase === "betting" ? Number(info.turnDeadline) : 0,
      nowSec: Number(block.timestamp),
    };
  };

  const flag = (value: unknown): boolean => value === true || value === 1n;

  const chain: Chain = {
    botAddress: account.address,
    readTable,

    async join(id) {
      const isOperator = await publicClient.readContract({
        address: config.chip,
        abi: chipAbi,
        functionName: "isOperator",
        args: [account.address, config.poker],
      });
      if (!isOperator) {
        const until = Math.floor(Date.now() / 1000) + OPERATOR_VALIDITY_SECONDS;
        const hash = await walletClient.writeContract({
          address: config.chip,
          abi: chipAbi,
          functionName: "setOperator",
          args: [config.poker, until],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await write("joinTable", [id]);
    },

    async act(id, action) {
      await write("act", [id, ACTIONS.indexOf(action)]);
    },

    async confirmFunds(id) {
      const [okA, okB] = await publicClient.readContract({
        address: config.poker,
        abi: pokerAbi,
        functionName: "getFundsHandles",
        args: [id],
      });
      const res = await withSdk((sdk) => sdk.decryption.decryptPublicValues([okA, okB]));
      await writeOnce("confirmFunds", [id, flag(res.clearValues[okA]), flag(res.clearValues[okB]), res.decryptionProof]);
    },

    async finalizeShowdown(id) {
      const handle = await publicClient.readContract({
        address: config.poker,
        abi: pokerAbi,
        functionName: "getShowdownHandle",
        args: [id],
      });
      const res = await withSdk((sdk) => sdk.decryption.decryptPublicValues([handle]));
      await writeOnce("finalizeShowdown", [id, flag(res.clearValues[handle]), res.decryptionProof]);
    },

    async claimTimeout(id) {
      await write("claimTimeout", [id]);
    },

    async activeBotTables() {
      const count = await publicClient.readContract({ address: config.poker, abi: pokerAbi, functionName: "tableCount" });
      const found: { id: bigint; creator: string }[] = [];
      const lowest = count > BigInt(RECENT_TABLES) ? count - BigInt(RECENT_TABLES) + 1n : 1n;
      for (let id = count; id >= lowest && id > 0n; id--) {
        const t = await readTable(id);
        const isMine = t.b !== null && t.b.toLowerCase() === account.address.toLowerCase();
        if (isMine && (t.phase === "betting" || t.phase === "ended")) found.push({ id, creator: t.a });
      }
      return found;
    },

    async balances() {
      const ethWei = await publicClient.getBalance({ address: account.address });
      try {
        const handle = await publicClient.readContract({
          address: config.chip,
          abi: chipAbi,
          functionName: "confidentialBalanceOf",
          args: [account.address],
        });
        if (/^0x0+$/.test(handle)) return { ethWei, chips: 0 };
        const chips = await withSdk(async (sdk) => {
          await sdk.permits.grantPermit([config.chip]);
          const values = await sdk.decryption.decryptValues([{ encryptedValue: handle as Hex, contractAddress: config.chip }]);
          return Number(values[handle as Hex] as bigint);
        });
        return { ethWei, chips };
      } catch (error) {
        console.error("bot balance read failed", { message: error instanceof Error ? error.message : "unknown" });
        return { ethWei, chips: null };
      }
    },
  };

  /** Decrypts ONE card. The bot only ever asks for the opponent's (seat A): its own is refused by the ACL anyway. */
  const decryptCard = async (tableId: bigint, ownerSeat: Seat): Promise<number> => {
    if (ownerSeat !== "A") throw new Error("the bot never decrypts its own card");
    const [cardA] = await publicClient.readContract({
      address: config.poker,
      abi: pokerAbi,
      functionName: "getCardHandles",
      args: [tableId],
    });
    return withSdk(async (sdk) => {
      await sdk.permits.grantPermit([config.poker]);
      const values = await sdk.decryption.decryptValues([{ encryptedValue: cardA, contractAddress: config.poker }]);
      return Number(values[cardA] as bigint);
    });
  };

  return { chain, decryptCard };
}
