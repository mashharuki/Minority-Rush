import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ethers, network } from "hardhat";

import type { RushChip } from "../types";

/**
 * Mints play-money RUSH chips to the bot account (owner-only `RushChip.mint`, testnet chips have no value).
 * The bot also needs Sepolia ETH for gas: send it from a faucet or your own wallet to the printed address.
 *
 * Run: BOT_ADDRESS=0x... BOT_CHIPS=100 bun run fund:bot:sepolia
 */
async function main(): Promise<void> {
  const botAddress = process.env.BOT_ADDRESS ?? "";
  if (!ethers.isAddress(botAddress)) throw new Error("Set BOT_ADDRESS to the bot account's address.");
  const chips = Number(process.env.BOT_CHIPS ?? "100");
  if (!Number.isInteger(chips) || chips <= 0) throw new Error("BOT_CHIPS must be a positive whole number.");

  const file = join(__dirname, "..", "..", "..", "apps", "web", "src", "contracts", `deployment.${network.name}.json`);
  const deployment = JSON.parse(readFileSync(file, "utf8")) as { rushChip: string };
  const chip = (await ethers.getContractAt("RushChip", deployment.rushChip)) as unknown as RushChip;

  await (await chip.mint(botAddress, chips)).wait();
  const eth = await ethers.provider.getBalance(botAddress);
  console.log(`Minted ${chips} RUSH to ${botAddress}`);
  console.log(`Bot ETH balance: ${ethers.formatEther(eth)} ETH${eth < ethers.parseEther("0.02") ? " (low: send some Sepolia ETH to this address)" : ""}`);
}

main().catch((error: unknown) => {
  console.error("fund-bot failed", error);
  process.exitCode = 1;
});
