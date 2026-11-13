# Email login and gasless play

Players sign in with an email OTP (Privy), get an embedded wallet, and play through an ERC-4337 **Simple Smart
Account** whose gas is sponsored by a Pimlico paymaster. No wallet, seed phrase or Sepolia ETH needed.

> **This project is not audited, endorsed or operated by Zama. Use at your own risk.**

## How it fits together

```
Privy embedded wallet (owner EOA)
   | signs UserOperations and FHE decryption permits
   v
Simple Smart Account (the on-chain player, msg.sender)
   | UserOperation (batched)
   v
apps/sponsor-api  --(verifies Privy token, validates the call)-->  Pimlico bundler + paymaster
   v
EntryPoint v0.7 --> RushChip / MinorityRushGame (Sepolia)
```

**Why an observer?** The game and chip grant FHE access (ACL) to the smart account, but the browser can only sign
decryption permits with the *owner EOA*. `RushChip` therefore inherits OpenZeppelin `ERC7984ObserverAccess`:
the smart account registers its owner as `observer`, which gets permanent access to its balance/transfer amounts, and
`MinorityRushGame` additionally grants that observer access to the player's choice, stake and reward. Observers are
optional: plain EOA players (injected wallet) skip this.

First tap ("Play with email") sends **one sponsored UserOperation** that deploys the account and batches
`setObserver`, `faucet` and `setOperator`.

## Sponsor API (`apps/sponsor-api`)

A stateless JSON-RPC proxy (Vercel Node function `POST /api/sponsor`). Per request it:

1. checks the `Origin` against `ALLOWED_WEB_ORIGIN`;
2. verifies the Privy access token (`Authorization: Bearer ...`) with `@privy-io/node` (public verification key);
3. rate limits per Privy user (best-effort, per serverless instance);
4. allows only a fixed set of JSON-RPC methods;
5. for sponsored methods, requires **EntryPoint v0.7**, **Sepolia**, the Simple Account factory, gas caps, and call
   data that is `execute`/`executeBatch` (max 4 calls) to the chip/game with allowlisted selectors only, zero ETH
   value, `setOperator` only for the game and `setObserver` only for the sender's own account;
6. forces our `sponsorshipPolicyId` into the paymaster context and forwards to Pimlico. The Pimlico key stays server
   side; error bodies never include it.

Logic is covered by 19 unit tests (`cd apps/sponsor-api && bunx vitest run`).

Pimlico's sponsorship policy must carry the hard limits (per-user/global spend, chain Sepolia, allowed contracts):
the in-memory rate limiter is only a first line of defence.

## Setup checklist (needs your accounts)

1. **Privy** (dashboard.privy.io): create an app; enable Email login; enable embedded Ethereum wallets; add your web
   origin to *Allowed origins*; copy the **App ID** (and Client ID) and the **verification key**.
2. **Pimlico** (dashboard.pimlico.io): create an API key and a **sponsorship policy** limited to Sepolia and the two
   contract addresses; copy the policy ID.
3. **Deploy contracts** with the observer-enabled `RushChip` (already done for the current
   `deployment.sepolia.json`; redeploy with `bun run deploy:sepolia` after any contract change).
4. **Deploy `apps/sponsor-api`** as its own Vercel project (root `apps/sponsor-api`) with the variables from
   `apps/sponsor-api/.env.example`.
5. **Deploy `apps/web`** with `VITE_PRIVY_APP_ID`, `VITE_PRIVY_CLIENT_ID`, `VITE_SPONSOR_API_URL`.
6. Play: log in with an email, tap *Play with email*, check the sponsored UserOperation on Sepolia.

## Status

Verified: contract observer ACL tests (16 passing), sponsor-api unit tests (19 passing), web typecheck/build, and the
full two-player round on Sepolia with the redeployed contracts (plain EOAs).

**Not verified:** the Privy login, the Pimlico paymaster and the smart-account UserOperation path have never run:
they need your Privy and Pimlico credentials. Expect some integration fixes on first real run (e.g. paymaster
context fields, gas price source, Privy embedded-wallet `signTypedData` for Zama decryption permits).
