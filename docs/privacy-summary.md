# Privacy summary

What is encrypted, what leaks, who can decrypt what, and every asynchronous step with who triggers it.
Evidence level: **tested** = covered by an automated test in this repo; **measured** = observed on Sepolia
(`docs/season5-gate-result.md`); **by design** = follows from the contract but has no dedicated test.

## Encrypted

| Value | Who can decrypt | Evidence |
| --- | --- | --- |
| Card of seat A | Seat B only (and B's chip observer for smart accounts) | tested (`IndianPokerGame tables`), measured |
| Card of seat B | Seat A only (and A's chip observer) | tested, measured |
| Each player's chip balance and transfer amounts, as stored | The holder (ERC-7984) | by design (OpenZeppelin ERC-7984); see the next section: not a privacy feature here |

Neither card is ever made publicly decryptable, not after a showdown and not after a fold (tested). A player's own
card is refused by the ACL (tested, and refused by the real KMS on Sepolia: measured). The contract itself holds
`allowThis` on the cards only to compare them.

## Public

Player addresses; table phase and betting history (check, bet, call, fold); who is on turn and the turn deadline;
contributions; the winner of a showdown (one decrypted bit); whether each deposit was paid in full (two decrypted
bits, `okA`/`okB`); that a table exists and who sits at it; all transaction timing.

## What this does not hide

- **Chip balances can be recomputed.** They are encrypted in storage, but every amount this game moves is determined
  by public data: the 2 RUSH deposit, the payout (0 to 4, from the public betting history and the winner), and the
  faucet and mint amounts. Anyone can add these up per address. Do not rely on balance privacy.

- **The betting pattern is public.** The game is about reading it.
- **Metadata:** who plays whom and when. FHE hides values, not participation.
- **Short balances:** a player who cannot pay the 2 RUSH deposit is revealed as underfunded (the hand is voided and
  refunded). Beyond what the public amounts already imply (first bullet), a funded player reveals nothing more.
- **Collusion:** a human can tell their opponent what the opponent's own card is (both players see each other's
  card). With two players the opponent has no reason to help; the game is heads-up on purpose.
- **The bot sees the human's card**, as any opponent does. Its operator holds the bot's key and could read the
  human's card from the bot's decryption. The bot's *own* card stays hidden from the bot and its operator.
- **The relayer / KMS** is a trust assumption of the Zama Protocol, not of this project.

## Asynchronous steps and who triggers them

| Step | Who | Notes |
| --- | --- | --- |
| Deal | The second player's `joinTable` transaction | Random cards drawn on-chain in that transaction |
| Reveal the opponent card | Each player's client | Off-chain user decryption; the browser asks once per table |
| `confirmFunds` | Either client, or the bot | Publicly decrypts `okA`/`okB`; runs while the hand is played; a missing deposit voids the hand |
| Showdown result | The transaction that ends the betting computes it | Only `aWins` is made publicly decryptable |
| `finalizeShowdown` | Either client, or the bot | Verifies the decryption proof, pays out; a second submission reverts harmlessly |
| Fold / timeout settlement | Inside `act` / `claimTimeout`, or `confirmFunds` if the deposits were not confirmed yet | No extra transaction |
| `claimTimeout` | Anyone, after 45 s without a move | The player on turn loses |
| Bot moves | The browser pings `apps/bot-api` | If the tab is closed the bot does not move; the human can claim a timeout |

## Known limits

- Not audited. Testnet play-money only.
- Verified on the mock FHEVM and one full hand on Sepolia; no load testing.
- Randomness quality is the Zama protocol's (`FHE.randEuint64`); the card mapping uses a modulo (bias at most 13/2^64).
