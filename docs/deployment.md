# Sepolia deployment guide

Everything below is run from the repo root unless noted. Nothing here needs to be committed with secrets.

> **This project is not audited, endorsed or operated by Zama. Use at your own risk.**

## 0. What you need

| Item | Why | Where |
| --- | --- | --- |
| Deployer key (`PRIVATE_KEY`) | Deploys the contracts, owns `RushChip` (mint) and plays seat A in the smoke test | A **fresh** throw-away wallet, never one with real funds |
| Second key (`PRIVATE_KEY_2`) | Seat B in the smoke test | Another throw-away wallet |
| Sepolia ETH for both keys | Gas for the deploy and the smoke test (play in the web app is gasless) | Any Sepolia faucet; ~0.1 ETH each is plenty |
| RPC (`INFURA_API_KEY` or `SEPOLIA_RPC_URL`) | Chain access | Infura or any Sepolia RPC |
| Bot account (optional) | Plays the bot; needs its own key, Sepolia ETH and RUSH chips | A third throw-away wallet |

Safety guard: if `PRIVATE_KEY` is unset, the config falls back to the public Hardhat dev key and **gives the
`sepolia` network no accounts**, so a deploy fails instead of using a publicly known key.

## 1. Configure secrets

Create `packages/contracts/.env` (git-ignored):

```dotenv
PRIVATE_KEY=0x...
PRIVATE_KEY_2=0x...
INFURA_API_KEY=...
# SEPOLIA_RPC_URL=https://...        # optional, overrides Infura
```

or use Hardhat's vars store: `cd packages/contracts && bunx hardhat vars set PRIVATE_KEY`.

## 2. Pre-flight (no gas)

```bash
bun run test                                           # mock-FHEVM contract tests
cd packages/contracts && bunx hardhat node             # terminal A
cd packages/contracts && bun run smoke:poker:local     # terminal B: one full hand
```

Expected: `OK: full hand verified`.

## 3. Deploy

```bash
bun run deploy:sepolia   # deploys RushChip + IndianPokerGame, writes apps/web/src/contracts/deployment.sepolia.json
bun run export:abi       # refreshes apps/web/src/contracts/abi.json
```

Once the addresses are non-zero the web app switches from the offline demo to the live Sepolia client. Commit the
JSON (addresses only, no secrets).

## 4. Smoke test on Sepolia

```bash
cd packages/contracts && bun run smoke:poker:sepolia
```

Plays one full hand between `PRIVATE_KEY` and `PRIVATE_KEY_2` and prints the seconds for each step (deal, opponent
card decrypt, confirm funds, each move, result). Record the numbers in `docs/season5-gate-result.md`.

## 5. Verify the contracts

```bash
cd packages/contracts
bunx hardhat verify --network sepolia <RushChip address>
bunx hardhat verify --network sepolia <IndianPokerGame address> <RushChip address>
```

This has **not been run against Etherscan** (no credentials were available): expect to adjust it. Sourcify is
disabled in `hardhat.config.ts` because the installed `hardhat-verify` calls a removed Sourcify API.

## 6. Publish (Vercel)

Three separate Vercel projects. The sponsor API holds the Pimlico key and the bot API holds the bot key, so neither
may share a project with the web app.

| Project | Directory | Needs |
| --- | --- | --- |
| web | `apps/web` | Public `VITE_*` values only |
| sponsor | `apps/sponsor-api` | `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, `PIMLICO_API_KEY`, `PIMLICO_SPONSORSHIP_POLICY_ID`, `CHIP_ADDRESS`, `GAME_ADDRESS` (= the **IndianPokerGame** address), `ALLOWED_WEB_ORIGIN` |
| bot | `apps/bot-api` | `BOT_PRIVATE_KEY`, `POKER_ADDRESS`, `CHIP_ADDRESS`, `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, `ALLOWED_WEB_ORIGIN`; optional `RPC_URL`, `BOT_MAX_TABLES` (5), `BOT_MIN_ETH_WEI` (0.01 ETH), `BOT_MIN_CHIPS` (4), `RATE_LIMIT_PER_MINUTE` (30) |

Web variables: `VITE_PRIVY_APP_ID`, `VITE_PRIVY_CLIENT_ID`, `VITE_SEPOLIA_RPC_URL`, `VITE_SPONSOR_API_URL`,
`VITE_BOT_ADDRESS` (the bot account's address) and `VITE_BOT_API_URL` (`.../api/bot`). Never put private keys in
`VITE_*`; restrict the RPC key (it ships in the bundle) to your domain.

Without `VITE_BOT_ADDRESS` and `VITE_BOT_API_URL` the "Play the bot" button is hidden in live mode.

**Fund the bot** (owner-only mint of play-money chips, then send Sepolia ETH to the printed address):

```bash
cd packages/contracts && BOT_ADDRESS=0x... BOT_CHIPS=100 bun run fund:bot:sepolia
```

**After deploying**: add the web origin to *Allowed origins* in the Privy dashboard, then log in once on the live
site. Test the bot: Lobby, "Play the bot", and watch it join and act. Sepolia relayer (`relayer.testnet.zama.org`)
needs no API key.

## Redeploy runbook

Redeploying creates a new `RushChip` and `IndianPokerGame`. **Old chip balances and tables are abandoned**; players
start from the faucet again. Steps 1, 4 and 5 are outward-facing: do them only with the owner's explicit go-ahead.

1. `bun run deploy:sepolia`.
2. `bun run export:abi`.
3. Fund the bot again (`fund:bot:sepolia`).
4. Update `CHIP_ADDRESS`, `GAME_ADDRESS` (sponsor) and `CHIP_ADDRESS`, `POKER_ADDRESS` (bot) in Vercel.
5. Deploy `apps/web`, `apps/sponsor-api` and `apps/bot-api`.
6. In the Pimlico sponsorship policy, set a hard spend limit and a daily alert. The in-memory rate limits are
   best-effort only (per serverless instance).
7. Run `bun run smoke:poker:sepolia` and record the timings.

## Submission checklist

- [ ] Contracts deployed on Sepolia; addresses in `deployment.sepolia.json` (verification optional)
- [ ] `smoke:poker:sepolia` passes; timings recorded
- [ ] Web app live; a real wallet plays a hand (two browsers, or one against the bot)
- [ ] Bot funded and reachable from the live site
- [ ] Pimlico hard spend limit and daily alert set
- [ ] Disclaimer visible in README and app (present)
- [ ] 3-minute real-person video; X post published
- [ ] Project name does not contain "Zama" (it doesn't)
- [ ] Submit by 2026-12-14 23:59 AOE; the form can't be edited afterwards

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `No deployer account` | `PRIVATE_KEY` unset or equal to the public dev key |
| `Poker is not deployed yet` in smoke | Run `deploy:sepolia` first |
| `GameNotOperator` | The player skipped `setOperator`; the web client and smoke script batch it with the first table action |
| Hand voided right after the deal | A deposit was missing (balance below 2 RUSH): claim the faucet first |
| `NotYourTurn` / `IllegalAction` | A move was sent out of turn; the UI only offers legal moves |
| Result takes long to appear | Relayer latency; `finalizeShowdown` is permissionless, either client or the bot submits it |
| Bot does not move | The browser tab pings the bot: keep it open. After 45 s the player can claim the timeout |
| `bot_busy` / `bot_broke` | The bot is at its table cap or out of ETH/chips: fund it or open a normal table |
| `FaucetCoolingDown` | One faucet claim per 24 hours per address |
