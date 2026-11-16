# Indian Poker (Season 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Minority Rush with a live 1-vs-1 Indian poker on Zama FHEVM (Sepolia) plus a mandatory serverless bot, submitted to Zama Developer Program Season 5 by 2026-12-12.

**Architecture:** One new contract `IndianPokerGame` (one hand per table, Kuhn-style betting, escrow of 2 chips per player in `RushChip`) keeps each card ACL-visible to the opponent only and publishes only a win/lose bit. The web app gets a poker feature folder (`apps/web/src/poker/`) with a pure rules module, a live and a demo `PokerClient`, and Lobby/Table screens built around optimistic UI. The bot is a stateless Vercel function (`apps/bot-api`) that advances a table one step per call.

**Tech Stack:** Solidity 0.8.27 + `@fhevm/solidity` 0.11.1 + OpenZeppelin confidential-contracts 0.5.3 (Hardhat 2, mock FHEVM); React 19 + Vite + viem + `@zama-fhe/sdk` + Privy (web); Vitest, oxlint, zod; Vercel Functions (bot, sponsor).

**Spec:** `docs/superpowers/specs/2026-11-16-indian-poker-design.md` (analysis: `docs/season5-spike-report-and-plan.md`; throwaway spike code: scratchpad `spike/`, not in the repo).

## Global Constraints

- Deadline **2026-12-14 23:59 AOE**; target submission **2026-12-12**. **Go/No-Go on 2026-11-22**; fallback = "lowest unique number" built on the old `MinorityRushGame` flow (keep the old contract, tests and UI until Go).
- Network Ethereum **Sepolia**. Stack versions as installed (`@fhevm/solidity` 0.11.1); never hard-code protocol addresses (inherit `ZamaEthereumConfig`).
- Rules: one hand per table; cards 1–13, **distinct**, drawn on-chain; ANTE = 1, BET = 1, DEPOSIT = 2 chips (fixed for all tables); Kuhn betting, **no raises**; `TURN_SECONDS = 45`; open-table list holds the last 20 tables; no `getLogs` or indexer.
- Visibility: A's card is ACL-readable by B only, B's by A only; the contract holds `allowThis`. Cards are **never** `makePubliclyDecryptable`. Only the `aWins` bit and the funds flags `okA`/`okB` are made public.
- HCU per tx: deal < **5M** total and < **2M** depth (hard limits are 20M / 5M). UX budgets: reaction ≤ 1 s, confirm ≤ 15 s, showdown result ≤ 40 s.
- Bot: never says "the operator can't see cards" — the bot (and its operator) sees the human's card by rule; only the bot's **own** card is hidden from both.
- Repo rules: branch `feat/s5-indian-poker`; never push to `main`; Conventional Commits (imperative); explicit return types on exported functions; no `any`; `@/` imports; tests named `it('should <behavior> when <condition>')`; add paths explicitly with `git add <paths>`, never `git add -A`.
- Submission needs a **real-person 3-minute video** (no AI video/voice), an X post, README and docs. These are the user's tasks.

## Review Focus

1. **Own card leaks in the UI.** Client must never request the decrypt of the caller's own card handle, before or after settlement (tested in Task 11 and Task 12).
2. **Reload mid-hand.** Reloading the page must restore table, turn, timer and re-decrypt the opponent card without a new tx (Task 12).
3. **Account switch mid-hand.** Switching wallet/account must clear decrypted cards and the optimistic state (Task 12).
4. **Two clients finalize at once** (both players, plus the bot). The loser of the race must see "already done", never an error (Task 11).
5. **Clock skew.** Turn deadlines must come from chain time, not the browser clock, so the timer never fires early or late (Task 11).
6. **Bot unavailable or broke / table full.** The UI must show a clear message and offer "create a normal table" (Tasks 12, 15).

---

## Phase A — Contracts (week 1, by 11/22)

### Task 1: RushChip owner mint

**Files:** Modify `packages/contracts/contracts/RushChip.sol`; Modify `packages/contracts/test/RushChip.ts` (create if absent).

**Interfaces:** Produces `function mint(address to, uint64 amount) external onlyOwner` (testnet play-money only, documented in NatSpec); `RushChip` becomes `Ownable(msg.sender)`.

- [ ] **Step 1: Write the failing tests** in `test/RushChip.ts`: `it('should let the owner mint chips when called by the deployer')` (decrypt balance == 7), `it('should revert when a non-owner calls mint')` (`OwnableUnauthorizedAccount`).
- [ ] **Step 2: Run** `cd packages/contracts && bunx hardhat test test/RushChip.ts` → FAIL (`mint` undefined).
- [ ] **Step 3: Implement** `mint` with `_mint(to, FHE.asEuint64(amount))`; inherit `Ownable`.
- [ ] **Step 4: Run** the same command and `bunx hardhat test test/MinorityRushGame.ts` → PASS (old game unaffected).
- [ ] **Step 5: Commit** `git add packages/contracts/contracts/RushChip.sol packages/contracts/test/RushChip.ts && git commit -m "feat(contracts): add owner-only mint for bot bankroll"`

### Task 2: IndianPokerGame — tables, escrow, deal

**Files:** Create `packages/contracts/contracts/IndianPokerGame.sol`; Create `packages/contracts/test/IndianPokerGame.ts` (shared helpers `deployAll()`, `fundAndApprove(player)`).

**Interfaces:** Produces (used by every later task):
```solidity
enum Phase { None, Open, Betting, Ended, Settled, Voided, Cancelled }
enum Action { Check, Bet, Call, Fold }
uint64 constant ANTE = 1; uint64 constant BET = 1; uint64 constant DEPOSIT = 2;
uint256 constant TURN_SECONDS = 45; uint256 constant OPEN_LIST_SIZE = 20;
constructor(RushChip chip)
function createTable(address opponent) external returns (uint256 id)   // opponent == address(0): anyone
function joinTable(uint256 id) external                                 // pulls DEPOSIT, deals, phase = Betting
function cancelTable(uint256 id) external                               // creator, phase Open; refunds paid amount
function getOpenTables() external view returns (uint256[] memory)       // last <= 20, Open and opponent == 0
function getTable(uint256 id) external view returns (
  address a, address b, Phase phase, uint8 turn, uint64 turnDeadline,
  uint8 contribA, uint8 contribB, Action[] memory history, bool fundsConfirmed, bool aWon)
function getCardHandles(uint256 id) external view returns (euint8 cardA, euint8 cardB)
function getFundsHandles(uint256 id) external view returns (ebool okA, ebool okB)
function getShowdownHandle(uint256 id) external view returns (ebool aWins)
event TableCreated(uint256 indexed id, address indexed a, address opponent);
event TableJoined(uint256 indexed id, address indexed b);
error TableFull(); error NotOpen(); error NotCreator(); error NotInvited(); error SelfJoin();
```
Table ids start at 1. `getTable.turn`: 0 = A, 1 = B. `turnDeadline` = `block.timestamp + TURN_SECONDS` set at join and after each action. The ok flag is `FHE.eq(paid, FHE.asEuint64(DEPOSIT))` where `paid` is the amount `chip.confidentialTransferFrom` returns (mirror the pull in `MinorityRushGame.sol:193-194`: `FHE.allowTransient(amount, address(chip))` first); credit the returned amount, never the requested one. Deal as in the spike: `a = rem(randEuint64, 13)`, `b = rem(randEuint64, 12)`, `b = select(ge(b, a), b + 1, b)`, cards = value + 1; `allowThis` both; `allow(cardA, b)`, `allow(cardB, a)`. Make `okA`, `okB` publicly decryptable at join.

- [ ] **Step 1: Write the failing tests** (`describe('IndianPokerGame tables')`): `should create an open table and list it when the creator pays the deposit`; `should not list a table reserved for an opponent when opponent is set`; `should revert NotInvited when a stranger joins a reserved table`; `should revert SelfJoin when the creator joins their own table`; `should deal two distinct cards in 1..13 when the second player joins` (loop 30 tables, debugger decrypt, assert distinct and in range); `should let only the opponent decrypt each card when the table is dealt` (B decrypts A's card, A cannot decrypt own, stranger cannot decrypt either); `should not allow public decryption of cards when the table is dealt` (`publicDecrypt([handle])` rejects); `should refund the creator when the table is cancelled`; `should revert TableFull when a third player joins`.
- [ ] **Step 2: Run** `cd packages/contracts && bunx hardhat test test/IndianPokerGame.ts` → FAIL (contract missing).
- [ ] **Step 3: Implement** the contract per the interface above; `createTable` pulls DEPOSIT from the caller (caller must have called `chip.setOperator(game, until)`); store a ring buffer of the last 20 open ids for `getOpenTables`.
- [ ] **Step 4: Run** the test command → PASS.
- [ ] **Step 5: Commit** `git add packages/contracts/contracts/IndianPokerGame.sol packages/contracts/test/IndianPokerGame.ts && git commit -m "feat(contracts): add poker tables with escrow and private deal"`

### Task 3: Betting state machine and timeouts

**Files:** Modify `IndianPokerGame.sol`, `test/IndianPokerGame.ts`.

**Interfaces:** Consumes Task 2 storage. Produces:
```solidity
function act(uint256 id, Action action) external
function claimTimeout(uint256 id) external   // anyone, after turnDeadline: the player on turn loses
event Acted(uint256 indexed id, uint8 seat, Action action);
event Ended(uint256 indexed id, bool showdown, uint8 loserSeat);   // loserSeat = 2 for showdown
error NotYourTurn(); error IllegalAction(); error NotBetting(); error DeadlineNotReached();
```
Legal moves (A = seat 0): step 0 A: Check|Bet. After A Bet: B: Call|Fold. After A Check: B: Check|Bet. After A Check, B Bet: A: Call|Fold. Terminals: Fold → Ended (loser = folder); Call or Check–Check → Ended (showdown). `contribA/contribB` = 1 + (1 if the player bet or called). On a showdown end, `act` computes `aWins = FHE.gt(cardA, cardB)`, `allowThis`, `makePubliclyDecryptable` in the same tx.

- [ ] **Step 1: Write the failing tests** (`describe('betting')`): one test per legal path (`A bet / B call`, `A bet / B fold`, `A check / B check`, `A check / B bet / A call`, `A check / B bet / A fold`) asserting phase `Ended`, contribs and (for showdown) that `getShowdownHandle` decrypts publicly to `cardA > cardB`; `should revert NotYourTurn when the wrong seat acts`; `should revert IllegalAction when B raises after a bet`; `should end the hand with the player on turn losing when claimTimeout is called after 45 s`; `should revert DeadlineNotReached when claimTimeout is called early`; `should not reveal either card when the hand ends by fold` (publicDecrypt of both rejects).
- [ ] **Step 2: Run** `bunx hardhat test test/IndianPokerGame.ts` → FAIL.
- [ ] **Step 3: Implement** `act` as a pure transition table over `(history, seat)` plus `claimTimeout`; reset `turnDeadline` after each non-terminal action.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(contracts): add kuhn betting and turn timeouts" -- packages/contracts/contracts/IndianPokerGame.sol packages/contracts/test/IndianPokerGame.ts`

### Task 4: Funds confirmation and settlement

**Files:** Modify `IndianPokerGame.sol`, `test/IndianPokerGame.ts`.

**Interfaces:** Consumes Tasks 2–3. Produces:
```solidity
function confirmFunds(uint256 id, bool okA, bool okB, bytes calldata proof) external  // after join; once
function finalizeShowdown(uint256 id, bool aWins, bytes calldata proof) external      // phase Ended(showdown), fundsConfirmed
function finalizeFold(uint256 id) external                                             // phase Ended(fold), fundsConfirmed
event FundsConfirmed(uint256 indexed id, bool ok);
event Settled(uint256 indexed id, uint8 winnerSeat);   // 0 = A, 1 = B
event Voided(uint256 indexed id);
error FundsNotConfirmed(); error AlreadyConfirmed(); error NotEnded();
```
`confirmFunds` verifies `FHE.checkSignatures` over `[okA, okB]` built from **storage** handles (`FHE.toBytes32`); if not both true → phase `Voided` and each player gets back their `paid` amount via `confidentialTransfer` (encrypted handles, `allowTransient` to the chip). If the hand already ended by fold and funds are now confirmed, settle immediately. `act` (Fold) and `claimTimeout` also settle immediately when `fundsConfirmed`, so a fold needs no extra tx. Payout in plaintext units: `to(P) = (2 - contrib(P)) + (P wins ? contribA + contribB : 0)`, sent with `confidentialTransfer(P, FHE.asEuint64(units))` (skip zero). `finalizeShowdown` verifies `[aWins]` and a stage flag prevents replay.

- [ ] **Step 1: Write the failing tests** (`describe('settlement')`): `should pay the winner the pot and refund unused deposit when a showdown is finalized` (decrypt both balances after: winner +2 net after A-bet/B-call, loser −2); `should settle a fold in the act transaction when funds are already confirmed`; `should settle a fold when confirmFunds arrives after the fold`; `should void the hand and refund when a player was underfunded` (give B a 1-chip balance; funds flags decrypt to `[true,false]`; both balances restored); `should revert FundsNotConfirmed when finalizing before confirmFunds`; `should revert when a forged result is submitted` (`finalizeShowdown(id, !aWins, proof)`); `should revert when finalizeShowdown is replayed`; `should revert AlreadyConfirmed when confirmFunds is submitted twice`.
- [ ] **Step 2: Run** `bunx hardhat test test/IndianPokerGame.ts` → FAIL.
- [ ] **Step 3: Implement** the three functions and the shared `_payout(id, winnerSeat)`.
- [ ] **Step 4: Run** → PASS; also `bunx hardhat test` (whole suite) → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(contracts): add funds confirmation and settlement" -- packages/contracts/contracts/IndianPokerGame.sol packages/contracts/test/IndianPokerGame.ts`

### Task 5: HCU budget

**Files:** Modify `IndianPokerGame.sol` (deal only), `test/IndianPokerGame.ts`.

**Interfaces:** Consumes Task 2 `joinTable`. Produces no new API; the deal must hold the Global Constraints budget.

- [ ] **Step 1: Write the failing test** `describe('HCU')`: `it('should keep the join transaction under 5M total and 2M depth HCU')` using `fhevm.computeTransactionHCU(receipt)`; also log `act` (showdown) and `confirmFunds` HCU.
- [ ] **Step 2: Run** → FAIL (spike baseline: ≈ 2.72M total, 1.40M depth; join also adds a transfer ≈ 0.5M, so the sum may exceed the target — confirm).
- [ ] **Step 3: Implement** the reduction only if needed: smaller random types (e.g. `randEuint16` with a bias note) or `randEuint8` with a power-of-two reduction plus rejection-free mapping; record the bias chosen in NatSpec.
- [ ] **Step 4: Run** the whole contract suite → PASS.
- [ ] **Step 5: Commit** `git commit -m "perf(contracts): keep deal within HCU budget" -- packages/contracts/contracts/IndianPokerGame.sol packages/contracts/test/IndianPokerGame.ts`

### Task 6: Deploy, ABI export and Sepolia smoke (Go/No-Go gate)

**Files:** Modify `packages/contracts/scripts/deploy.ts`, `export-abi.ts`; Create `packages/contracts/scripts/smoke-poker.ts`; Modify `packages/contracts/package.json` (`smoke:poker:sepolia`); Create `docs/season5-gate-result.md`.

**Interfaces:** Produces `deployment.sepolia.json` fields `rushChip`, `poker` (address), and `abi.json` key `pokerAbi`. `smoke-poker.ts` plays one full hand between two funded keys (`PRIVATE_KEY`, `PRIVATE_KEY_2`) and prints, in seconds: join→deal visible, opponent-card decrypt, each `act` confirm, `confirmFunds`, showdown-result availability, total. Exits non-zero on any failure.

**Needs the user (ask before running):** funded Sepolia keys and the go-ahead to deploy (spends ETH). Do not run Sepolia commands without it.

- [ ] **Step 1: Update** `deploy.ts` to deploy `RushChip` then `IndianPokerGame(chip)` (keep `MinorityRushGame` deployed too until Go) and write the addresses; update `export-abi.ts` to add `pokerAbi`.
- [ ] **Step 2: Write** `smoke-poker.ts`; verify locally first: `cd packages/contracts && bunx hardhat node` (terminal A), `bun run smoke:poker:local` (terminal B, add this script) → prints `OK: full hand verified`.
- [ ] **Step 3: With the user's approval**, run `bun run deploy:sepolia && bun run export:abi && bun run smoke:poker:sepolia`.
- [ ] **Step 4: Write** `docs/season5-gate-result.md` with the measured seconds per step and the verdict against the UX budgets (confirm ≤ 15 s, showdown ≤ 40 s). **Go** = a full hand passes and budgets are not grossly exceeded; otherwise **No-Go** → stop this plan and start the fallback.
- [ ] **Step 5: Commit** `git add packages/contracts/scripts packages/contracts/package.json docs/season5-gate-result.md apps/web/src/contracts && git commit -m "chore(contracts): deploy poker to sepolia and record gate result"`

### Task 7: Bot decrypt feasibility spike (throwaway, Sepolia)

**Files:** Scratchpad only (do not commit): a Node script that, as a plain EOA key, reads a dealt table from Task 6's deployment and decrypts the **opponent's** card with `@zama-fhe/sdk` in Node, and submits `act` — then run the same code inside a Vercel-style function locally (`vercel dev`) to check WASM/bundle limits.

- [ ] **Step 1: Write and run** the script against the deployed contracts → expected: opponent card decrypts; own card decrypt rejects.
- [ ] **Step 2: Record** the result in `docs/season5-gate-result.md` ("Bot hosting: Vercel function OK / needs an always-on worker, because …"). A "needs a worker" result changes Task 15's hosting (Fly.io/Railway process) but not its logic.
- [ ] **Step 3: Commit** only the doc: `git commit -m "docs: record bot decrypt feasibility" -- docs/season5-gate-result.md`

---

## Phase B — Web (week 2, only after Go)

### Task 8: Sponsor allowlist for the poker contract

**Files:** Modify `apps/sponsor-api/src/validate.ts`, `validate.test.ts`, `config.ts` (+ `config.test.ts`), `.env.example`.

**Interfaces:** `Allowlist` becomes `{ chip; game }` where `game` is the poker address (env `GAME_ADDRESS` unchanged). `GAME_SELECTORS` = `createTable(address)`, `joinTable(uint256)`, `cancelTable(uint256)`, `act(uint256,uint8)`, `claimTimeout(uint256)`, `confirmFunds(uint256,bool,bool,bytes)`, `finalizeShowdown(uint256,bool,bytes)`, `finalizeFold(uint256)`. `MAX_CALLS` stays 4 (first-time batch = faucet + setOperator + createTable/joinTable = 3).

- [ ] **Step 1: Write the failing tests** in `validate.test.ts`: one `should allow <function> when called on the game` per selector; `should reject enter(uint256,bytes32,bytes32,bytes) when the game is the poker contract`; `should allow a 3-call batch of faucet, setOperator(game) and joinTable`; keep `should reject setOperator when the operator is not the game`.
- [ ] **Step 2: Run** `cd apps/sponsor-api && bunx vitest run src/validate.test.ts` → FAIL.
- [ ] **Step 3: Replace** `GAME_SELECTORS` with the list above.
- [ ] **Step 4: Run** `bunx vitest run` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(sponsor-api): allow poker game calls" -- apps/sponsor-api`

### Task 9: Poker rules module (pure)

**Files:** Create `apps/web/src/poker/types.ts`, `apps/web/src/poker/rules.ts`, `apps/web/src/poker/rules.test.ts`.

**Interfaces:** Produces:
```ts
export type Seat = "A" | "B";
export type PokerAction = "check" | "bet" | "call" | "fold";
export type TablePhase = "open" | "betting" | "ended" | "settled" | "voided" | "cancelled";
export type TableView = { id: number; phase: TablePhase; playerA: string; playerB: string | null;
  mySeat: Seat | null; turn: Seat | null; turnDeadlineMs: number; history: PokerAction[];
  contribA: number; contribB: number; fundsConfirmed: boolean; winner: Seat | null;
  endKind: "fold" | "showdown" | null };
export function legalActions(history: readonly PokerAction[]): PokerAction[];   // [] when the hand is over
export function seatOnTurn(history: readonly PokerAction[]): Seat | null;
export function applyOptimistic(view: TableView, seat: Seat, action: PokerAction, nowMs: number): TableView;
export function secondsLeft(deadlineMs: number, chainNowMs: number): number;   // >= 0
```
- [ ] **Step 1: Write the failing tests** (`legalActions([])` = check, bet; `legalActions(["bet"])` = call, fold; `["check"]` = check, bet; `["check","bet"]` = call, fold; terminal histories = `[]`; `seatOnTurn` for each; `applyOptimistic` adds the action and flips the turn without touching `phase` until terminal; `secondsLeft` clamps at 0).
- [ ] **Step 2: Run** `cd apps/web && bunx vitest run src/poker/rules.test.ts` → FAIL.
- [ ] **Step 3: Implement** the four functions in `rules.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): add poker rules module" -- apps/web/src/poker`

### Task 10: PokerClient interface and demo client

**Files:** Create `apps/web/src/poker/client.ts`, `apps/web/src/poker/demoPokerClient.ts`, `apps/web/src/poker/demoPokerClient.test.ts`.

**Interfaces:** Consumes Task 9 types. Produces:
```ts
export type OnStep = (label: string) => void;
export interface PokerClient {
  readonly mode: "live" | "demo";
  connect(): Promise<string>;
  onboard(onStep: OnStep): Promise<void>;                     // faucet + setOperator when needed
  readBalance(): Promise<number>;
  createTable(opponent: string | null, onStep: OnStep): Promise<number>;
  joinTable(id: number, onStep: OnStep): Promise<void>;
  cancelTable(id: number, onStep: OnStep): Promise<void>;
  act(id: number, action: PokerAction, onStep: OnStep): Promise<void>;
  claimTimeout(id: number, onStep: OnStep): Promise<void>;
  getTable(id: number): Promise<TableView>;
  listOpenTables(): Promise<number[]>;
  revealOpponentCard(id: number): Promise<number>;            // never the caller's own card
  settleIfReady(id: number, onStep: OnStep): Promise<void>;   // confirmFunds / finalize, "already done" is success
  chainNowMs(): Promise<number>;
}
export function createDemoPokerClient(): PokerClient;       // in-memory, built-in bot, no network
export function createPokerClient(kind: "email" | "wallet"): PokerClient;  // demo when not deployed
```
- [ ] **Step 1: Write the failing tests**: `should play a full hand against the built-in bot when running offline`; `should never expose the caller's own card when revealOpponentCard is used`; `should return an empty open list when no table is open`.
- [ ] **Step 2: Run** `bunx vitest run src/poker/demoPokerClient.test.ts` → FAIL.
- [ ] **Step 3: Implement** the demo client with the rules module and a random-threshold bot (the real strategy replaces it in Task 14).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): add poker client interface and demo client" -- apps/web/src/poker`

### Task 11: Live poker client

**Files:** Create `apps/web/src/poker/livePokerClient.ts`, `apps/web/src/poker/livePokerClient.test.ts`; Modify `apps/web/src/lib/env.ts` (`pokerAddress`, `botAddress`, `botApiUrl`).

**Interfaces:** Consumes the contract ABI (`pokerAbi`), `Session` (`apps/web/src/lib/session.ts`), the Zama SDK usage in `liveClient.ts` (copy its permit/decrypt pattern, request the permit once per table). `turnDeadlineMs` and `chainNowMs()` come from chain block timestamps. `settleIfReady` checks phase and `fundsConfirmed`, fetches public decryption (`confirmFunds` handles `getFundsHandles`; showdown handle `getShowdownHandle`), submits, and treats an already-done revert as success (reuse `isAlreadyDoneRevert` from `lib/settleQueue.ts`).

- [ ] **Step 1: Write the failing tests** with a mocked `Session`/SDK: `should decrypt only the opponent card handle when revealOpponentCard is called as seat A` (and as seat B); `should treat an already-finalized revert as success when two clients finalize`; `should compute the turn deadline from the block timestamp when the browser clock is skewed`.
- [ ] **Step 2: Run** `bunx vitest run src/poker/livePokerClient.test.ts` → FAIL.
- [ ] **Step 3: Implement** the interface; first-time `onboard` on a Privy smart account sends one batch (faucet, `setOperator(game, 7 days)`) — merged with `createTable`/`joinTable` in Task 13.
- [ ] **Step 4: Run** `bunx vitest run` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): add live poker client" -- apps/web/src`

### Task 12: Lobby and Table screens (wait-time UX)

**Files:** Create `apps/web/src/poker/Lobby.tsx`, `Table.tsx`, `useTable.ts`, `useTable.test.ts`, `reveal.tsx` (card flip), styles under `apps/web/src/styles/`; Modify `apps/web/src/App.tsx` (route to Lobby/Table; keep the old screens until Task 17).

**Interfaces:** `useTable(client: PokerClient, id: number): { view: TableView | null; opponentCard: number | null; secondsLeft: number; busy: string | null; act(a: PokerAction): Promise<void>; claimTimeout(): Promise<void>; error: string | null }`. Behaviors: poll `getTable` (~2 s); decrypt the opponent card as soon as the phase becomes `betting`; `act` applies `applyOptimistic` at once and reconciles on the next poll; call `settleIfReady` automatically when the phase is `ended` or `fundsConfirmed` is false in `betting`; card-flip animation hides the showdown wait; show the turn-timer ring and a title blink + sound only while the tab is open. Follow `app-ui-design` (no emoji icons, no glowing effects). Lobby: "Play the bot", "Create table", "Join by link", open tables list.

- [ ] **Step 1: Write the failing tests** (`useTable.test.ts`, demo client): `should show the optimistic action immediately when act is pressed`; `should request the opponent card once the table is dealt`; `should never request the own card when the hand is settled`; `should restore turn, timer and opponent card when the hook mounts on an existing table`; `should clear the decrypted card and optimistic state when the account changes`; `should call claimTimeout path when secondsLeft reaches 0 on the opponent's turn`.
- [ ] **Step 2: Run** `bunx vitest run src/poker/useTable.test.ts` → FAIL.
- [ ] **Step 3: Implement** the hook, then the two screens against `PokerClient`.
- [ ] **Step 4: Run** `bunx vitest run && bun run lint && bun run build` in `apps/web` → PASS; then `bun run dev` with the demo client and play one hand in the browser (built-in browser) to check layout at 390 px width.
- [ ] **Step 5: Commit** `git commit -m "feat(web): add poker lobby and table screens" -- apps/web/src`

### Task 13: First-time batch onboarding

**Files:** Modify `apps/web/src/poker/livePokerClient.ts`, `livePokerClient.test.ts`, `apps/web/src/lib/aaSession.ts` only if it lacks batch send.

**Interfaces:** `createTable`/`joinTable` on a Privy smart account first checks the faucet cooldown and operator status; if either is missing it sends **one UserOp** `[faucet?, setOperator(game, +7d)?, createTable|joinTable]` (≤ 3 calls); injected wallets send separate txs.

- [ ] **Step 1: Write the failing tests**: `should send a single batch when a new smart-account player joins`; `should send only the join call when chips and operator already exist`.
- [ ] **Step 2: Run** `bunx vitest run src/poker/livePokerClient.test.ts` → FAIL.
- [ ] **Step 3: Implement** the batching in the live client.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): batch first-time onboarding into one user operation" -- apps/web/src`

---

## Phase C — Bot (week 3)

### Task 14: Bot strategy (pure)

**Files:** Create `apps/bot-api/src/strategy.ts`, `strategy.test.ts` (new package `apps/bot-api`, mirror `apps/sponsor-api/package.json` and `tsconfig.json`).

**Interfaces:** Produces `export function decideAction(opponentCard: number, history: readonly PokerAction[], seat: Seat, random: () => number): PokerAction` (returns only legal actions). The bot sees only the opponent's card (1–13). Rule: the lower the opponent's card, the more likely the bot's card is higher → bet/call; high opponent card → check/fold; ~15% bluff bets when the opponent's card is high.

- [ ] **Step 1: Write the failing tests**: `should always return a legal action when given any card and history`; `should call a bet more often when the opponent holds a low card` (seeded `random`, 1000 trials); `should fold to a bet more often when the opponent holds a high card`.
- [ ] **Step 2: Run** `cd apps/bot-api && bunx vitest run` → FAIL.
- [ ] **Step 3: Implement** with thresholds as named constants.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(bot-api): add bot strategy" -- apps/bot-api`

### Task 15: Bot API (advance one step)

**Files:** Create `apps/bot-api/api/bot.ts`, `src/handler.ts`, `handler.test.ts`, `src/auth.ts`, `src/config.ts`, `.env.example`, `vercel.json`.

**Interfaces:** `POST /api/bot` body `{ tableId: number }`. `handleBot(req: BotRequest, deps: Deps): Promise<BotResponse>` with injected `deps` (mirror `apps/sponsor-api/src/handler.ts`): `verifyToken`, `limiter`, `chain` (read table, `joinTable`, `act`, `confirmFunds`, `finalize*`), `decryptOpponentCard`, `random`, `bankroll`. Behavior per call (idempotent): table `Open` and reserved for the bot → join; `Betting` and bot's turn → decide and `act`; `Betting` and funds unconfirmed → `confirmFunds`; `Ended` → finalize; otherwise no-op. Auth: Privy token (`verifyToken`) **or** an EIP-191 signature by the table creator over `bot:<tableId>`. Limits: per-user rate limit, one active bot table per user, global cap `BOT_MAX_TABLES` (env), refuse with `503 {reason:"bot_busy"|"bot_broke"}` when capped or when ETH/chip balance is below `BOT_MIN_ETH`/`BOT_MIN_CHIPS`. The bot key is env-only (`BOT_PRIVATE_KEY`). Hosting per Task 7's result.

- [ ] **Step 1: Write the failing tests** (fake deps): `should join a table reserved for the bot when the table is open`; `should act with the strategy decision when it is the bot's turn`; `should confirm funds when betting has started and funds are unconfirmed`; `should do nothing when it is the opponent's turn`; `should reject 401 when no valid token or signature is given`; `should reject 429 when the user exceeds the rate limit`; `should reject 503 bot_busy when the global table cap is reached`; `should reject 503 bot_broke when the bankroll is below the floor`; `should never request the decrypt of the bot's own card`.
- [ ] **Step 2: Run** `cd apps/bot-api && bunx vitest run` → FAIL.
- [ ] **Step 3: Implement** `handler.ts`, `auth.ts`, `config.ts` (zod-validated env), and the thin `api/bot.ts` that wires real viem + Zama SDK dependencies.
- [ ] **Step 4: Run** `bunx vitest run && bunx tsc --noEmit` → PASS; then local `vercel dev` smoke against Sepolia with the demo flow from Task 7.
- [ ] **Step 5: Commit** `git commit -m "feat(bot-api): add bot advance endpoint" -- apps/bot-api`

### Task 16: Wire the bot into the web and fund it

**Files:** Modify `apps/web/src/poker/Lobby.tsx`, `livePokerClient.ts` (`playBot()`), `apps/web/.env.example`; Create `packages/contracts/scripts/fund-bot.ts`; Modify `docs/deployment.md`.

**Interfaces:** `playBot(): Promise<number>` creates a table reserved for `env.botAddress`, then calls `POST {botApiUrl}` after each of the user's actions and on a 3 s timer while it is the bot's turn; a `bot_busy`/`bot_broke` response shows a message with a "Create a normal table" button. `fund-bot.ts` mints `BOT_CHIPS` via `RushChip.mint` and prints the ETH the user must send to the bot address.

**Needs the user:** the bot wallet's Sepolia ETH and its key in Vercel env.

- [ ] **Step 1: Write the failing test** in `livePokerClient.test.ts`: `should call the bot endpoint after the user acts when playing the bot`; `should show a busy message when the bot endpoint returns 503`.
- [ ] **Step 2: Run** `cd apps/web && bunx vitest run src/poker` → FAIL.
- [ ] **Step 3: Implement** `playBot`, the Lobby button and the message; write `fund-bot.ts`.
- [ ] **Step 4: Run** the web test suite → PASS; then, with the user's go-ahead, play a hand on Sepolia against the deployed bot end to end.
- [ ] **Step 5: Commit** `git commit -m "feat(web): connect the lobby to the bot" -- apps/web packages/contracts/scripts/fund-bot.ts docs/deployment.md`

---

## Phase D — Cleanup and submission (weeks 3–4)

### Task 17: Remove the old game, update docs, run quality gates

**Files:** Delete `packages/contracts/contracts/MinorityRushGame.sol`, `test/MinorityRushGame.ts`, `scripts/smoke.ts`, `scripts/schedule.config.ts`; delete the old web files confirmed unused by `grep -rn` (`home.tsx`, `homeState*.ts`, `lib/schedule*.ts`, `lib/streak*.ts`, `lib/shareGrid*.ts`, `lib/share*.ts`, `lib/settleQueue*.ts` unless reused, `lib/liveClient.ts`, `lib/demoClient.ts`, `lib/outcomes*.ts`, old `GameClient` types); Modify `README.md`, `docs/deployment.md`, `docs/architecture.drawio` + `.png`, `.serena/memories/*` that mention the old game; Create `docs/privacy-summary.md`.

Only run **after** Go and after Task 16 works on Sepolia.

- [ ] **Step 1: Delete** the old files; run `grep -rn "MinorityRush\|startRound\|closeRound\|GameClient" apps packages docs README.md` and resolve every hit.
- [ ] **Step 2: Rewrite** the README (rules, architecture, run guide, the honest privacy statement, "not audited"), and `docs/privacy-summary.md`: what is encrypted, what is public, who can decrypt what, every async step and who triggers it.
- [ ] **Step 3: Run the gates:** `cd packages/contracts && bun run lint && bunx hardhat test`; `python3 ~/.claude/skills/zama-fhevm/scripts/fhevm_lint.py packages/contracts/contracts apps/web/src` (resolve or justify every finding); `cd apps/web && bun run lint && bunx vitest run && bun run build`; `cd apps/sponsor-api && bunx vitest run`; `cd apps/bot-api && bunx vitest run`.
- [ ] **Step 4: Run** `bun run smoke:poker:sepolia` and one full hand through the web app against the bot on Sepolia.
- [ ] **Step 5: Commit** in small commits per area (contracts, web, docs): `git commit -m "refactor: remove minority rush game" -- <paths>`, then `git commit -m "docs: rewrite readme for indian poker" -- README.md docs`.

### Task 18: Submission pack

**Files:** Create `docs/season5-submission.md`.

**Interfaces:** A checklist and drafts the user finishes.

- [ ] **Step 1: Write** the 3-minute video outline (hook: "a card you can't see, a bluff nobody can read from the chain", 1 live hand vs the bot, a 2-account hand, the privacy summary, fairness via on-chain randomness, honest limits), an X post draft, and the submission-form field list.
- [ ] **Step 2: Add** the checklist: deployed addresses, working live URL, README, tests passing, video recorded by the user, X post published, form submitted by **2026-12-12**.
- [ ] **Step 3: Commit** `git commit -m "docs: add season 5 submission pack" -- docs/season5-submission.md`
- [ ] **Step 4: Open the PR** to `main` (small, squash-merge) and hand the checklist to the user.

---

## Self-review (done while writing)

- **Spec coverage:** rules (T2–T4), ACL visibility (T2), deposit/funds flags and void (T2, T4), timeouts (T3), settlement without `claim` (T4), HCU (T5), Sepolia gate and fallback (T6), bot decrypt risk (T7), sponsor allowlist (T8), UX wait strategy — optimistic UI, single-batch onboarding, auto-confirm/finalize, reveal animation, timer (T9–T13), bot incl. abuse caps/funding (T14–T16), old-game removal timing and docs (T17), video/X/form (T18). Open-table list via on-chain view (T2). Demo client (T10).
- **Decisions beyond the spec** (please review): `createTable(address opponent)` reserves a table for the bot or a friend (prevents a human hijacking a bot table); bot lives in its own package `apps/bot-api` (separate secrets); one `POST /api/bot` "advance" endpoint; `RushChip` becomes `Ownable` with `mint`; `RushChip` and the game are redeployed together, so old balances are abandoned.
- **Type consistency:** contract `Action` order (Check, Bet, Call, Fold) must match `PokerAction` mapping in the live client; `turn` 0/1 ↔ `Seat` "A"/"B".
