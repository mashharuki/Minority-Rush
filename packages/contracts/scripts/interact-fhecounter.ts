import { parseUint32, readClearCount, sendEncrypted, setupCounter } from "./lib/fhecounter";

/**
 * Calls every FHECounter function in sequence: getCount -> increment -> decrement -> getCount.
 *
 * Usage:
 *   bunx hardhat run scripts/interact-fhecounter.ts --network localhost  # after `bun run chain` + `bun run deploy:localhost`
 *   bunx hardhat run scripts/interact-fhecounter.ts --network sepolia    # uses deployments/sepolia
 *
 * Optional environment variables (`hardhat run` does not forward CLI arguments):
 *   FHECOUNTER_ADDRESS  contract address (default: the hardhat-deploy deployment)
 *   INCREMENT_VALUE     value passed to increment() (default: 2)
 *   DECREMENT_VALUE     value passed to decrement() (default: 1)
 */

const DEFAULT_INCREMENT = 2;
const DEFAULT_DECREMENT = 1;

async function main(): Promise<void> {
  const incrementValue = parseUint32("INCREMENT_VALUE", DEFAULT_INCREMENT);
  const decrementValue = parseUint32("DECREMENT_VALUE", DEFAULT_DECREMENT);

  const counter = await setupCounter();

  console.log(`count (before): ${await readClearCount(counter)}`);

  await sendEncrypted(counter, "increment", incrementValue);
  console.log(`count (after increment): ${await readClearCount(counter)}`);

  await sendEncrypted(counter, "decrement", decrementValue);
  console.log(`count (after decrement): ${await readClearCount(counter)}`);
}

main().catch((error: unknown) => {
  console.error("interact-fhecounter failed:", error);
  process.exitCode = 1;
});
