import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";

import type { MinorityRushGame, RushChip } from "../types";
import { DEADLINES_UTC, MAX_PLAYERS, MIN_PLAYERS, WINDOW_SECONDS } from "./schedule.config";

/**
 * End-to-end smoke test: faucet -> operator -> three sealed entries -> close -> public decrypt -> finalize -> claim.
 * - local node (`hardhat node` + `--network localhost`): deploys fresh contracts, fast-forwards into the next window.
 * - `sepolia`: uses the addresses in apps/web/src/contracts/deployment.sepolia.json and needs PRIVATE_KEY, PRIVATE_KEY_2
 *   and PRIVATE_KEY_3 (funded with Sepolia ETH); with fewer than 3 the round cancels and refunds. The window must be open.
 *   Run: `bun run smoke:sepolia`
 */
const FAR_FUTURE = 2n ** 40n;
const isLocal = (): boolean => network.name !== "sepolia";
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message: string): void => console.log(`[smoke] ${message}`);

type Contracts = { chip: RushChip; game: MinorityRushGame; chipAddr: string; gameAddr: string };

async function loadContracts(): Promise<Contracts> {
  if (isLocal()) {
    const chip = (await (await ethers.getContractFactory("RushChip")).deploy()) as unknown as RushChip;
    const chipAddr = await chip.getAddress();
    const game = (await (await ethers.getContractFactory("MinorityRushGame")).deploy(
      chipAddr,
      [...DEADLINES_UTC],
      WINDOW_SECONDS,
      MIN_PLAYERS,
      MAX_PLAYERS,
    )) as unknown as MinorityRushGame;
    return { chip, game, chipAddr, gameAddr: await game.getAddress() };
  }
  const file = join(__dirname, "..", "..", "..", "apps", "web", "src", "contracts", "deployment.sepolia.json");
  const deployment = JSON.parse(readFileSync(file, "utf8")) as { rushChip: string; game: string };
  if (/^0x0+$/.test(deployment.game)) throw new Error("Not deployed yet: run `bun run deploy:sepolia` first.");
  const chip = (await ethers.getContractAt("RushChip", deployment.rushChip)) as unknown as RushChip;
  const game = (await ethers.getContractAt("MinorityRushGame", deployment.game)) as unknown as MinorityRushGame;
  return { chip, game, chipAddr: deployment.rushChip, gameAddr: deployment.game };
}

async function prepare(c: Contracts, player: HardhatEthersSigner): Promise<void> {
  const last = await c.chip.lastFaucetAt(player.address);
  if (last === 0n) await (await c.chip.connect(player).faucet()).wait();
  await (await c.chip.connect(player).setOperator(c.gameAddr, FAR_FUTURE)).wait();
}

/** Local only: jump to the opening of the next window so `startRound` is allowed. */
async function openWindow(c: Contracts): Promise<void> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("No latest block");
  const now = BigInt(block.timestamp);
  const opensAt = (await c.game.nextDeadline(now)) - BigInt(WINDOW_SECONDS);
  if (opensAt > now) {
    await network.provider.send("evm_setNextBlockTimestamp", [Number(opensAt)]);
    await network.provider.send("evm_mine");
  }
}

async function startRound(c: Contracts): Promise<bigint> {
  if (isLocal()) await openWindow(c);
  await (await c.game.startRound()).wait();
  return c.game.latestRoundId();
}

async function enter(
  c: Contracts,
  roundId: bigint,
  player: HardhatEthersSigner,
  side: number,
  stake: number,
): Promise<bigint> {
  const input = fhevm.createEncryptedInput(c.gameAddr, player.address);
  input.add8(side).add64(stake);
  const enc = await input.encrypt();
  const receipt = await (
    await c.game.connect(player).enter(roundId, enc.handles[0], enc.handles[1], enc.inputProof)
  ).wait();
  if (!receipt) throw new Error(`enter(${roundId}) returned no receipt`);
  return receipt.gasUsed;
}

async function waitForDeadline(c: Contracts, roundId: bigint): Promise<void> {
  const [, endTime] = await c.game.getRound(roundId);
  if (isLocal()) {
    await network.provider.send("evm_setNextBlockTimestamp", [Number(endTime)]);
    await network.provider.send("evm_mine");
    return;
  }
  const block = await ethers.provider.getBlock("latest");
  const waitSec = Math.max(0, Number(endTime) - (block?.timestamp ?? 0)) + 5;
  log(`waiting ${waitSec}s for the round to end`);
  await sleep(waitSec * 1000);
}

async function balanceOf(c: Contracts, player: HardhatEthersSigner): Promise<bigint> {
  const handle = await c.chip.confidentialBalanceOf(player.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, c.chipAddr, player);
}

async function settle(c: Contracts, roundId: bigint): Promise<boolean> {
  const startedAt = Date.now();
  await (await c.game.closeRound(roundId)).wait();
  const [, , , , , handle] = await c.game.getRound(roundId);
  const res = await fhevm.publicDecrypt([handle]);
  const [moonWon] = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], res.abiEncodedClearValues);
  await (await c.game.finalizeRound(roundId, moonWon, res.decryptionProof)).wait();
  log(`close→finalized: ${Math.round((Date.now() - startedAt) / 1000)}s`);
  return moonWon as boolean;
}

/** Fewer than the minimum players: exercises encrypted input, user decryption and the cancel/refund path. */
async function refundRound(c: Contracts, players: HardhatEthersSigner[]): Promise<void> {
  for (const p of players) await prepare(c, p);
  const before = await Promise.all(players.map((p) => balanceOf(c, p)));
  const roundId = await startRound(c);
  const gas = await enter(c, roundId, players[0], 0, 3);
  for (const p of players.slice(1)) await enter(c, roundId, p, 0, 3);
  log(`enter gas: ${gas}`);
  log(`round ${roundId}: ${players.length} sealed entries (below the minimum of ${MIN_PLAYERS})`);

  await waitForDeadline(c, roundId);
  await (await c.game.closeRound(roundId)).wait();
  for (const [i, p] of players.entries()) {
    await (await c.game.connect(p).claim(roundId)).wait();
    const after = await balanceOf(c, p);
    if (after !== before[i]) throw new Error(`Refund mismatch for ${p.address}: expected ${before[i]}, got ${after}`);
  }
  log("OK: cancel and refund path verified (add PRIVATE_KEY_3 for the full three-player round)");
}

async function main(): Promise<void> {
  // Scripts on a real network (localhost/Sepolia) must initialize the FHEVM CLI API; the in-process mock does not.
  if (network.name !== "hardhat") await fhevm.initializeCLIApi();
  const signers = await ethers.getSigners();
  const players = (isLocal() ? signers.slice(1, 4) : signers.slice(0, 3)).filter(Boolean);
  if (players.length === 0) throw new Error("Need a funded account: set PRIVATE_KEY.");

  const c = await loadContracts();
  log(`network=${network.name} game=${c.gameAddr}`);
  if (players.length < MIN_PLAYERS) {
    log(`only ${players.length} account(s) configured (need PRIVATE_KEY_2/PRIVATE_KEY_3 for ${MIN_PLAYERS}): the round will cancel and refund`);
    await refundRound(c, players);
    return;
  }
  const [a, b, d] = players;
  for (const p of [a, b, d]) await prepare(c, p);

  const roundId = await startRound(c);
  log(`round ${roundId} started`);
  const gas = await enter(c, roundId, a, 0, 3); // SUN, 3
  await enter(c, roundId, b, 0, 2); // SUN, 2
  await enter(c, roundId, d, 1, 2); // MOON, 2 -> MOON pool (2) < SUN pool (5): MOON is the minority
  log(`enter gas: ${gas}`);
  log("all entries sealed");

  await waitForDeadline(c, roundId);
  const moonWon = await settle(c, roundId);
  log(`winner: ${moonWon ? "MOON" : "SUN"} (expected MOON)`);
  if (!moonWon) throw new Error("Expected MOON (smaller pool) to win");

  for (const p of [a, b, d]) await (await c.game.connect(p).claim(roundId)).wait();
  log(
    `balances (private, decrypted by owners): SUN=${await balanceOf(c, a)}/${await balanceOf(c, b)}, MOON=${await balanceOf(c, d)}`,
  );
  log("OK: full round verified");
}

main().catch((error: unknown) => {
  console.error("[smoke] FAILED", error);
  process.exitCode = 1;
});
