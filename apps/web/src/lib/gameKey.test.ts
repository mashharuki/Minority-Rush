import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";

import { GAME_KEY_MESSAGE, deriveGameAccount, type KeyStore } from "./gameKey";

const OWNER = "0x1111111111111111111111111111111111111111";
const SIGNATURE: Hex = `0x${"ab".repeat(65)}`;

const memoryStore = (): KeyStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
};

describe("deriveGameAccount", () => {
  const sign = vi.fn<(message: string) => Promise<Hex>>();

  beforeEach(() => {
    sign.mockReset();
    sign.mockResolvedValue(SIGNATURE);
  });

  it("should derive the same account from the same signature when the wallet signs twice", async () => {
    const first = await deriveGameAccount(OWNER, sign, memoryStore());
    const second = await deriveGameAccount(OWNER, sign, memoryStore());
    expect(second.address).toBe(first.address);
    expect(sign).toHaveBeenCalledWith(GAME_KEY_MESSAGE);
  });

  it("should not ask the wallet to sign again when the key is cached", async () => {
    const store = memoryStore();
    const first = await deriveGameAccount(OWNER, sign, store);
    const second = await deriveGameAccount(OWNER, sign, store);
    expect(second.address).toBe(first.address);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("should keep a separate key for each wallet address", async () => {
    const store = memoryStore();
    sign.mockResolvedValueOnce(SIGNATURE).mockResolvedValueOnce(`0x${"cd".repeat(65)}`);
    const a = await deriveGameAccount(OWNER, sign, store);
    const b = await deriveGameAccount("0x2222222222222222222222222222222222222222", sign, store);
    expect(b.address).not.toBe(a.address);
  });

  it("should still work when the store cannot be read or written", async () => {
    const broken: KeyStore = {
      get: () => {
        throw new Error("blocked");
      },
      set: () => {
        throw new Error("blocked");
      },
    };
    const account = await deriveGameAccount(OWNER, sign, broken);
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("should propagate the error when the wallet rejects the signature", async () => {
    sign.mockRejectedValue(new Error("User rejected"));
    await expect(deriveGameAccount(OWNER, sign, memoryStore())).rejects.toThrow("User rejected");
  });
});
