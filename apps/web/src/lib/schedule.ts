import type { JoinState, RoundStatus, Schedule } from './types'

export const JST_OFFSET_SEC = 32400
const DAY_SEC = 86400
/** JST day key of day #1 for share text. Placeholder (2026-11-14); Task 6 sets the real launch day. */
export const LAUNCH_DAY_KEY = 20771

/** First scheduled deadline strictly after `nowSec` (unix seconds). */
export function nextDeadline(schedule: Schedule, nowSec: number): number {
  const sorted = [...schedule.deadlinesUtcSec].sort((a, b) => a - b)
  const dayStart = Math.floor(nowSec / DAY_SEC) * DAY_SEC
  for (const offsetDays of [0, 1]) {
    for (const secOfDay of sorted) {
      const deadline = dayStart + offsetDays * DAY_SEC + secOfDay
      if (deadline > nowSec) return deadline
    }
  }
  throw new Error('schedule has no deadlines')
}

/** Days since the unix epoch on the JST calendar. */
export function jstDayKey(unixSec: number): number {
  return Math.floor((unixSec + JST_OFFSET_SEC) / DAY_SEC)
}

/** 1-based day number counted from the launch day. */
export function dayNumber(unixSec: number, launchDayKey: number): number {
  return jstDayKey(unixSec) - launchDayKey + 1
}

/** What the player can do right now. `round.endTime` is unix ms (0 when no round). */
export function joinState(
  schedule: Schedule | null,
  nowMs: number,
  round: { status: RoundStatus; endTime: number },
): JoinState {
  if (!schedule) return { kind: 'free' }
  if (round.status === 'open' && round.endTime > nowMs) return { kind: 'open', endMs: round.endTime }

  const deadlineSec = nextDeadline(schedule, Math.floor(nowMs / 1000))
  const endMs = deadlineSec * 1000
  const opensMs = (deadlineSec - schedule.windowSec) * 1000
  if (nowMs >= opensMs) return { kind: 'startable', endMs }
  return { kind: 'waiting', opensMs, endMs }
}

/** True when the round must be settled before anything new can start. `endTime` is unix ms. */
export function needsSettle(round: { status: RoundStatus; endTime: number }, nowMs: number): boolean {
  if (round.status === 'closing') return true
  return round.status === 'open' && round.endTime <= nowMs
}
