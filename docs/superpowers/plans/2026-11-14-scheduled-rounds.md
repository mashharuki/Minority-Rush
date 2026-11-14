# Scheduled Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Minority Rush into a daily-habit game: 4 fixed deadlines per day, everyone plays the same round, a spoiler-free share grid and a participation streak.

**Architecture:** The game contract gets a fixed daily schedule (deadlines as UTC seconds-of-day, set at construction, immutable) and permissionless `startRound` that only works inside a 90-minute window before a deadline. The web app derives everything else client-side: countdown, streak and share grid come from contract reads (`getRound`/`getEntry` multicall) and from decrypting the player's own choice. No indexer, no keeper, no new events.

**Tech Stack:** Solidity 0.8.27 + Zama FHEVM + Hardhat 2 (`packages/contracts`, mock FHEVM tests); React 19 + Vite + viem + `@zama-fhe/sdk` (`apps/web`); vitest (added to `apps/web`); bun.

**Spec:** `docs/superpowers/specs/2026-11-14-scheduled-rounds-design.md` (approved 2026-11-14)

## Global Constraints

- Deadlines (UTC seconds-of-day, = JST 12:00 / 18:00 / 21:00 / 23:00): `[10800, 32400, 43200, 50400]`. Window: `5400` s (90 min) before each deadline. Windows never overlap and keep a gap of at least 1800 s.
- `minPlayers = 3`, `maxPlayers = 100`. Stake range stays 1 to 10. Tie-break stays `FHE.randEbool`.
- Only one round may be Open at a time; a Closing round must not block the next `startRound`.
- Faucet: 20 chips, cooldown 24 hours (was 1 hour).
- Streak and day numbers use JST days: `jstDayKey(unixSec) = floor((unixSec + 32400) / 86400)`.
- Share text never contains side or stake; squares are 🟩 won, ⬛ lost, ⬜ none. Points have no monetary value: no cash-out, trading or price links.
- Existing UI copy is English; the share text is Japanese as in the spec. UI changes must pass `app-ui-design` (zero findings from `tools/check-ui.mjs` in https://github.com/minorun365/unslop-ai-app).
- Rules in `.claude/rules/` apply: explicit return types on exported functions, `@/` aliases, no empty catch, tests next to source, Conventional Commits, branch `feat/scheduled-rounds` (never commit to `main`), stage explicit paths only (never `git add -A`; `.claude/logs/sessions.log`, `reports/` and `research_notes/` are not part of this work).

## Review Focus

Failure modes the spec implies; each has a test in the owning task.

1. Fewer than 3 players at the deadline: round cancels and stakes are refunded, no revert (Task 1).
2. `startRound` outside any window, or when a round is already Open: reverts with a clear custom error (Task 1); the UI shows "waiting" with the next window time instead of an error (Task 3, Task 5).
3. The day boundary: a deadline after the last one of the day wraps to the next day's first deadline; streak days roll over at JST midnight (Task 1, Task 3).
4. Today not yet played must not break the streak; a missed yesterday does (Task 3).
5. `navigator.share` and the clipboard are unavailable or rejected: the share button reports failure instead of throwing (Task 3).

---

### Task 1: Scheduled rounds in the game contract

**Files:**
- Modify: `packages/contracts/contracts/MinorityRushGame.sol`
- Modify: `packages/contracts/contracts/RushChip.sol` (`FAUCET_COOLDOWN = 24 hours`)
- Modify: `packages/contracts/test/MinorityRushGame.ts`

**Interfaces:**
- Produces (Solidity, used by Tasks 2, 4):
  - `constructor(IERC7984 chip_, uint32[] memory deadlinesUtc_, uint32 windowSeconds_, uint16 minPlayers_, uint16 maxPlayers_)`
  - `function schedule() external view returns (uint32[] memory deadlinesUtc, uint32 window)`
  - `function nextDeadline(uint64 ts) public view returns (uint64)` — first deadline strictly after `ts`, wrapping to the next day's first deadline.
  - `function startRound() external returns (uint256 roundId)` — round `endTime` equals the next deadline.
  - `getRound(uint256)` now returns `uint16 playerCount`. `roundDuration`, `MIN_PLAYERS`, `MAX_PLAYERS` are removed; `minPlayers()` and `maxPlayers()` are public immutables.
  - Errors: `BadSchedule()`, `OutsideWindow()`, `RoundAlreadyStarted()`; existing `RoundStillActive` now means "an Open round exists".

- [ ] **Step 1: Update the test helpers and fixtures first.** Replace `DURATION` with `DEADLINES = [10800, 32400, 43200, 50400]`, `WINDOW = 5400`; deploy with `(chipAddr, DEADLINES, WINDOW, 3, 100)`. Add helpers: `openWindow()` (reads `latest()` from `@nomicfoundation/hardhat-network-helpers`, computes `end = await game.nextDeadline(now)`, and `time.increaseTo(end - WINDOW)` if now is earlier, then returns `end`) and change `settle(roundId)` to `time.increaseTo(endTime)` using `getRound(roundId)`'s `endTime`. Every existing test that calls `game.startRound()` calls `await openWindow()` first. Existing 2-player and 8-player tests are rewritten to the new limits (3-player minimum, cap test deploys a second game with `maxPlayers = 3`).

- [ ] **Step 2: Write the failing tests** (each in `describe("scheduled rounds")`):
  - `"opens a round that ends at the next deadline"`: after `openWindow()`, `startRound()`; `getRound(1).endTime == end`.
  - `"rejects startRound outside the window"`: `time.increaseTo(end - WINDOW - 60)` then `startRound()` → `revertedWithCustomError(game, "OutsideWindow")`.
  - `"rejects startRound while a round is open"` → `RoundStillActive`.
  - `"a closing round does not block the next window"`: round 1 settled to Closing only (call `closeRound`, no `finalizeRound`), `time.increaseTo` into the next window, `startRound()` succeeds and returns 2.
  - `"nextDeadline is strictly after the given time"`: `nextDeadline(D) ==` the following deadline and `nextDeadline(D - 1) == D` for `D = day0 + 10800`. (`RoundAlreadyStarted` is a defensive guard that no normal sequence can reach, so it has no test.)
  - `"nextDeadline wraps past the last deadline of the day"`: with `day0 = floor(now/86400)*86400`, `nextDeadline(day0 + 50400) == day0 + 86400 + 10800`.
  - `"cancels and refunds with fewer than 3 players"`: two players enter, settle after the deadline, status is Cancelled (4), both `claim` and `balanceOf` returns to 20.
  - `"caps the room at maxPlayers"`: second deployment with `maxPlayers = 3`; the 4th `enter` reverts `RoundFull`.
  - `"rejects a bad schedule"`: deploying with `[]`, with unsorted `[43200, 10800]`, with a window larger than the smallest gap minus 1800 (e.g. `WINDOW = 12000` for the default deadlines), with `minPlayers = 1`, and with `maxPlayers < minPlayers` each reverts `BadSchedule`.
  - In `RushChip`'s faucet test: after the first claim, `time.increase(24 * 3600 - 60)` then `faucet()` reverts `FaucetCoolingDown`; after another `time.increase(120)` it succeeds.

- [ ] **Step 3: Run the tests to see them fail**

Run: `bun --cwd packages/contracts run test`
Expected: compile or deployment failures (new constructor and errors do not exist yet).

- [ ] **Step 4: Implement the contract.** Store `uint32[] private _deadlines`, `uint32 public immutable windowSeconds`, `uint16 public immutable minPlayers`, `uint16 public immutable maxPlayers`. Constructor validates and reverts `BadSchedule()` for: empty list, not strictly ascending, last deadline `>= 86400`, `windowSeconds == 0`, `windowSeconds + 1800 >` the smallest gap between consecutive deadlines (including the wrap gap `86400 - last + first`), `minPlayers < 2`, `maxPlayers < minPlayers`. `nextDeadline(ts)`: `day = ts / 86400`, `sod = ts % 86400`; return `day * 86400 + d` for the first `d > sod`, else `(day + 1) * 86400 + _deadlines[0]`. `startRound()`: `end = nextDeadline(now)`; revert `OutsideWindow()` if `now < end - windowSeconds`; revert `RoundStillActive()` if the latest round is Open; revert `RoundAlreadyStarted()` if the latest round's `endTime == end`; then create the round with `endTime = end`. `Round.playerCount` and the cap/min comparisons become `uint16`.

- [ ] **Step 5: Change `FAUCET_COOLDOWN` to `24 hours`** in `RushChip.sol`.

- [ ] **Step 6: Run the tests until they pass, then lint**

Run: `bun --cwd packages/contracts run test && bun --cwd packages/contracts run lint:sol`
Expected: all tests pass (the existing privacy, observer, forged-proof and tie tests unchanged in behaviour), solhint clean.

- [ ] **Step 7: Create the branch and commit**

```bash
git checkout -b feat/scheduled-rounds
git add docs/superpowers/specs/2026-11-14-scheduled-rounds-design.md docs/superpowers/plans/2026-11-14-scheduled-rounds.md
git commit -m "docs: add scheduled-rounds design and implementation plan"
git add packages/contracts/contracts packages/contracts/test
git commit -m "feat(contracts): add fixed daily schedule, player caps and 24h faucet"
```

---

### Task 2: Deployment tooling, ABI and smoke test

**Files:**
- Create: `packages/contracts/scripts/schedule.config.ts`
- Modify: `packages/contracts/scripts/deploy.ts`, `packages/contracts/scripts/smoke.ts`
- Modify (generated): `apps/web/src/contracts/abi.json` via `bun run export:abi`

**Interfaces:**
- Consumes: the constructor and views from Task 1.
- Produces: `export const DEADLINES_UTC: readonly number[]`, `WINDOW_SECONDS: number`, `MIN_PLAYERS: number`, `MAX_PLAYERS: number` in `schedule.config.ts` (values from Global Constraints); the new `abi.json` that Tasks 4 and 5 consume.

- [ ] **Step 1: Create `schedule.config.ts`** exporting the four constants above and nothing else.

- [ ] **Step 2: Update `deploy.ts`** to deploy `MinorityRushGame` with `(chipAddress, [...DEADLINES_UTC], WINDOW_SECONDS, MIN_PLAYERS, MAX_PLAYERS)` and drop `ROUND_DURATION_SECONDS`.

- [ ] **Step 3: Update `smoke.ts`.** Local: deploy with the same constants, and before `startRound` fast-forward into the next window (`nextDeadline` minus `WINDOW_SECONDS`); use `endTime` from `getRound` instead of `roundDuration()`; enter with three wallets (the new minimum) on local, and on Sepolia use the signers available but print a clear message when fewer than 3 exist (the round will cancel and refund). After `closeRound`, log elapsed seconds until `finalizeRound` is confirmed as `[smoke] close→finalized: <n>s`, and log `gasUsed` of one `enter` as `[smoke] enter gas: <n>`.

- [ ] **Step 4: Regenerate and verify**

Run: `bun --cwd packages/contracts run compile && bun run export:abi`, then start a local node in the terminal (`bun --cwd packages/contracts run chain`) and run `bun --cwd packages/contracts run smoke:local`.
Expected: `abi.json` contains `schedule` and `nextDeadline`; the smoke run prints the two timing lines and ends without error.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/scripts apps/web/src/contracts/abi.json
git commit -m "chore(contracts): deploy and smoke with the daily schedule"
```

---

### Task 3: Pure logic in the web app (schedule, streak, share, outcomes)

**Files:**
- Modify: `apps/web/package.json` (devDependency `vitest` `^5.1.0`, script `"test": "vitest run"`)
- Create: `apps/web/src/lib/schedule.ts`, `streak.ts`, `shareGrid.ts`, `share.ts`, `outcomes.ts` and a `*.test.ts` next to each

**Interfaces (produced; used by Tasks 4 and 5):**
```ts
// schedule.ts
export type Schedule = { deadlinesUtcSec: readonly number[]; windowSec: number }
export type JoinState =
  | { kind: 'free' }
  | { kind: 'open'; endMs: number }
  | { kind: 'startable'; endMs: number }
  | { kind: 'waiting'; opensMs: number; endMs: number }
export const JST_OFFSET_SEC: number // 32400
export function nextDeadline(schedule: Schedule, nowSec: number): number
export function jstDayKey(unixSec: number): number
export function dayNumber(unixSec: number, launchDayKey: number): number
export function joinState(schedule: Schedule | null, nowMs: number, round: { status: RoundStatus; endTime: number }): JoinState
export function needsSettle(round: { status: RoundStatus; endTime: number }, nowMs: number): boolean
// outcomes.ts
export type Outcome = 'won' | 'lost' | 'none'
export type RoundRecord = { id: number; endTime: number; status: RoundStatus; entered: boolean; winner: Side | null } // endTime in unix SECONDS
export function outcomeOf(record: RoundRecord, choice: Side | null): Outcome
// streak.ts
export function participationDays(records: readonly RoundRecord[]): number[]
export function computeStreak(days: readonly number[], todayKey: number): { current: number; freezes: number }
// shareGrid.ts
export function slotOutcomesForDay(schedule: Schedule, dayKey: number, records: readonly RoundRecord[], outcomes: ReadonlyMap<number, Outcome>): Outcome[]
export function formatShareText(input: { dayNumber: number; streak: number; outcomes: readonly Outcome[] }): string
// share.ts
export function shareText(text: string): Promise<'shared' | 'copied' | 'failed'>
```
`RoundRecord` and `Outcome` live in `outcomes.ts`; `RoundStatus` and `Side` come from `types.ts`.

- [ ] **Step 1: Add vitest** to `apps/web` and confirm `bun --cwd apps/web run test` runs (zero tests is acceptable at this point).

- [ ] **Step 2: Write the failing tests** with these exact cases (`ts0 = 1767225600`, a UTC midnight; deadlines `[10800, 32400, 43200, 50400]`, window `5400`):
  - `nextDeadline`: at `ts0` → `ts0 + 10800`; at `ts0 + 10800` → `ts0 + 32400` (strictly after); at `ts0 + 50400` → `ts0 + 86400 + 10800`.
  - `jstDayKey`: `ts0 + 15*3600 - 1` → `20454`; `ts0 + 15*3600` → `20455`. `dayNumber(ts0, 20454) == 1`.
  - `joinState(null, …)` → `{ kind: 'free' }`. With no open round: at `ts0 + 5400 - 1` → `{ kind: 'waiting', opensMs: (ts0 + 5400) * 1000, endMs: (ts0 + 10800) * 1000 }`; at `ts0 + 5400` → `{ kind: 'startable', endMs: (ts0 + 10800) * 1000 }`. With `{ status: 'open', endTime: (ts0 + 10800) * 1000 }` at `ts0 + 6000` → `{ kind: 'open', endMs: (ts0 + 10800) * 1000 }`.
  - `needsSettle`: `open` with `endTime` in the past → `true`; `open` in the future → `false`; `closing` → `true`; `settled`, `cancelled`, `none` → `false`.
  - `outcomeOf`: not entered → `none`; cancelled → `none`; winner `null` → `none`; entered, winner `moon`, choice `moon` → `won`; choice `sun` → `lost`.
  - `computeStreak` (day keys): `[100,101,102]` today 102 → `{3,0}`; same days, today 103 → `{3,0}`; same days, today 104 → `{0,0}`; `[100,101,103]` today 103 → `{1,0}`; `[100..106,108]` today 108 → `{8,0}` (seven days earn one freeze, the missed 107 consumes it); `[100..106,109]` today 109 → `{1,0}` (two misses); `[100,100,101]` today 101 → `{2,0}`; `[]` → `{0,0}`.
  - `slotOutcomesForDay` with four records on one JST day (deadlines `ts0+10800`, `+32400`, `+43200`, `+50400`; day key 20454), outcomes won/lost/won and the fourth round missing → `['won','lost','won','none']`.
  - `formatShareText({ dayNumber: 128, streak: 6, outcomes: ['won','lost','won','none'] })` → `"Minority Rush #128  連続 6日\n🟩⬛🟩⬜  読み勝ち 2/3"`; all `none` → `"Minority Rush #1  連続 0日\n⬜⬜⬜⬜  参加なし"` (for `dayNumber 1, streak 0`).
  - `shareText`: with `vi.stubGlobal('navigator', { share })` resolving → `'shared'`; with `share` rejecting and no clipboard → `'failed'`; with only `clipboard.writeText` resolving → `'copied'`; with `clipboard.writeText` rejecting → `'failed'`; with no `navigator` members → `'failed'`.

- [ ] **Step 3: Run to see them fail**

Run: `bun --cwd apps/web run test`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the five modules** with the signatures above. Streak rule (pinned): walk day by day from the earliest participation day to `todayKey`; a participated day does `current += 1` and, when `current % 7 === 0`, `freezes = Math.min(1, freezes + 1)`; a day before today with no participation consumes a freeze if `freezes > 0` (current unchanged) and otherwise sets `current = 0`; today without participation changes nothing. `slotOutcomesForDay` returns one entry per deadline, indexed by rank of `(deadline + JST_OFFSET_SEC) % 86400`, matching records whose `jstDayKey(endTime)` equals `dayKey` and whose `endTime` ends at that slot's time of day; missing slots are `'none'`. `formatShareText` counts `X` = `won`, `Y` = `won + lost`.

- [ ] **Step 5: Run the tests until they pass, typecheck and lint**

Run: `bun --cwd apps/web run test && bun --cwd apps/web run build && bun --cwd apps/web run lint`
Expected: all pass; no new lint errors (three pre-existing `set-state-in-effect` warnings are known).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/lib bun.lock
git commit -m "feat(web): add schedule, streak, share-grid and outcome logic"
```

---

### Task 4: GameClient — schedule, history and outcomes (live and demo)

**Files:**
- Modify: `apps/web/src/lib/types.ts`, `liveClient.ts`, `demoClient.ts`

**Interfaces:**
- Consumes: Task 3 (`Schedule`, `RoundRecord`, `Outcome`, `outcomeOf`), Task 2 (`abi.json`).
- Produces (added to `GameClient` in `types.ts`):
```ts
getSchedule(): Promise<Schedule | null> // null = free play (demo)
getRecentRounds(count: number): Promise<RoundRecord[]> // oldest first; ids >= 1; endTime in seconds
getOutcomes(records: readonly RoundRecord[]): Promise<ReadonlyMap<number, Outcome>> // keyed by round id
```
`RoundState` is unchanged. `onboard` keeps its signature.

- [ ] **Step 1: Extend `GameClient`** in `types.ts` with the three methods (import the types from `schedule.ts` and `outcomes.ts`).

- [ ] **Step 2: Live implementation.** `getSchedule`: read `schedule()` and return `{ deadlinesUtcSec: deadlinesUtc.map(Number), windowSec: Number(window) }`. `getRecentRounds(count)`: read `latestRoundId`, take ids `max(1, latest - count + 1)` to `latest`, `publicClient.multicall` two reads per id (`getRound`, and `getEntry` for the session account when connected), map to `RoundRecord` using the existing `STATUS` table and `moonWon`. `getOutcomes`: only records with `entered` and status `settled` need a decrypt; read their `getEntry` choice handles, call `sdk.permits.grantPermit([game])` once and `sdk.decryption.decryptValues` once with all handles, then return `outcomeOf(record, choice === 1n ? 'moon' : 'sun')` for those and `outcomeOf(record, null)` for the rest. A round that is not entered/settled is never decrypted.

- [ ] **Step 3: `enter` in the live client** no longer calls `startRound` blindly: `ensureRound` calls `startRound` only when the latest round is not Open, and the revert `OutsideWindow` surfaces as the message `"No round is open right now"` through `errorMessage` (map the decoded custom error name).

- [ ] **Step 4: Daily faucet.** In `onboardingCalls`, replace the `lastFaucetAt === 0n` condition with: read `lastFaucetAt` and the latest block timestamp; push the `faucet()` call when `last === 0n` or `blockTimestamp >= last + 86400n` (cooldown from Task 1).

- [ ] **Step 5: Demo implementation.** `getSchedule` returns `null`. Keep a `history` array in the demo (id, endTimeSec, `mine`, `winner`, status); `getRecentRounds` maps it to `RoundRecord`s; `getOutcomes` uses `outcomeOf(record, mine?.side ?? null)`.

- [ ] **Step 6: Verify**

Run: `bun --cwd apps/web run build && bun --cwd apps/web run lint && bun --cwd apps/web run test`
Expected: no type errors; tests still pass. The live methods are exercised by the Sepolia smoke run in Task 6 (no unit tests: they need a chain), and the demo methods by the browser check in Task 5.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): read schedule, history and own outcomes from the game"
```

---

### Task 5: Home screen, countdown, streak, share

**Files:**
- Create: `apps/web/src/home.tsx` (Home screen components)
- Modify: `apps/web/src/App.tsx`, `apps/web/src/components.tsx` (only if shared pieces are reused), `apps/web/src/styles/app.css`

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces: `export function HomeScreen(props: HomeProps): JSX.Element` with
```ts
type HomeProps = {
  join: JoinState
  nowMs: number
  players: number          // public participant count of the open round
  minPlayers: number       // 3, from the contract constant on live; 3 in demo
  streak: { current: number; freezes: number }
  recent: readonly Outcome[]  // today's slot squares from slotOutcomesForDay
  hasUnseenResult: boolean
  isLocked: boolean
  isSettling: boolean
  onJoin: () => void
  onShare: () => void
  onSeeResult: () => void
}
```

- [ ] **Step 1: Add a `home` screen** to the `Screen` union in `App.tsx`. After onboarding (`connect`), go to `home` instead of `pick`. `HomeScreen` shows: the countdown to `endMs` (open/startable) or to `opensMs` (waiting), the participant count with "N more needed" when `players < minPlayers` while open, the streak and today's four squares, a Join button enabled only for `open` and `startable` and `free`, a "See result" button when `hasUnseenResult`, and "Calculating…" while `isSettling`. Copy follows the existing English style; no emoji icons in UI chrome (the squares are text characters drawn with CSS colors, not emoji, in the UI; the emoji appear only in the shared text).

- [ ] **Step 2: Drive state in `App.tsx`.** Poll `getRound` (existing 3 s) plus a 1 s `nowMs` ticker only while on `home`/`sealed`; load schedule once after connect; load `getRecentRounds(120)` and `getOutcomes` on entering `home` and after each claim; compute `streak` with `computeStreak(participationDays(records), jstDayKey(nowSec))`, `recent` with `slotOutcomesForDay`, and `join` with `joinState`. Settling: an effect on `home` that runs the existing `settle` when `needsSettle(round, nowMs)` is true and nothing is busy; while it runs, `isSettling` is true. Joining from `home` goes to `pick`; `seal` then goes to `sealed` as today; the existing auto-settle-and-claim path to `reveal` stays. "See result" runs the existing claim flow for the latest round when `round.hasEntered && !round.hasClaimed` and that round is `settled` or `cancelled`.

- [ ] **Step 3: Share.** On `home` and on `reveal`, a Share button builds the text with `formatShareText({ dayNumber: dayNumber(nowSec, LAUNCH_DAY_KEY), streak: streak.current, outcomes: recent })` and calls `shareText`; show `Copied` or `Could not share` for the `copied` and `failed` results. `LAUNCH_DAY_KEY` is a constant in `lib/schedule.ts` set to the JST day key of the redeploy date (placeholder until Task 6 sets it).

- [ ] **Step 4: Balance gate.** On `pick`, when `balance` is known and `balance < MIN_STAKE`, disable the Seal button and show "Not enough chips. Claim today's chips first." with no new contract call (the faucet runs in `onboard`, see Task 4 Step 4).

- [ ] **Step 5: Verify in demo mode**

Run: `VITE_DEMO_MODE=true bun --cwd apps/web run dev` (use the Browser pane): log in, see Home with the free-play join state, join, seal, wait for the result, return to Home and confirm the streak reads 1 and one square is filled, tap Share and confirm the copied text has no side or stake. Check 375 px width for no horizontal overflow.
Then: `node <clone>/tools/check-ui.mjs apps/web/src/App.tsx apps/web/src/home.tsx apps/web/src/styles/app.css` → 0 findings; `bun --cwd apps/web run build`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add home screen with countdown, streak and share"
```

---

### Task 6: Docs, Sepolia measurement and release checklist

**Files:**
- Modify: `README.md`, `docs/deployment.md`
- Modify: `apps/web/src/lib/schedule.ts` (`LAUNCH_DAY_KEY`)

**Interfaces:**
- Consumes: Task 2's smoke output.

- [ ] **Step 1: Update the docs.** In `README.md` replace the "Round flow" step 1 and the limits (2–8 players, one active round) with the scheduled model (four deadlines, 90-minute windows, 3–100 players, permissionless `startRound` inside a window). In `docs/deployment.md` add the redeploy runbook below and the note that old balances and rounds are abandoned.

- [ ] **Step 2: Write the redeploy runbook** (documented, not executed by the agent): (1) `bun run deploy:sepolia` (needs `PRIVATE_KEY`, `INFURA_API_KEY`, a funded deployer); (2) `bun run export:abi`; (3) set `LAUNCH_DAY_KEY` to the JST day key of the launch day (`floor((unixSec + 32400) / 86400)`); (4) update `CHIP_ADDRESS` and `GAME_ADDRESS` in the `sponsor-api` Vercel project; (5) deploy `apps/web` and `apps/sponsor-api`; (6) set the hard spend limit and daily alert in the Pimlico sponsorship policy (the in-memory rate limit in `rateLimit.ts` is best-effort only); (7) run `bun run smoke:sepolia` and record `close→finalized` seconds and `enter gas` in `docs/deployment.md` under "Measured on Sepolia". Steps 1, 4 and 5 are outward-facing and need explicit go-ahead from the owner; the executing agent stops after Step 3 and reports.

- [ ] **Step 3: Run the full local verification**

Run: `bun run test && bun --cwd apps/web run test && bun run build`
Expected: all contract tests and web tests pass; the web build succeeds.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/deployment.md apps/web/src/lib/schedule.ts
git commit -m "docs: describe scheduled rounds and the redeploy runbook"
```

- [ ] **Step 5: Open the PR** to `main` (squash merge per `.claude/rules/git-workflow.md`) with the spec link, and list the not-yet-verified items: real latency, 100-player gas, Pimlico limits, real-device iPhone check.

---

## Self-review notes

- Spec coverage: schedule/windows (Task 1), 3–100 players (Task 1), Closing not blocking (Task 1), redeploy (Tasks 2 and 6), streak via reads (Tasks 3, 4, 5), share grid and outcomes (Tasks 3, 4, 5), faucet daily (Tasks 1 and 4), balance gate (Task 5), settle by the opener's screen (Task 5), Pimlico hard limit (Task 6), measurement (Tasks 2 and 6). Acceptance 4 (100 players within the block HCU limit) cannot be proven locally; Task 2 and Task 6 record per-entry gas on Sepolia and the 100-player claim stays an extrapolation until measured.
- Decisions made in this plan, not in the spec: the freeze rule (one freeze earned every 7th consecutive day, stored at most 1), streak history depth of 120 rounds (about 30 days), English UI copy with a Japanese share text, and `joinState` as the single place that interprets the schedule.
