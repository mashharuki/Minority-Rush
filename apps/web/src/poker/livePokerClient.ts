import { encodeFunctionData, type Abi, type Address, type Hex, type PublicClient } from "viem";

import abis from "@/contracts/abi.json";
import type { Session } from "@/lib/session";
import { revertErrorName } from "@/lib/types";

import type { BotPingResult, OnStep, PokerClient } from "./client";
import type { PokerAction, Seat, TablePhase, TableView } from "./types";

const pokerAbi = abis.pokerAbi as Abi;
const chipAbi = abis.rushChipAbi as Abi;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const OPERATOR_VALIDITY_SECONDS = 7 * 24 * 3600;
const ACTIONS: PokerAction[] = ["check", "bet", "call", "fold"];
const PHASES: (TablePhase | "none")[] = ["none", "open", "betting", "ended", "settled", "voided", "cancelled"];
/** A confirm/finalize that another client already did surfaces as one of these reverts. */
const ALREADY_DONE = new Set(["AlreadyConfirmed", "NotEnded", "NotBetting"]);

/** The slice of `ZamaSDK` this client uses (so tests can inject a fake). */
export type SdkLike = {
  permits: { grantPermit(contractAddresses: Address[]): Promise<unknown> };
  decryption: {
    decryptValues(items: { encryptedValue: Hex; contractAddress: Address }[]): Promise<Record<string, unknown>>;
    decryptPublicValues(handles: Hex[]): Promise<{ clearValues: Record<string, unknown>; decryptionProof: Hex }>;
  };
};

export type BotApi = {
  url: string;
  getAccessToken: () => Promise<string | null>;
  fetchFn: typeof fetch;
};

export type LiveDeps = {
  botApi: BotApi;
  publicClient: PublicClient;
  createSdk: (session: Session) => Promise<SdkLike> | SdkLike;
  addresses: { chip: Address; game: Address };
};

type Info = {
  a: Address;
  b: Address;
  phase: number;
  turn: number;
  turnDeadline: bigint;
  contribA: number;
  contribB: number;
  history: readonly number[];
  fundsConfirmed: boolean;
  aWon: boolean;
  showdown: boolean;
  loserSeat: number;
};

const same = (x: string, y: string): boolean => x.toLowerCase() === y.toLowerCase();

function seatOf(info: Info, account: string): Seat | null {
  if (same(info.a, account)) return "A";
  if (info.b !== ZERO_ADDRESS && same(info.b, account)) return "B";
  return null;
}

function toView(id: number, info: Info, account: string): TableView {
  const phase = PHASES[info.phase] ?? "none";
  if (phase === "none") throw new Error("Unknown table");
  const ended = phase === "ended" || phase === "settled";
  const foldEnd = ended && !info.showdown;
  const winner: Seat | null =
    phase === "settled" ? (info.aWon ? "A" : "B") : foldEnd ? (info.loserSeat === 0 ? "B" : "A") : null;
  return {
    id,
    phase,
    playerA: info.a,
    playerB: info.b === ZERO_ADDRESS ? null : info.b,
    mySeat: seatOf(info, account),
    turn: phase === "betting" ? (info.turn === 0 ? "A" : "B") : null,
    turnDeadlineMs: phase === "betting" ? Number(info.turnDeadline) * 1000 : 0,
    history: info.history.map((n) => ACTIONS[n] ?? "check"),
    contribA: info.contribA,
    contribB: info.contribB,
    fundsConfirmed: info.fundsConfirmed,
    winner,
    endKind: ended ? (info.showdown ? "showdown" : "fold") : null,
  };
}

async function defaultCreateSdk(session: Session): Promise<SdkLike> {
  const [{ ZamaSDK }, chains, { createConfig }, { web }, { createPublicClient, http }, { sepolia }, { env }] = await Promise.all([
    import("@zama-fhe/sdk"),
    import("@zama-fhe/sdk/chains"),
    import("@zama-fhe/sdk/viem"),
    import("@zama-fhe/sdk/web"),
    import("viem"),
    import("viem/chains"),
    import("@/lib/env"),
  ]);
  const chain = { ...chains.sepolia, network: env.rpcUrl } as const;
  const publicClient = createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) });
  return new ZamaSDK(
    createConfig({ chains: [chain], publicClient, walletClient: session.ownerWalletClient, relayers: { [chain.id]: web() } }),
  ) as unknown as SdkLike;
}

/**
 * Live Sepolia client. Who plays (injected wallet or Privy smart account) is the `Session` from `connectSession`.
 * Cards: only the OPPONENT's handle is ever decrypted; the contract's ACL refuses the caller's own card anyway.
 */
export function createLivePokerClient(connectSession: () => Promise<Session>, deps: Partial<LiveDeps> = {}): PokerClient {
  let session: Session | null = null;
  let sdk: SdkLike | null = null;
  let resolved: LiveDeps | null = null;

  const live = async (): Promise<LiveDeps> => {
    if (resolved) return resolved;
    const { env } = await import("@/lib/env");
    const { privyBridge } = await import("@/lib/privyBridge");
    const { createPublicClient, http } = await import("viem");
    const { sepolia } = await import("viem/chains");
    resolved = {
      publicClient: deps.publicClient ?? (createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) }) as PublicClient),
      createSdk: deps.createSdk ?? defaultCreateSdk,
      addresses: deps.addresses ?? { chip: env.chipAddress as Address, game: env.pokerAddress as Address },
      botApi: deps.botApi ?? {
        url: env.botApiUrl,
        getAccessToken: () => privyBridge.getAccessToken(),
        fetchFn: (...args) => fetch(...args),
      },
    };
    return resolved;
  };

  const need = (): { s: Session; k: SdkLike } => {
    if (!session || !sdk) throw new Error("Not connected");
    return { s: session, k: sdk };
  };

  const read = async <T,>(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> =>
    (await live()).publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

  const callOf = (to: Address, abi: Abi, functionName: string, args: unknown[] = []): { to: Address; data: Hex } => ({
    to,
    data: encodeFunctionData({ abi, functionName, args }),
  });

  /** Faucet, operator approval and (smart accounts) observer, only what is still missing: batched with the next call. */
  const onboardingCalls = async (s: Session): Promise<{ to: Address; data: Hex }[]> => {
    const { addresses } = await live();
    const calls: { to: Address; data: Hex }[] = [];
    if ((await read<bigint>(addresses.chip, chipAbi, "lastFaucetAt", [s.account])) === 0n) {
      calls.push(callOf(addresses.chip, chipAbi, "faucet"));
    }
    if (!(await read<boolean>(addresses.chip, chipAbi, "isOperator", [s.account, addresses.game]))) {
      const until = Math.floor(Date.now() / 1000) + OPERATOR_VALIDITY_SECONDS;
      calls.push(callOf(addresses.chip, chipAbi, "setOperator", [addresses.game, until]));
    }
    if (s.needsObserver) {
      const current = await read<Address>(addresses.chip, chipAbi, "observer", [s.account]);
      if (!same(current, s.owner)) calls.push(callOf(addresses.chip, chipAbi, "setObserver", [s.account, s.owner]));
    }
    return calls;
  };

  const sendGame = async (functionName: string, args: unknown[], onStep: OnStep, withOnboarding = false): Promise<void> => {
    const { s } = need();
    const { addresses } = await live();
    const pre = withOnboarding ? await onboardingCalls(s) : [];
    await s.send([...pre, callOf(addresses.game, pokerAbi, functionName, args)], onStep);
  };

  const getTable = async (id: number): Promise<TableView> => {
    const { s } = need();
    const { addresses } = await live();
    const info = await read<Info>(addresses.game, pokerAbi, "getTable", [BigInt(id)]);
    return toView(id, info, s.account);
  };

  /** Simulate first so an already-done step is skipped; a write that loses the race counts as done. */
  const sendOnce = async (
    functionName: string,
    args: unknown[],
    onStep: OnStep,
    isDone: (view: TableView) => boolean,
    id: number,
  ): Promise<void> => {
    const { s } = need();
    const { publicClient, addresses } = await live();
    try {
      await publicClient.simulateContract({ address: addresses.game, abi: pokerAbi, functionName, args, account: s.account });
    } catch (error) {
      const name = revertErrorName(error);
      if (name && ALREADY_DONE.has(name)) return;
      throw error;
    }
    try {
      await sendGame(functionName, args, onStep);
    } catch (error) {
      if (!isDone(await getTable(id))) throw error;
    }
  };

  return {
    mode: "live",

    async connect() {
      const l = await live();
      session = await connectSession();
      sdk = await l.createSdk(session);
      return session.account;
    },

    async onboard(onStep) {
      const { s } = need();
      const calls = await onboardingCalls(s);
      if (calls.length > 0) await s.send(calls, onStep);
    },

    async readBalance() {
      const { s, k } = need();
      const { addresses } = await live();
      const handle = await read<Hex>(addresses.chip, chipAbi, "confidentialBalanceOf", [s.account]);
      if (/^0x0+$/.test(handle)) return 0;
      await k.permits.grantPermit([addresses.chip]);
      const values = await k.decryption.decryptValues([{ encryptedValue: handle, contractAddress: addresses.chip }]);
      return Number(values[handle] as bigint);
    },

    async createTable(opponent, onStep) {
      const { s } = need();
      const { addresses } = await live();
      await sendGame("createTable", [opponent ?? ZERO_ADDRESS], onStep, true);
      const count = Number(await read<bigint>(addresses.game, pokerAbi, "tableCount"));
      for (let id = count; id > Math.max(0, count - 5); id--) {
        const info = await read<Info>(addresses.game, pokerAbi, "getTable", [BigInt(id)]);
        if (same(info.a, s.account) && info.phase === 1) return id;
      }
      throw new Error("Created table not found");
    },

    async joinTable(id, onStep) {
      await sendGame("joinTable", [BigInt(id)], onStep, true);
    },

    async cancelTable(id, onStep) {
      await sendGame("cancelTable", [BigInt(id)], onStep);
    },

    async act(id, action, onStep) {
      await sendGame("act", [BigInt(id), ACTIONS.indexOf(action)], onStep);
    },

    async claimTimeout(id, onStep) {
      await sendGame("claimTimeout", [BigInt(id)], onStep);
    },

    getTable,

    async listOpenTables() {
      const { addresses } = await live();
      return (await read<bigint[]>(addresses.game, pokerAbi, "getOpenTables")).map(Number);
    },

    async revealOpponentCard(id) {
      const { k } = need();
      const { addresses } = await live();
      const view = await getTable(id);
      if (!view.mySeat) throw new Error("You are not seated at this table");
      const [cardA, cardB] = await read<[Hex, Hex]>(addresses.game, pokerAbi, "getCardHandles", [BigInt(id)]);
      const handle = view.mySeat === "A" ? cardB : cardA; // the OTHER seat's card
      await k.permits.grantPermit([addresses.game]);
      const values = await k.decryption.decryptValues([{ encryptedValue: handle, contractAddress: addresses.game }]);
      return Number(values[handle] as bigint);
    },

    async settleIfReady(id, onStep) {
      const { k } = need();
      const { addresses } = await live();
      const view = await getTable(id);
      if ((view.phase === "betting" || view.phase === "ended") && !view.fundsConfirmed) {
        const [okA, okB] = await read<[Hex, Hex]>(addresses.game, pokerAbi, "getFundsHandles", [BigInt(id)]);
        onStep("Confirming deposits");
        const res = await k.decryption.decryptPublicValues([okA, okB]);
        const flag = (h: Hex): boolean => res.clearValues[h] === true || res.clearValues[h] === 1n;
        await sendOnce("confirmFunds", [BigInt(id), flag(okA), flag(okB), res.decryptionProof], onStep, (v) => v.fundsConfirmed, id);
        return;
      }
      if (view.phase === "ended" && view.endKind === "showdown" && view.fundsConfirmed) {
        const handle = await read<Hex>(addresses.game, pokerAbi, "getShowdownHandle", [BigInt(id)]);
        onStep("Publishing the verified result");
        const res = await k.decryption.decryptPublicValues([handle]);
        const aWins = res.clearValues[handle] === true || res.clearValues[handle] === 1n;
        await sendOnce("finalizeShowdown", [BigInt(id), aWins, res.decryptionProof], onStep, (v) => v.phase === "settled", id);
      }
    },

    async chainNowMs() {
      const { publicClient } = await live();
      return Number((await publicClient.getBlock()).timestamp) * 1000;
    },

    async botPing(id): Promise<BotPingResult> {
      const { s } = need();
      const { botApi } = await live();
      if (!botApi.url) return { ok: false, reason: "bot_unavailable" };
      const headers: Record<string, string> = { "content-type": "application/json" };
      const body: { tableId: number; signature?: Hex } = { tableId: id };
      if (s.kind === "privy") {
        const accessToken = await botApi.getAccessToken();
        if (!accessToken) return { ok: false, reason: "unauthorized" };
        headers.authorization = `Bearer ${accessToken}`;
      } else {
        // An injected wallet proves it created the table by signing "bot:<id>" (verified by the bot API).
        body.signature = await s.ownerWalletClient.signMessage({ account: s.owner, message: `bot:${id}` });
      }
      const response = await botApi.fetchFn(botApi.url, { method: "POST", headers, body: JSON.stringify(body) });
      const json = (await response.json()) as { ok?: boolean; reason?: string };
      return json.ok ? { ok: true } : { ok: false, reason: json.reason ?? "bot_unavailable" };
    },
  };
}
