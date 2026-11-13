import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";

import type { MinorityRushGame, RushChip } from "../types";

/**
 * End-to-end smoke test: faucet -> operator -> two sealed entries -> close -> public decrypt -> finalize -> claim.
 * - local node (`hardhat node` + `--network localhost`): deploys fresh contracts, fast-forwards time.
 * - `sepolia`: uses the addresses in apps/web/src/contracts/deployment.sepolia.json and needs PRIVATE_KEY and
 *   PRIVATE_KEY_2 (both funded with Sepolia ETH). Run: `bun run smoke:sepolia`
 */
const FAR_FUTURE = 2n ** 40n;
const isLocal = (): boolean => network.name !== "sepolia";
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message: string): void => console.log(`[smoke] ${message}`);

type Contracts = { chip: RushChip; game: MinorityRushGame; chipAddr: string; gameAddr: string; durationSec: number };

async function loadContracts(): Promise<Contracts> {
  if (isLocal()) {
    const chip = (await (await ethers.getContractFactory("RushChip")).deploy()) as unknown as RushChip;
    const chipAddr = await chip.getAddress();
    const game = (await (await ethers.getContractFactory("MinorityRushGame")).deploy(
      chipAddr,
      30,
    )) as unknown as MinorityRushGame;
    return { chip, game, chipAddr, gameAddr: await game.getAddress(), durationSec: 30 };
  }
  const file = join(__dirname, "..", "..", "..", "apps", "web", "src", "contracts", "deployment.sepolia.json");
  const deployment = JSON.parse(readFileSync(file, "utf8")) as { rushChip: string; game: string };
  if (/^0x0+$/.test(deployment.game)) throw new Error("Not deployed yet: run `bun run deploy:sepolia` first.");
  const chip = (await ethers.getContractAt("RushChip", deployment.rushChip)) as unknown as RushChip;
  const game = (await ethers.getContractAt("MinorityRushGame", deployment.game)) as unknown as MinorityRushGame;
  const durationSec = Number(await game.roundDuration());
  return { chip, game, chipAddr: deployment.rushChip, gameAddr: deployment.game, durationSec };
}

async function prepare(c: Contracts, player: HardhatEthersSigner): Promise<void> {
  const last = await c.chip.lastFaucetAt(player.address);
  if (last === 0n) await (await c.chip.connect(player).faucet()).wait();
  await (await c.chip.connect(player).setOperator(c.gameAddr, FAR_FUTURE)).wait();
}

async function enter(
  c: Contracts,
  roundId: bigint,
  player: HardhatEthersSigner,
  side: number,
  stake: number,
): Promise<void> {
  const input = fhevm.createEncryptedInput(c.gameAddr, player.address);
  input.add8(side).add64(stake);
  const enc = await input.encrypt();
  await (await c.game.connect(player).enter(roundId, enc.handles[0], enc.handles[1], enc.inputProof)).wait();
}

async function waitForDeadline(c: Contracts): Promise<void> {
  if (isLocal()) {
    await network.provider.send("evm_increaseTime", [c.durationSec + 1]);
    await network.provider.send("evm_mine");
    return;
  }
  log(`waiting ${c.durationSec + 5}s for the round to end`);
  await sleep((c.durationSec + 5) * 1000);
}

async function balanceOf(c: Contracts, player: HardhatEthersSigner): Promise<bigint> {
  const handle = await c.chip.confidentialBalanceOf(player.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, c.chipAddr, player);
}

async function settle(c: Contracts, roundId: bigint): Promise<boolean> {
  await (await c.game.closeRound(roundId)).wait();
  const [, , , , , handle] = await c.game.getRound(roundId);
  const res = await fhevm.publicDecrypt([handle]);
  const [moonWon] = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], res.abiEncodedClearValues);
  await (await c.game.finalizeRound(roundId, moonWon, res.decryptionProof)).wait();
  return moonWon as boolean;
}

/** One player only: exercises encrypted input, user decryption and the cancel/refund path. */
async function soloRefund(c: Contracts, player: HardhatEthersSigner): Promise<void> {
  await prepare(c, player);
  const before = await balanceOf(c, player);
  await (await c.game.startRound()).wait();
  const roundId = await c.game.latestRoundId();
  await enter(c, roundId, player, 0, 3);
  log(`round ${roundId}: entered alone with a sealed stake (balance ${before} -> ${await balanceOf(c, player)})`);

  await waitForDeadline(c);
  await (await c.game.closeRound(roundId)).wait();
  await (await c.game.connect(player).claim(roundId)).wait();
  const after = await balanceOf(c, player);
  log(`refunded after cancellation: balance ${after}`);
  if (after !== before) throw new Error(`Refund mismatch: expected ${before}, got ${after}`);
  log("OK: solo refund path verified (add PRIVATE_KEY_2 for the full two-player round)");
}

async function main(): Promise<void> {
  // Scripts on a real network (localhost/Sepolia) must initialize the FHEVM CLI API; the in-process mock does not.
  if (network.name !== "hardhat") await fhevm.initializeCLIApi();
  const signers = await ethers.getSigners();
  const [a, b] = isLocal() ? [signers[1], signers[2]] : [signers[0], signers[1]];
  if (!a) throw new Error("Need a funded account: set PRIVATE_KEY.");

  const c = await loadContracts();
  log(`network=${network.name} game=${c.gameAddr}`);
  if (!b) {
    log("only one account configured (PRIVATE_KEY_2 missing): running the solo refund check");
    await soloRefund(c, a);
    return;
  }
  await prepare(c, a);
  await prepare(c, b);

  await (await c.game.startRound()).wait();
  const roundId = await c.game.latestRoundId();
  log(`round ${roundId} started`);
  await enter(c, roundId, a, 0, 3); // SUN, 3
  await enter(c, roundId, b, 1, 2); // MOON, 2 -> MOON is the minority
  log("both entries sealed");

  await waitForDeadline(c);
  const moonWon = await settle(c, roundId);
  log(`winner: ${moonWon ? "MOON" : "SUN"} (expected MOON)`);
  if (!moonWon) throw new Error("Expected MOON (smaller pool) to win");

  await (await c.game.connect(a).claim(roundId)).wait();
  await (await c.game.connect(b).claim(roundId)).wait();
  log(`balances (private, decrypted by owners): SUN player=${await balanceOf(c, a)}, MOON player=${await balanceOf(c, b)}`);
  log("OK: full round verified");
}

main().catch((error: unknown) => {
  console.error("[smoke] FAILED", error);
  process.exitCode = 1;
});
