import { needsSettle } from './schedule'
import type { RoundRecord, RoundStatus } from './types'

/** Upper bound of the random wait before an automatic settle, so watching clients do not all send at once. */
export const SETTLE_JITTER_MAX_MS = 20_000

const byIdAscending = (a: RoundRecord, b: RoundRecord): number => a.id - b.id

/** Oldest round that is Closing, or Open past its deadline. `RoundRecord.endTime` is unix seconds. */
export function roundToSettle(records: readonly RoundRecord[], nowMs: number): number | null {
  const due = records.filter((r) => needsSettle({ status: r.status, endTime: r.endTime * 1000 }, nowMs))
  return [...due].sort(byIdAscending)[0]?.id ?? null
}

/** Oldest round the player entered that is settled or cancelled and not yet claimed. */
export function roundToClaim(records: readonly RoundRecord[]): number | null {
  const claimable = records.filter(
    (r) => r.entered && !r.claimed && (r.status === 'settled' || r.status === 'cancelled'),
  )
  return [...claimable].sort(byIdAscending)[0]?.id ?? null
}

/** Joining waits until every expired round is settled. */
export function isJoinBlocked(records: readonly RoundRecord[], nowMs: number): boolean {
  return roundToSettle(records, nowMs) !== null
}

/** Random wait in [0, maxMs) before an automatic settle. `random` is injectable for tests. */
export function settleJitterMs(maxMs: number, random: () => number = Math.random): number {
  return Math.floor(random() * maxMs)
}

export type SettleStep = 'close' | 'finalize'

/** The write that moves a round towards Settled: close an Open round, finalize a Closing one, else nothing. */
export function nextSettleStep(status: RoundStatus): SettleStep | null {
  if (status === 'open') return 'close'
  if (status === 'closing') return 'finalize'
  return null
}

const ALREADY_DONE_ERROR: Record<SettleStep, string> = { close: 'RoundNotOpen', finalize: 'RoundNotClosing' }

/** True when a simulated revert only says another client already did this step. */
export function isAlreadyDoneRevert(step: SettleStep, errorName: string | null): boolean {
  return errorName === ALREADY_DONE_ERROR[step]
}

/** True when the round has moved past `step` (read after a failed write to tell a lost race from a real error). */
export function isSettleStepDone(step: SettleStep, status: RoundStatus): boolean {
  if (step === 'close') return status !== 'open'
  return status !== 'open' && status !== 'closing'
}
