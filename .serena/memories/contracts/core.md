# packages/contracts

- `contracts/RushChip.sol` — ERC-7984 (OZ), decimals 0, `faucet()` 20 chips / 1h cooldown.
- `contracts/MinorityRushGame.sol` — rounds: `startRound` -> `enter` -> `closeRound` (after deadline, anyone) -> `finalizeRound` (public-decrypt proof via `FHE.checkSignatures`) -> `claim`. Status enum None/Open/Closing/Settled/Cancelled; web mirrors this order.
- Limits: 2–8 players, stake clamped 1–10 in-contract, <2 players => Cancelled + refund.
- `test/MinorityRushGame.ts` — mock-FHEVM tests; skip on non-mock networks.
- `scripts/deploy.ts` (writes addresses to web), `scripts/export-abi.ts` (writes abi.json to web).

Invariants:
- Entry pulls chips with `confidentialTransferFrom`; player must `setOperator(game, until)` first. Credit the returned (actually transferred) amount, never the requested one.
- Every stored handle needs `FHE.allowThis`; player-visible ones also `FHE.allow(h, player)`. Pass handles to the chip via `FHE.allowTransient`.
- Reward/payout only computed in `claim` per player (no loops over players).
- Pinned: `@fhevm/solidity` 0.11.1, `@fhevm/hardhat-plugin` 0.4.2, OZ confidential-contracts 0.5.3 (compat set). Don't bump piecemeal.
- `hardhat-deploy` removed (broke under bun with ethers 6); deploy = plain `hardhat run` script.
