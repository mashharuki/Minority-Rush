import { parseUint32, readClearCount, sendEncrypted, setupCounter } from "./lib/fhecounter";

/**
 * Calls FHECounter.decrement() once and prints the decrypted count before and after.
 *
 * Usage:
 *   bunx hardhat run scripts/decrement-fhecounter.ts --network localhost  # after `bun run chain` + `bun run deploy:localhost`
 *   bunx hardhat run scripts/decrement-fhecounter.ts --network sepolia    # uses deployments/sepolia
 *
 * Optional environment variables (`hardhat run` does not forward CLI arguments):
 *   DECREMENT_VALUE     value passed to decrement() (default: 1)
 *   FHECOUNTER_ADDRESS  contract address (default: the hardhat-deploy deployment)
 *
 * Note: the contract has no underflow check, so decrementing below zero wraps around (uint32).
 */

const DEFAULT_DECREMENT = 1;

async function main(): Promise<void> {
  const decrementValue = parseUint32("DECREMENT_VALUE", DEFAULT_DECREMENT);

  const counter = await setupCounter();

  console.log(`count (before): ${await readClearCount(counter)}`);
  await sendEncrypted(counter, "decrement", decrementValue);
  console.log(`count (after decrement): ${await readClearCount(counter)}`);
}

main().catch((error: unknown) => {
  console.error("decrement-fhecounter failed:", error);
  process.exitCode = 1;
});
