import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEADLINES_UTC, MAX_PLAYERS, MIN_PLAYERS, WINDOW_SECONDS } from "./schedule.config";

/**
 * Constructor arguments of MinorityRushGame for `hardhat verify --constructor-args scripts/verify-args.ts`.
 * hardhat-verify reads the default export (an array). Reads the chip address from the Sepolia deployment file; no network calls.
 */
const file = join(__dirname, "..", "..", "..", "apps", "web", "src", "contracts", "deployment.sepolia.json");
const { rushChip } = JSON.parse(readFileSync(file, "utf8")) as { rushChip: string };

const args: unknown[] = [rushChip, [...DEADLINES_UTC], WINDOW_SECONDS, MIN_PLAYERS, MAX_PLAYERS];
export default args;
