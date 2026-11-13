# Minority Rush — core

Encrypted SUN/MOON minority game on Zama FHEVM (Sepolia). Smaller total stake wins 2x; tie -> `FHE.randEbool`. Bounty entry (Zama Developer Program Season 5); no "Zama" in project name; disclaimer required in README + app: "This project is not audited, endorsed or operated by Zama. Use at your own risk."

Source map:
- `packages/contracts` — Hardhat 2 + FHEVM contracts/tests/scripts. See `mem:contracts/core`.
- `apps/web` — Vite + React UI, live + demo clients. See `mem:web/core`.
- `docs/MINORITY_RUSH_CONCEPT.md` — full design (JA); aspirational (Privy, ERC-4337, PWA, Lism CSS, Turborepo not built yet). `docs/mockups/minority-rush/index.html` — UI mockup source.
- Root `package.json` — bun workspaces + thin scripts delegating to packages. No Turborepo yet.

Invariants:
- Contract ABI/addresses reach the web app only via generated `apps/web/src/contracts/{abi.json,deployment.<network>.json}`; never hand-copy.
- Zero address in `deployment.sepolia.json` => web runs offline demo client.
- MVP gaps (vs concept): no Privy/AA/PWA/Lism; entry uses operator + `confidentialTransferFrom`, not `confidentialTransferAndCall`; not deployed/verified on Sepolia.

Other memories: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.
