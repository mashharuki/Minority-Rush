import { BaseError, ContractFunctionRevertedError, encodeErrorResult, encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import abis from "@/contracts/abi.json";
import type { Session } from "@/lib/session";

import { createLivePokerClient, type SdkLike } from "./livePokerClient";

const pokerAbi = abis.pokerAbi as Abi;
const chipAbi = abis.rushChipAbi as Abi;
const CHIP = "0x00000000000000000000000000000000000000c1" as Address;
const GAME = "0x00000000000000000000000000000000000000a1" as Address;
const ME = "0x0000000000000000000000000000000000000011" as Address;
const OTHER = "0x0000000000000000000000000000000000000022" as Address;
const H_A = `0x${"aa".repeat(32)}` as Hex;
const H_B = `0x${"bb".repeat(32)}` as Hex;
const noop = (): void => undefined;

type Info = {
  a: Address; b: Address; phase: number; turn: number; turnDeadline: bigint; contribA: number; contribB: number;
  history: number[]; fundsConfirmed: boolean; aWon: boolean; showdown: boolean; loserSeat: number;
};
const info = (o: Partial<Info> = {}): Info => ({
  a: ME, b: OTHER, phase: 2, turn: 0, turnDeadline: 1_045n, contribA: 1, contribB: 1, history: [],
  fundsConfirmed: false, aWon: false, showdown: false, loserSeat: 0, ...o,
});

function setup(opts: { table?: Info; lastFaucetAt?: bigint; isOperator?: boolean; simulate?: () => Promise<unknown> } = {}) {
  let table = opts.table ?? info();
  const reads: Record<string, unknown> = {
    getTable: () => table,
    getCardHandles: () => [H_A, H_B],
    getFundsHandles: () => [H_A, H_B],
    getShowdownHandle: () => H_A,
    tableCount: () => 3n,
    getOpenTables: () => [3n, 2n],
    lastFaucetAt: () => opts.lastFaucetAt ?? 0n,
    isOperator: () => opts.isOperator ?? false,
    observer: () => "0x0000000000000000000000000000000000000000",
  };
  const publicClient = {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => (reads[functionName] as () => unknown)()),
    getBlock: vi.fn(async () => ({ timestamp: 1_000n })),
    simulateContract: vi.fn(opts.simulate ?? (async () => ({}))),
  };
  const send = vi.fn(async (_calls: { to: Address; data: Hex }[], _onStep: (label: string) => void) => undefined);
  const session = { kind: "injected", account: ME, owner: ME, ownerWalletClient: {}, needsObserver: false, send } as unknown as Session;
  const sdk: SdkLike = {
    permits: { grantPermit: vi.fn(async () => undefined) },
    decryption: {
      decryptValues: vi.fn(async (items: { encryptedValue: Hex }[]) => Object.fromEntries(items.map((i) => [i.encryptedValue, 7n]))),
      decryptPublicValues: vi.fn(async (handles: Hex[]) => ({
        clearValues: Object.fromEntries(handles.map((h) => [h, true])),
        decryptionProof: "0x1234" as Hex,
      })),
    },
  };
  const client = createLivePokerClient(async () => session, {
    publicClient: publicClient as never,
    createSdk: () => sdk,
    addresses: { chip: CHIP, game: GAME },
  });
  return { client, publicClient, send, sdk, setTable: (t: Info) => (table = t) };
}

afterEach(() => vi.useRealTimers());

describe("livePokerClient card reveal", () => {
  it("should decrypt only the opponent card handle when revealOpponentCard is called as seat A", async () => {
    const { client, sdk } = setup({ table: info({ a: ME, b: OTHER }) });
    await client.connect();
    expect(await client.revealOpponentCard(1)).toBe(7);
    expect(sdk.decryption.decryptValues).toHaveBeenCalledTimes(1);
    expect(sdk.decryption.decryptValues).toHaveBeenCalledWith([{ encryptedValue: H_B, contractAddress: GAME }]);
  });

  it("should decrypt only the opponent card handle when revealOpponentCard is called as seat B", async () => {
    const { client, sdk } = setup({ table: info({ a: OTHER, b: ME }) });
    await client.connect();
    await client.revealOpponentCard(1);
    expect(sdk.decryption.decryptValues).toHaveBeenCalledWith([{ encryptedValue: H_A, contractAddress: GAME }]);
  });

  it("should refuse to reveal a card when the caller is not seated at the table", async () => {
    const { client, sdk } = setup({ table: info({ a: OTHER, b: OTHER }) });
    await client.connect();
    await expect(client.revealOpponentCard(1)).rejects.toThrow();
    expect(sdk.decryption.decryptValues).not.toHaveBeenCalled();
  });
});

describe("livePokerClient settlement races", () => {
  const revert = (name: string): BaseError => {
    const data = encodeErrorResult({ abi: pokerAbi, errorName: name });
    return new BaseError("simulation failed", {
      cause: new ContractFunctionRevertedError({ abi: pokerAbi, data, functionName: "confirmFunds" }),
    });
  };

  it("should treat an already-confirmed revert as success when two clients confirm funds", async () => {
    const { client, send } = setup({ simulate: async () => { throw revert("AlreadyConfirmed"); } });
    await client.connect();
    await expect(client.settleIfReady(1, noop)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("should treat a lost write race as success when the table already moved on", async () => {
    const { client, send, setTable } = setup();
    await client.connect();
    send.mockImplementationOnce(async () => {
      setTable(info({ fundsConfirmed: true }));
      throw new Error("replaced");
    });
    await expect(client.settleIfReady(1, noop)).resolves.toBeUndefined();
  });

  it("should finalize the showdown with the decrypted result when funds are confirmed and the hand ended", async () => {
    const { client, send, sdk } = setup({ table: info({ phase: 3, showdown: true, fundsConfirmed: true, history: [0, 0] }) });
    await client.connect();
    await client.settleIfReady(1, noop);
    expect(sdk.decryption.decryptPublicValues).toHaveBeenCalledWith([H_A]);
    const calls = send.mock.calls[0]?.[0] ?? [];
    expect(calls[0]?.to).toBe(GAME);
    expect(calls[0]?.data).toBe(
      encodeFunctionData({ abi: pokerAbi, functionName: "finalizeShowdown", args: [1n, true, "0x1234"] }),
    );
  });
});

describe("livePokerClient clock", () => {
  it("should compute the turn deadline from the block timestamp when the browser clock is skewed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-01-01T00:00:00Z"));
    const { client } = setup({ table: info({ turnDeadline: 1_045n }) });
    await client.connect();
    expect(await client.chainNowMs()).toBe(1_000_000);
    expect((await client.getTable(1)).turnDeadlineMs).toBe(1_045_000);
  });
});

describe("livePokerClient onboarding batch", () => {
  const callsOf = (mockCalls: readonly (readonly unknown[])[]): { to: Address; data: Hex }[] =>
    (mockCalls[0]?.[0] as { to: Address; data: Hex }[] | undefined) ?? [];

  it("should send a single batch when a new player joins for the first time", async () => {
    const { client, send } = setup({ lastFaucetAt: 0n, isOperator: false });
    await client.connect();
    await client.joinTable(1, noop);
    expect(send).toHaveBeenCalledTimes(1);
    const calls = callsOf(send.mock.calls);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({ to: CHIP, data: encodeFunctionData({ abi: chipAbi, functionName: "faucet" }) });
    expect(calls[1]?.to).toBe(CHIP);
    expect(calls[2]).toMatchObject({ to: GAME, data: encodeFunctionData({ abi: pokerAbi, functionName: "joinTable", args: [1n] }) });
  });

  it("should send only the join call when chips and operator already exist", async () => {
    const { client, send } = setup({ lastFaucetAt: 500n, isOperator: true });
    await client.connect();
    await client.joinTable(1, noop);
    expect(callsOf(send.mock.calls)).toHaveLength(1);
  });
});

describe("livePokerClient botPing", () => {
  const withBot = (kind: "privy" | "injected") => {
    const fetchFn = vi.fn(async (_url: string, _init: { body: string; headers: Record<string, string> }) =>
      ({ json: async () => ({ ok: false, reason: "bot_busy" }) }) as unknown as Response,
    );
    const signMessage = vi.fn(async () => "0xabcdef" as Hex);
    const base = setup();
    const session = {
      kind,
      account: ME,
      owner: ME,
      ownerWalletClient: { signMessage },
      needsObserver: false,
      send: base.send,
    } as unknown as Session;
    const client = createLivePokerClient(async () => session, {
      publicClient: base.publicClient as never,
      createSdk: () => base.sdk,
      addresses: { chip: CHIP, game: GAME },
      botApi: { url: "https://bot.example/api/bot", getAccessToken: async () => "privy-token", fetchFn: fetchFn as never },
    });
    return { client, fetchFn, signMessage };
  };

  it("should post the table id with the Privy token when the player logged in with email", async () => {
    const { client, fetchFn } = withBot("privy");
    await client.connect();
    await client.botPing?.(5);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("https://bot.example/api/bot");
    expect(init?.headers.authorization).toBe("Bearer privy-token");
    expect(JSON.parse(init?.body ?? "{}")).toEqual({ tableId: 5 });
  });

  it("should sign bot:<table id> when the player uses an injected wallet", async () => {
    const { client, fetchFn, signMessage } = withBot("injected");
    await client.connect();
    await client.botPing?.(5);
    expect(signMessage).toHaveBeenCalledWith({ account: ME, message: "bot:5" });
    const init = fetchFn.mock.calls[0]?.[1];
    expect(JSON.parse(init?.body ?? "{}")).toEqual({ tableId: 5, signature: "0xabcdef" });
    expect(init?.headers.authorization).toBeUndefined();
  });

  it("should return the refusal reason when the bot endpoint is busy", async () => {
    const { client } = withBot("privy");
    await client.connect();
    expect(await client.botPing?.(5)).toEqual({ ok: false, reason: "bot_busy" });
  });
});

describe("livePokerClient simulation before sending", () => {
  const revert = (name: string): BaseError => {
    const data = encodeErrorResult({ abi: pokerAbi, errorName: name });
    return new BaseError("simulation failed", {
      cause: new ContractFunctionRevertedError({ abi: pokerAbi, data, functionName: "joinTable" }),
    });
  };

  it("should reject with the contract's error and send nothing when the table is full", async () => {
    const { client, send } = setup({
      lastFaucetAt: 500n,
      isOperator: true,
      simulate: async () => {
        throw revert("TableFull");
      },
    });
    await client.connect();
    await expect(client.joinTable(1, noop)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("should simulate a move before sending it", async () => {
    const { client, send, publicClient } = setup({ lastFaucetAt: 500n, isOperator: true });
    await client.connect();
    await client.act(1, "bet", noop);
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "act", args: [1n, 1] }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should skip the simulation when the first-time batch also approves the game", async () => {
    const { client, publicClient } = setup({ lastFaucetAt: 0n, isOperator: false });
    await client.connect();
    await client.joinTable(1, noop);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });
});
