# Sepolia deployment guide

Everything below is run from the repo root unless noted. Nothing here needs to be committed with secrets.

> **This project is not audited, endorsed or operated by Zama. Use at your own risk.**

## 0. What you need

| Item | Why | Where |
| --- | --- | --- |
| Deployer key (`PRIVATE_KEY`) | Deploys the contracts and plays player 1 in the smoke test | A **fresh** throw-away wallet, never one with real funds |
| Second key (`PRIVATE_KEY_2`) | Player 2 in the smoke test | Another throw-away wallet |
| Sepolia ETH for both | Gas (the MVP is not gasless yet) | Any Sepolia faucet; ~0.1 ETH each is plenty |
| RPC (`INFURA_API_KEY` or `SEPOLIA_RPC_URL`) | Chain access | Infura or any Sepolia RPC |
| `ETHERSCAN_API_KEY` (optional) | Contract verification | Etherscan API V2 key (one key, all chains) |

Safety guard: if `PRIVATE_KEY` is unset, the config falls back to the public Hardhat dev key and **gives the
`sepolia` network no accounts**, so a deploy fails instead of using a publicly known key.

## 1. Configure secrets

Either create `packages/contracts/.env` (git-ignored):

```dotenv
PRIVATE_KEY=0x...
PRIVATE_KEY_2=0x...
INFURA_API_KEY=...
# SEPOLIA_RPC_URL=https://...        # optional, overrides Infura
ETHERSCAN_API_KEY=...
```

or use Hardhat's encrypted-ish vars store: `cd packages/contracts && bunx hardhat vars set PRIVATE_KEY`.

## 2. Pre-flight (no gas)

```bash
bun run test                                      # 14 mock-FHEVM tests
cd packages/contracts && bunx hardhat node        # terminal A
cd packages/contracts && bun run smoke:local      # terminal B: full round on a persistent local node
```

`smoke:local` runs the same script used on Sepolia (faucet, operator, two sealed entries, close, public decrypt,
finalize, claim, balance decrypt). Expected: `OK: full round verified`.

## 3. Deploy

```bash
bun run deploy:sepolia   # deploys RushChip + MinorityRushGame (90 s rounds)
bun run export:abi       # refreshes apps/web/src/contracts/abi.json
```

The deploy writes `apps/web/src/contracts/deployment.sepolia.json`. Once its addresses are non-zero the web app
switches from the offline demo to the live Sepolia client. Commit that JSON (addresses only, no secrets).

## 4. Smoke test on Sepolia (the "full round works" proof)

```bash
bun --cwd packages/contracts run smoke:sepolia
```

Takes ~2–4 minutes (90 s round + relayer encryption/decryption). Keep the output for the demo video. If it fails,
see Troubleshooting.

With only `PRIVATE_KEY` set it runs a **solo refund check** (one sealed entry, round cancelled for lack of players,
stake refunded; verified on Sepolia). Add `PRIVATE_KEY_2` to run the full two-player round including the public
decryption + `finalizeRound` proof.

## 5. Verify the contracts

```bash
cd packages/contracts
bunx hardhat verify --network sepolia <RushChip address>
bunx hardhat verify --network sepolia <MinorityRushGame address> <RushChip address> 90
```

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
dashboard, then log in once on the live site. If you change the contracts, redeploy them, run `export:abi`, update the
env addresses and redeploy both projects. Sepolia relayer (`relayer.testnet.zama.org`) needs no API key.

## 7. Submission checklist

- [ ] Contracts deployed + verified on Sepolia; addresses in `deployment.sepolia.json`
- [ ] `smoke:sepolia` passes; transaction links saved
- [ ] Web demo is live and a real wallet completes a round (two browsers/wallets)
- [ ] Disclaimer visible in README and app (already present)
- [ ] 3-minute real-person video, X thread/article published
- [ ] Project name does not contain "Zama" (it doesn't)
- [ ] Submit once: the form can't be edited afterwards

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `No deployer account` | `PRIVATE_KEY` unset or equal to the public dev key |
| `Not deployed yet` in smoke | Run `deploy:sepolia` first (addresses still zero) |
| `GameNotOperator` | Player skipped `setOperator`; the web app and smoke script do it automatically |
| Entry transfers 0 chips | Balance too small: by design (no revert); claim the faucet (1/hour) |
| Public decrypt returns slowly/fails | Relayer latency; retry `finalizeRound` later: it is permissionless |
| `FaucetCoolingDown` | One faucet claim per hour per address |
