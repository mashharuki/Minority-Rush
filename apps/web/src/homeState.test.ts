import { describe, expect, it } from 'vitest'

import { deriveDayRecord, formatCountdown, todayOutcomes, type History } from './homeState'
import { jstDayKey } from './lib/schedule'
import type { Outcome, RoundRecord, Schedule } from './lib/types'

// 2026-11-14 03:00 UTC = 12:00 JST
const noonJstSec = 1794625200
const todayKey = jstDayKey(noonJstSec)

const rec = (id: number, endTime: number, entered = true): RoundRecord => ({
  id,
  endTime,
  status: 'settled',
  entered,
  claimed: false,
  winner: 'sun',
})

const historyOf = (entries: [RoundRecord, Outcome][]): History => ({
  records: entries.map(([r]) => r),
  outcomes: new Map(entries.map(([r, o]) => [r.id, o])),
})

describe('formatCountdown', () => {
  it('should show m:ss under an hour', () => {
    expect(formatCountdown(65_000)).toBe('1:05')
  })

  it('should show h:mm:ss from an hour', () => {
    expect(formatCountdown(3_723_000)).toBe('1:02:03')
  })

  it('should clamp to zero when the deadline has passed', () => {
    expect(formatCountdown(-5000)).toBe('0:00')
  })
})

describe('todayOutcomes', () => {
  it('should pad free play to four squares with today first', () => {
    const history = historyOf([[rec(1, noonJstSec), 'won']])
    expect(todayOutcomes(null, todayKey, history)).toEqual(['won', 'none', 'none', 'none'])
  })

  it('should ignore other days and rounds not entered in free play', () => {
    const history = historyOf([
      [rec(1, noonJstSec - 86400), 'won'],
      [rec(2, noonJstSec, false), 'none'],
      [rec(3, noonJstSec + 60), 'lost'],
    ])
    expect(todayOutcomes(null, todayKey, history)).toEqual(['lost', 'none', 'none', 'none'])
  })

  it('should keep the latest four rounds when free play has more', () => {
    const outcomes: Outcome[] = ['won', 'lost', 'won', 'lost', 'won']
    const history = historyOf(outcomes.map((o, i) => [rec(i + 1, noonJstSec + i), o]))
    expect(todayOutcomes(null, todayKey, history)).toEqual(['lost', 'won', 'lost', 'won'])
  })

  it('should use the scheduled slots when a schedule exists', () => {
    const schedule: Schedule = { deadlinesUtcSec: [10800], windowSec: 3600 } // 12:00 JST
    const history = historyOf([[rec(1, noonJstSec), 'won']])
    expect(todayOutcomes(schedule, todayKey, history)).toEqual(['won'])
  })
})

describe('deriveDayRecord', () => {
  it('should count today in the streak after one round', () => {
    const history = historyOf([[rec(1, noonJstSec), 'won']])
    const day = deriveDayRecord(null, history, noonJstSec * 1000 + 5000)
    expect(day.streak).toEqual({ current: 1, freezes: 0 })
    expect(day.recent[0]).toBe('won')
  })
})
