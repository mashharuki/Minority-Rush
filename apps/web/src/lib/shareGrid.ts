import { JST_OFFSET_SEC, jstDayKey } from './schedule'
import type { Outcome, RoundRecord, Schedule } from './types'

const DAY_SEC = 86400
const EMOJI: Record<Outcome, string> = { won: '🟩', lost: '⬛', none: '⬜' }

const jstSecOfDay = (unixSec: number): number => (((unixSec + JST_OFFSET_SEC) % DAY_SEC) + DAY_SEC) % DAY_SEC

/** One outcome per scheduled slot of the given JST day, ordered by JST time of day. */
export function slotOutcomesForDay(
  schedule: Schedule,
  dayKey: number,
  records: readonly RoundRecord[],
  outcomes: ReadonlyMap<number, Outcome>,
): Outcome[] {
  const slots = schedule.deadlinesUtcSec.map(jstSecOfDay).sort((a, b) => a - b)
  return slots.map((slot) => {
    const record = records.find((r) => jstDayKey(r.endTime) === dayKey && jstSecOfDay(r.endTime) === slot)
    return (record && outcomes.get(record.id)) ?? 'none'
  })
}

export function formatShareText(input: { dayNumber: number; streak: number; outcomes: readonly Outcome[] }): string {
  const won = input.outcomes.filter((o) => o === 'won').length
  const played = won + input.outcomes.filter((o) => o === 'lost').length
  const summary = played === 0 ? '参加なし' : `読み勝ち ${won}/${played}`
  const grid = input.outcomes.map((o) => EMOJI[o]).join('')
  return `Minority Rush #${input.dayNumber}  連続 ${input.streak}日\n${grid}  ${summary}`
}
