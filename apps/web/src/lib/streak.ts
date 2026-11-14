import { jstDayKey } from './schedule'
import type { RoundRecord } from './types'

const FREEZE_EVERY_DAYS = 7

/** Sorted, de-duplicated JST day keys on which the player entered a round. */
export function participationDays(records: readonly RoundRecord[]): number[] {
  const days = new Set(records.filter((r) => r.entered).map((r) => jstDayKey(r.endTime)))
  return [...days].sort((a, b) => a - b)
}

/**
 * Walks day by day from the first participation to today. Every 7th consecutive day earns
 * one freeze (max 1); a missed past day spends it, otherwise the streak resets. Today
 * without participation is still pending and changes nothing.
 */
export function computeStreak(days: readonly number[], todayKey: number): { current: number; freezes: number } {
  if (days.length === 0) return { current: 0, freezes: 0 }
  const played = new Set(days)
  let current = 0
  let freezes = 0
  for (let day = Math.min(...days); day <= todayKey; day += 1) {
    if (played.has(day)) {
      current += 1
      if (current % FREEZE_EVERY_DAYS === 0) freezes = Math.min(1, freezes + 1)
    } else if (day < todayKey) {
      if (freezes > 0) freezes -= 1
      else current = 0
    }
  }
  return { current, freezes }
}
