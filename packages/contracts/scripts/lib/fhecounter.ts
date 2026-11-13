import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployments, ethers, fhevm, network } from "hardhat";

import type { FHECounter } from "../../types";

export type CounterContext = {
  address: string;
  contract: FHECounter;
  signer: HardhatEthersSigner;
};

export function parseUint32(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${name} must be an integer between 0 and 4294967295 (got "${raw}")`);
  }
  return value;
}

async function resolveAddress(): Promise<string> {
  const fromEnv = process.env.FHECOUNTER_ADDRESS;
  if (fromEnv !== undefined && fromEnv !== "") return ethers.getAddress(fromEnv);

  const deployment = await deployments.get("FHECounter");
  return deployment.address;
}

/** Initializes the FHEVM CLI API and connects to the FHECounter contract with the first signer. */
export async function setupCounter(): Promise<CounterContext> {
  // `hardhat run` does not initialize the in-process mock FHEVM, so only real networks are supported.
  if (network.name === "hardhat") {
    throw new Error("Run with --network localhost (after `bun run chain` + deploy) or --network sepolia.");
  }
  await fhevm.initializeCLIApi();

  const address = await resolveAddress();
  const [signer] = await ethers.getSigners();
  const contract = (await ethers.getContractAt("FHECounter", address)) as unknown as FHECounter;

  console.log(`network : ${network.name}`);
  console.log(`contract: ${address}`);
  console.log(`signer  : ${signer.address}`);

  return { address, contract, signer };
}

export async function readClearCount({ contract, address, signer }: CounterContext): Promise<bigint> {
  const encryptedCount = await contract.getCount();
  // An uninitialized ciphertext handle is the zero hash; there is nothing to decrypt.
  if (encryptedCount === ethers.ZeroHash) return 0n;

  return fhevm.userDecryptEuint(FhevmType.euint32, encryptedCount, address, signer);
}

export async function sendEncrypted(
  { contract, address, signer }: CounterContext,
  method: "increment" | "decrement",
  value: number,
): Promise<void> {
  const encryptedValue = await fhevm.createEncryptedInput(address, signer.address).add32(value).encrypt();

  const tx = await contract.connect(signer)[method](encryptedValue.handles[0], encryptedValue.inputProof);
  console.log(`${method}(${value}): waiting for tx ${tx.hash} ...`);

  const receipt = await tx.wait();
  console.log(`${method}(${value}): status=${receipt?.status}`);
}
