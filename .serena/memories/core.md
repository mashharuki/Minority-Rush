# Blind Bluff — core

Heads-up Indian poker on Zama FHEVM (Sepolia): each card is readable by the OPPONENT only, a showdown publishes one bit. Bounty entry (Zama Developer Program Season 5, Confidential Gaming); no "Zama" in the project name; disclaimer required in README + app: "This project is not audited, endorsed or operated by Zama. Use at your own risk." Repo is still named Minority-Rush (earlier game, removed).

Source map:
- `packages/contracts` — Hardhat 2 + FHEVM contracts/tests/scripts. See `mem:contracts/core`.
- `apps/web` — Vite + React UI (`src/poker/`), live + demo clients. See `mem:web/core`.
- `apps/sponsor-api` — gas sponsorship proxy (Privy auth, call allowlist). `apps/bot-api` — bot, one step per `POST /api/bot`.
- `docs/superpowers/specs/2026-11-16-indian-poker-design.md` (design), `docs/superpowers/plans/2026-11-16-indian-poker.md` (plan), `docs/season5-gate-result.md` (Sepolia measurements), `docs/privacy-summary.md`.
- `docs/MINORITY_RUSH_CONCEPT.md` — historical concept of the removed first game.

Invariants:
- Contract ABI/addresses reach the web app only via generated `apps/web/src/contracts/{abi.json,deployment.<network>.json}`; never hand-copy.
- Zero address in `deployment.sepolia.json` (or `VITE_DEMO_MODE=true`) => web runs the offline demo client.
- Never claim "the operator can't see cards": the bot (and its operator) sees the human's card by rule; only the bot's own card is hidden.

Other memories: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.
