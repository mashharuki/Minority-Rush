import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ethers, network } from "hardhat";

import { DEADLINES_UTC, MAX_PLAYERS, MIN_PLAYERS, WINDOW_SECONDS } from "./schedule.config";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account. Set PRIVATE_KEY (not the public Hardhat dev key) in .env or `hardhat vars`.");
  }
  const balance = await ethers.provider.getBalance(deployer.address);
  if (network.name === "sepolia" && balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has no Sepolia ETH. Fund it from a faucet first.`);
  }
  console.log(`Deploying with ${deployer.address} on ${network.name}`);

  const chip = await (await ethers.getContractFactory("RushChip")).deploy();
  await chip.waitForDeployment();
  const chipAddress = await chip.getAddress();

  const game = await (await ethers.getContractFactory("MinorityRushGame")).deploy(
    chipAddress,
    [...DEADLINES_UTC],
    WINDOW_SECONDS,
    MIN_PLAYERS,
    MAX_PLAYERS,
  );
  await game.waitForDeployment();
  const gameAddress = await game.getAddress();

  console.log(`RushChip          ${chipAddress}`);
  console.log(`MinorityRushGame  ${gameAddress}`);

  // Addresses only (no secrets). ABIs come from `bun run export:abi`.
  const outDir = join(__dirname, "..", "..", "..", "apps", "web", "src", "contracts");
  mkdirSync(outDir, { recursive: true });
  const body = {
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    rushChip: chipAddress,
    game: gameAddress,
  };
  writeFileSync(join(outDir, `deployment.${network.name}.json`), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`Wrote apps/web/src/contracts/deployment.${network.name}.json`);
}

main().catch((error: unknown) => {
  console.error("deploy failed", error);
  process.exitCode = 1;
});
