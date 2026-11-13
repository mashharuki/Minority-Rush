import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { artifacts } from "hardhat";

async function main(): Promise<void> {
  const outDir = join(__dirname, "..", "..", "..", "apps", "web", "src", "contracts");
  mkdirSync(outDir, { recursive: true });
  const rushChipAbi = (await artifacts.readArtifact("RushChip")).abi;
  const gameAbi = (await artifacts.readArtifact("MinorityRushGame")).abi;
  writeFileSync(join(outDir, "abi.json"), `${JSON.stringify({ rushChipAbi, gameAbi })}\n`);
  console.log("Wrote apps/web/src/contracts/abi.json");
}

main().catch((error: unknown) => {
  console.error("export-abi failed", error);
  process.exitCode = 1;
});
