import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";

import type { IndianPokerGame, RushChip } from "../types";

/**
 * End-to-end smoke test of one poker hand with per-step timing (used for the Go/No-Go gate):
 * faucet -> operator -> createTable -> joinTable (deal) -> opponent card decrypt -> confirmFunds ->
 * bet/call -> public decrypt of the result -> finalizeShowdown -> balances.
 * - local node (`hardhat node` + `--network localhost`): deploys fresh contracts.
 * - `sepolia`: uses apps/web/src/contracts/deployment.sepolia.json and needs PRIVATE_KEY and PRIVATE_KEY_2 funded with
 *   Sepolia ETH. Run: `bun run smoke:poker:sepolia`
 */
const FAR_FUTURE = 2n ** 40n;
const BET = 1;
const CALL = 2;
const log = (message: string): void => console.log(`[smoke-poker] ${message}`);

type Contracts = { chip: RushChip; game: IndianPokerGame; chipAddr: string; gameAddr: string };

async function loadContracts(): Promise<Contracts> {
  if (network.name !== "sepolia") {
    const chip = (await (await ethers.getContractFactory("RushChip")).deploy()) as unknown as RushChip;
    const chipAddr = await chip.getAddress();
    const game = (await (await ethers.getContractFactory("IndianPokerGame")).deploy(chipAddr)) as unknown as IndianPokerGame;
    return { chip, game, chipAddr, gameAddr: await game.getAddress() };
  }
  const file = join(__dirname, "..", "..", "..", "apps", "web", "src", "contracts", "deployment.sepolia.json");
  const d = JSON.parse(readFileSync(file, "utf8")) as { rushChip: string; poker?: string };
  if (!d.poker || /^0x0+$/.test(d.poker)) throw new Error("Poker is not deployed yet: run `bun run deploy:sepolia` first.");
  const chip = (await ethers.getContractAt("RushChip", d.rushChip)) as unknown as RushChip;
  const game = (await ethers.getContractAt("IndianPokerGame", d.poker)) as unknown as IndianPokerGame;
  return { chip, game, chipAddr: d.rushChip, gameAddr: d.poker };
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await fn();
  log(`${label}: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return result;
}

async function prepare(c: Contracts, player: HardhatEthersSigner): Promise<void> {
  const last = await c.chip.lastFaucetAt(player.address);
  if (last === 0n) await (await c.chip.connect(player).faucet()).wait();
  await (await c.chip.connect(player).setOperator(c.gameAddr, FAR_FUTURE)).wait();
}

async function balanceOf(c: Contracts, player: HardhatEthersSigner): Promise<bigint> {
  const handle = await c.chip.confidentialBalanceOf(player.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, c.chipAddr, player);
}

async function main(): Promise<void> {
  if (network.name !== "hardhat") await fhevm.initializeCLIApi();
  const signers = await ethers.getSigners();
  const [a, b] = network.name === "sepolia" ? signers.slice(0, 2) : signers.slice(1, 3);
  if (!a || !b) throw new Error("Need two funded accounts: set PRIVATE_KEY and PRIVATE_KEY_2.");

  const c = await loadContracts();
  log(`network=${network.name} game=${c.gameAddr}`);
  const total = Date.now();
  await timed("prepare (faucet + operator)", async () => {
    await prepare(c, a);
    await prepare(c, b);
  });
  const before = [await balanceOf(c, a), await balanceOf(c, b)];

  await timed("createTable", async () => (await c.game.connect(a).createTable(ethers.ZeroAddress)).wait());
  const id = await c.game.tableCount();
  await timed("joinTable (deal)", async () => (await c.game.connect(b).joinTable(id)).wait());

  const [handleA, handleB] = await c.game.getCardHandles(id);
  const cardOfB = await timed("A decrypts B's card", () =>
    fhevm.userDecryptEuint(FhevmType.euint8, handleB, c.gameAddr, a),
  );
  const cardOfA = await timed("B decrypts A's card", () =>
    fhevm.userDecryptEuint(FhevmType.euint8, handleA, c.gameAddr, b),
  );
  log(`cards seen by the opponents: A holds ${cardOfA}, B holds ${cardOfB}`);
  const ownDecrypted = await fhevm.userDecryptEuint(FhevmType.euint8, handleA, c.gameAddr, a).then(
    () => true,
    () => false,
  );
  if (ownDecrypted) throw new Error("A could decrypt their own card");
  log("own card decrypt correctly refused");

  await timed("confirmFunds", async () => {
    const [okA, okB] = await c.game.getFundsHandles(id);
    const res = await fhevm.publicDecrypt([okA, okB]);
    await (await c.game.confirmFunds(id, true, true, res.decryptionProof)).wait();
  });
  await timed("A bets", async () => (await c.game.connect(a).act(id, BET)).wait());
  await timed("B calls (showdown)", async () => (await c.game.connect(b).act(id, CALL)).wait());
  const aWins = await timed("result decrypt + finalizeShowdown", async () => {
    const h = await c.game.getShowdownHandle(id);
    const res = await fhevm.publicDecrypt([h]);
    const [won] = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], res.abiEncodedClearValues);
    await (await c.game.finalizeShowdown(id, won, res.decryptionProof)).wait();
    return won as boolean;
  });
  if (aWins !== Number(cardOfA) > Number(cardOfB)) throw new Error("Result does not match the cards");

  const after = [await balanceOf(c, a), await balanceOf(c, b)];
  const delta = [after[0] - before[0], after[1] - before[1]];
  log(`balances delta (private, decrypted by owners): A ${delta[0]}, B ${delta[1]}`);
  if (aWins ? delta[0] !== 2n || delta[1] !== -2n : delta[0] !== -2n || delta[1] !== 2n) {
    throw new Error("Unexpected payout");
  }
  log(`total ${((Date.now() - total) / 1000).toFixed(1)}s`);
  log("OK: full hand verified");
}

main().catch((error: unknown) => {
  console.error("[smoke-poker] FAILED", error);
  process.exitCode = 1;
});
