# Commands (run from repo root)

- `bun install --cwd packages/contracts` and `bun install --cwd apps/web` — install (no root install).
- `bun run test` — contract tests (mock FHEVM). `bun run compile` — compile + typechain.
- `bun run dev` / `bun run build` — web dev server / typecheck + build.
- `bun run export:abi` — regenerate `apps/web/src/contracts/abi.json` (rerun after any contract ABI change).
- `bun run deploy:sepolia` — needs `PRIVATE_KEY`, `INFURA_API_KEY` (`.env` or `npx hardhat vars set`); writes deployment JSON.
- Lint: `cd packages/contracts && bunx solhint "contracts/**/*.sol"`; web: `bun --cwd apps/web run lint`.

Darwin: `sed -i ''` needs the empty suffix arg; prefer python/Edit for file edits. Repo hooks block `rm -rf` (use `git rm` / targeted `rm`).
