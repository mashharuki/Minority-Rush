import type { Address, Hex, WalletClient } from "viem";

import type { OnStep } from "./types";

export type EncodedCall = { to: Address; data: Hex };

/**
 * Who is playing. `account` is the on-chain msg.sender (EOA, or the smart account); `owner` is the EOA that signs
 * FHE decryption permits. For an injected wallet they are the same address.
 */
export type Session = {
  kind: "injected" | "privy";
  account: Address;
  owner: Address;
  /** The owner's wallet client: used for decryption permits (EIP-712) by the Zama SDK. */
  ownerWalletClient: WalletClient;
  /** Smart accounts must register their owner as RushChip observer so the owner can decrypt. */
  needsObserver: boolean;
  /** Sends the calls in order; a smart account batches them into one sponsored UserOperation. */
  send: (calls: EncodedCall[], onStep: OnStep) => Promise<void>;
};
