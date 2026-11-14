# Sepolia deployment guide

Everything below is run from the repo root unless noted. Nothing here needs to be committed with secrets.

> **This project is not audited, endorsed or operated by Zama. Use at your own risk.**

## 0. What you need

| Item | Why | Where |
| --- | --- | --- |
| Deployer key (`PRIVATE_KEY`) | Deploys the contracts and plays player 1 in the smoke test | A **fresh** throw-away wallet, never one with real funds |
| Second key (`PRIVATE_KEY_2`) | Player 2 in the smoke test | Another throw-away wallet |
| Third key (`PRIVATE_KEY_3`, optional) | Player 3: with it the smoke test runs the full 3-player round (the minimum) and measures close→finalized | Another throw-away wallet |
| Sepolia ETH for every key | Gas (the MVP is not gasless yet) | Any Sepolia faucet; ~0.1 ETH each is plenty |
| RPC (`INFURA_API_KEY` or `SEPOLIA_RPC_URL`) | Chain access | Infura or any Sepolia RPC |
| `ETHERSCAN_API_KEY` (optional) | Contract verification | Etherscan API V2 key (one key, all chains) |

Safety guard: if `PRIVATE_KEY` is unset, the config falls back to the public Hardhat dev key and **gives the
`sepolia` network no accounts**, so a deploy fails instead of using a publicly known key.

## 1. Configure secrets

Either create `packages/contracts/.env` (git-ignored):

```dotenv
PRIVATE_KEY=0x...
PRIVATE_KEY_2=0x...
PRIVATE_KEY_3=0x...                  # optional: enables the full 3-player smoke round
INFURA_API_KEY=...
# SEPOLIA_RPC_URL=https://...        # optional, overrides Infura
ETHERSCAN_API_KEY=...
```

`packages/contracts/.env.example` should list `PRIVATE_KEY_3=` after `PRIVATE_KEY_2=`; add it by hand if missing.

or use Hardhat's encrypted-ish vars store: `cd packages/contracts && bunx hardhat vars set PRIVATE_KEY`.

## 2. Pre-flight (no gas)

```bash
bun run test                                      # 22 mock-FHEVM tests
cd packages/contracts && bunx hardhat node        # terminal A
cd packages/contracts && bun run smoke:local      # terminal B: full round on a persistent local node
```

`smoke:local` runs the same script used on Sepolia (faucet, operator, three sealed entries, close, public decrypt,
finalize, claim, balance decrypt; it fast-forwards into the next window). Expected: `OK: full round verified`.

## 3. Deploy

```bash
bun run deploy:sepolia   # deploys RushChip + MinorityRushGame (daily schedule, 90-minute windows, 3-100 players)
bun run export:abi       # refreshes apps/web/src/contracts/abi.json
```

The deploy writes `apps/web/src/contracts/deployment.sepolia.json`. Once its addresses are non-zero the web app
switches from the offline demo to the live Sepolia client. Commit that JSON (addresses only, no secrets).

## 4. Smoke test on Sepolia (the "full round works" proof)

```bash
cd packages/contracts && bun run smoke:sepolia
```

Rounds now follow the fixed schedule, so the run must happen while a start window is open (the 90 minutes before
12:00, 18:00, 21:00 or 23:00 JST), and it waits until the deadline passes before closing, plus relayer
encryption/decryption. Keep the output for the demo video. If it fails, see Troubleshooting.

With fewer than three keys set it runs a **refund check** (sealed entries, round cancelled below the 3-player minimum,
stakes refunded). Add `PRIVATE_KEY_2` and `PRIVATE_KEY_3` to run the full 3-player round including the public
decryption + `finalizeRound` proof. It logs `close→finalized` (seconds) and `enter gas`.

### Measured on Sepolia

Fill in after running `bun run smoke:sepolia`.

| Metric | Value |
| --- | --- |
| `close→finalized` (seconds) | not measured yet |
| `enter gas` | not measured yet |

Gas with 100 players is an extrapolation from the per-entry figure until measured.

## 5. Verify the contracts

```bash
cd packages/contracts
bunx hardhat verify --network sepolia <RushChip address>
bunx hardhat verify --network sepolia --constructor-args scripts/verify-args.ts <MinorityRushGame address>
```

`scripts/verify-args.ts` supplies the game's constructor arguments (chip address from `deployment.sepolia.json`, schedule from `schedule.config.ts`). This form has **not yet been run against Etherscan** (no credentials were available), so expect to adjust it.

Sourcify is disabled in `hardhat.config.ts` because the installed `hardhat-verify` calls Sourcify API v1, which has
been removed (404). Etherscan verification is unaffected.

## 6. Publish the web app (Vercel)

Two separate Vercel projects (the sponsor API holds the Pimlico key, so it must not share a project with the web app):

| Project | Directory | Live URL |
| --- | --- | --- |
| `minority-rush-web` | `apps/web` | https://minority-rush-web.vercel.app |
| `minority-rush-sponsor` | `apps/sponsor-api` | https://minority-rush-sponsor.vercel.app/api/sponsor |

Config lives in `apps/web/vercel.json` (SPA rewrite, no-cache `sw.js`, basic security headers) and
`apps/sponsor-api/vercel.json`. One-time setup (already done for the projects above):

```bash
cd apps/web && npx vercel@latest link --yes --project minority-rush-web
cd apps/sponsor-api && npx vercel@latest link --yes --project minority-rush-sponsor
```

**Environment variables** are copied from each app's `.env.local` without printing them:

```bash
SENSITIVE=1 scripts/vercel-env-sync.sh apps/sponsor-api production PRIVY_APP_ID PRIVY_VERIFICATION_KEY PIMLICO_API_KEY PIMLICO_SPONSORSHIP_POLICY_ID CHIP_ADDRESS GAME_ADDRESS
scripts/vercel-env-sync.sh apps/web production VITE_PRIVY_APP_ID VITE_PRIVY_CLIENT_ID VITE_SEPOLIA_RPC_URL
```

Public values set directly: `ALLOWED_WEB_ORIGIN` (sponsor) and `VITE_SPONSOR_API_URL` (web). Never put private keys
in `VITE_*`; restrict the RPC key (it ships in the bundle) to your domain.

**Deploy** (use the latest CLI: the installed one may be too old for the API):

```bash
cd apps/sponsor-api && npx --yes vercel@latest deploy --prod --yes
cd apps/web && npx --yes vercel@latest deploy --prod --yes
```

**After deploying**: add the web origin (`https://minority-rush-web.vercel.app`) to *Allowed origins* in the Privy
dashboard, then log in once on the live site. If you change the contracts, follow the redeploy runbook below. Sepolia relayer (`relayer.testnet.zama.org`) needs no API key.

## Redeploy runbook

Redeploying creates a new `RushChip` and `MinorityRushGame`. **Old chip balances and rounds are abandoned**; players
start from the faucet again. Steps 1, 4 and 5 are outward-facing: do them only with the owner's explicit go-ahead.

1. `bun run deploy:sepolia` (needs `PRIVATE_KEY`, `INFURA_API_KEY` and a funded deployer).
2. `bun run export:abi`.
3. Set `LAUNCH_DAY_KEY` in `apps/web/src/lib/schedule.ts` to the JST day key of the launch day:
   `floor((unixSec + 32400) / 86400)`. It is used for the "day #N" number in the share text; the committed value is a
   placeholder.
4. Update `CHIP_ADDRESS` and `GAME_ADDRESS` in the `minority-rush-sponsor` Vercel project (`apps/sponsor-api`).
5. Deploy `apps/web` and `apps/sponsor-api` (section 6).
6. In the Pimlico sponsorship policy, set a hard spend limit and a daily alert. The in-memory rate limit in
   `apps/sponsor-api` (`rateLimit.ts`) is best-effort only (per serverless instance).
7. Run `bun run smoke:sepolia` (from `packages/contracts`) and record `close→finalized` seconds and `enter gas` under "Measured on Sepolia".

## 7. Submission checklist

- [ ] Contracts deployed + verified on Sepolia; addresses in `deployment.sepolia.json`
- [ ] `smoke:sepolia` passes; transaction links saved; measurements recorded
- [ ] Pimlico hard spend limit and daily alert set
- [ ] Web demo is live and a real wallet completes a round (two browsers/wallets)
- [ ] Disclaimer visible in README and app (already present)
- [ ] 3-minute real-person video, X thread/article published
- [ ] Project name does not contain "Zama" (it doesn't)
- [ ] Submit once: the form can't be edited afterwards

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `No deployer account` | `PRIVATE_KEY` unset or equal to the public dev key |
| `OutsideWindow` on start | `startRound` only works in the 90 minutes before a deadline; wait for the next window |
| `Not deployed yet` in smoke | Run `deploy:sepolia` first (addresses still zero) |
| `GameNotOperator` | Player skipped `setOperator`; the web app and smoke script do it automatically |
| Entry transfers 0 chips | Balance too small: by design (no revert); claim the faucet (1/day) |
| Public decrypt returns slowly/fails | Relayer latency; retry `finalizeRound` later: it is permissionless |
| `FaucetCoolingDown` | One faucet claim per 24 hours per address |
