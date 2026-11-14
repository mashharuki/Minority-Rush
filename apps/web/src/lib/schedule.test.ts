import { describe, expect, it } from 'vitest'

import { dayNumber, jstDayKey, joinState, nextDeadline, needsSettle } from './schedule'
import type { Schedule } from './types'

const ts0 = 1767225600
const schedule: Schedule = { deadlinesUtcSec: [10800, 32400, 43200, 50400], windowSec: 5400 }

describe('nextDeadline', () => {
  it('should return the first deadline of the day when now is at UTC midnight', () => {
    expect(nextDeadline(schedule, ts0)).toBe(ts0 + 10800)
  })

  it('should return the next deadline when now is exactly on a deadline', () => {
    expect(nextDeadline(schedule, ts0 + 10800)).toBe(ts0 + 32400)
  })

  it('should roll over to the next day when now is on the last deadline', () => {
    expect(nextDeadline(schedule, ts0 + 50400)).toBe(ts0 + 86400 + 10800)
  })
})

describe('jstDayKey', () => {
  it('should stay on the same JST day one second before 15:00 UTC', () => {
    expect(jstDayKey(ts0 + 15 * 3600 - 1)).toBe(20454)
  })

  it('should advance at 15:00 UTC (JST midnight)', () => {
    expect(jstDayKey(ts0 + 15 * 3600)).toBe(20455)
  })
})

describe('dayNumber', () => {
  it('should be 1 on the launch day', () => {
    expect(dayNumber(ts0, 20454)).toBe(1)
  })
})

describe('joinState', () => {
  const none = { status: 'none' as const, endTime: 0 }

  it('should be free when there is no schedule', () => {
    expect(joinState(null, (ts0 + 6000) * 1000, none)).toEqual({ kind: 'free' })
  })

  it('should be waiting before the window opens', () => {
    expect(joinState(schedule, (ts0 + 5400 - 1) * 1000, none)).toEqual({
      kind: 'waiting',
      opensMs: (ts0 + 5400) * 1000,
      endMs: (ts0 + 10800) * 1000,
    })
  })

  it('should be startable once the window opens', () => {
    expect(joinState(schedule, (ts0 + 5400) * 1000, none)).toEqual({
      kind: 'startable',
      endMs: (ts0 + 10800) * 1000,
    })
  })

  it('should be open when a round is open', () => {
    const round = { status: 'open' as const, endTime: (ts0 + 10800) * 1000 }
    expect(joinState(schedule, (ts0 + 6000) * 1000, round)).toEqual({
      kind: 'open',
      endMs: (ts0 + 10800) * 1000,
    })
  })
})

describe('needsSettle', () => {
  const now = 1_000_000

  it('should be true when an open round has ended', () => {
    expect(needsSettle({ status: 'open', endTime: now - 1 }, now)).toBe(true)
  })

  it('should be false when an open round is still running', () => {
    expect(needsSettle({ status: 'open', endTime: now + 1000 }, now)).toBe(false)
  })

  it('should be true when a round is closing', () => {
    expect(needsSettle({ status: 'closing', endTime: now + 1000 }, now)).toBe(true)
  })

  it.each(['settled', 'cancelled', 'none'] as const)('should be false when status is %s', (status) => {
    expect(needsSettle({ status, endTime: now - 1000 }, now)).toBe(false)
  })
})
