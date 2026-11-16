import { keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { errorMessage } from "./types";

/**
 * Signed once by an external wallet (MetaMask etc.). The signature is deterministic, so the same wallet always
 * derives the same game key, on any device. The message moves no funds and costs no gas.
 */
export const GAME_KEY_MESSAGE =
  "Blind Bluff game wallet v1\n\nSign once to create your game wallet. It costs no gas and moves no funds.";

export type KeyStore = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
};

const storageKey = (owner: Address): string => `blind-bluff:game-key:${owner.toLowerCase()}`;

/** Browser storage, or a store that remembers nothing when storage is blocked (private window, etc.). */
export const browserKeyStore: KeyStore = {
  get: (key) => window.localStorage.getItem(key),
  set: (key, value) => window.localStorage.setItem(key, value),
};

const isPrivateKey = (value: string | null): value is Hex => value !== null && /^0x[0-9a-fA-F]{64}$/.test(value);

/**
 * A browser-held "game wallet" that signs every move and decryption permit silently, so an external wallet is asked
 * for ONE signature instead of one per action. Testnet play money only: the key lives in this browser's storage and
 * is re-derivable from the owner wallet's signature, so clearing storage loses nothing.
 */
export async function deriveGameAccount(
  owner: Address,
  signMessage: (message: string) => Promise<Hex>,
  store: KeyStore = browserKeyStore,
): Promise<PrivateKeyAccount> {
  try {
    const cached = store.get(storageKey(owner));
    if (isPrivateKey(cached)) return privateKeyToAccount(cached);
  } catch (error) {
    console.error("deriveGameAccount: reading the cached key failed", errorMessage(error));
  }

  const privateKey = keccak256(await signMessage(GAME_KEY_MESSAGE));
  try {
    store.set(storageKey(owner), privateKey);
  } catch (error) {
    console.error("deriveGameAccount: caching the key failed", errorMessage(error));
  }
  return privateKeyToAccount(privateKey);
}
