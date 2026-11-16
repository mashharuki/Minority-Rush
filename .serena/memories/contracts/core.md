# packages/contracts

- `contracts/RushChip.sol` — ERC-7984 (OZ), decimals 0, `faucet()` 20 chips / 24h cooldown, owner-only `mint` (testnet bot bankroll).
- `contracts/IndianPokerGame.sol` — one hand per table. `createTable(opponent)` / `joinTable` (deal in the join tx) / `cancelTable`; `act` (Kuhn betting, no raises); `claimTimeout` (45 s); `confirmFunds` (public-decrypts the two deposit flags, voids the hand if one is missing); `finalizeShowdown` (checks the proof of the single `aWins` bit). Fold/timeout settle inside `act`/`claimTimeout`/`confirmFunds`.
- Deposit 2 RUSH each (ante 1 + bet 1), fixed. Cards 1..13 distinct, each readable by the opponent only (`FHE.allow` to the other seat + that seat's chip observer); never `makePubliclyDecryptable`.
- `test/IndianPokerGame.ts` (tables, betting, settlement, HCU) and `test/RushChip.ts` — mock-FHEVM; skip on non-mock networks.
- `scripts/deploy.ts`, `export-abi.ts`, `smoke-poker.ts` (timed full hand; `smoke:poker:local|sepolia`), `fund-bot.ts`.

Invariants:
- ERC-7984 moves 0 instead of reverting on a short balance: credit the returned amount, never the requested one (`_pullDeposit`).
- Every stored handle needs `FHE.allowThis`; pass handles to the chip via `FHE.allowTransient`.
- Pinned: `@fhevm/solidity` 0.11.1, `@fhevm/hardhat-plugin` 0.4.2, OZ confidential-contracts 0.5.3 (compat set). Don't bump piecemeal.
- Join tx HCU ≈ 3.39M total / 1.40M depth (limits 20M / 5M); a test pins it under 5M / 2M.
- `hardhat-deploy` removed (broke under bun with ethers 6); deploy = plain `hardhat run` script.
