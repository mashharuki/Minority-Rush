import { describe, expect, it } from 'vitest'

import { computeStreak, participationDays } from './streak'
import type { RoundRecord } from './types'

const ts0 = 1767225600

const rec = (id: number, endTime: number, entered: boolean): RoundRecord => ({
  id,
  endTime,
  status: 'settled',
  entered,
  claimed: false,
  winner: 'sun',
})

describe('computeStreak', () => {
  const range = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)

  it('should count consecutive days up to today', () => {
    expect(computeStreak([100, 101, 102], 102)).toEqual({ current: 3, freezes: 0 })
  })

  it('should keep the streak when today has no participation yet', () => {
    expect(computeStreak([100, 101, 102], 103)).toEqual({ current: 3, freezes: 0 })
  })

  it('should reset when a full day was missed', () => {
    expect(computeStreak([100, 101, 102], 104)).toEqual({ current: 0, freezes: 0 })
  })

  it('should restart after a gap', () => {
    expect(computeStreak([100, 101, 103], 103)).toEqual({ current: 1, freezes: 0 })
  })

  it('should consume a freeze earned after seven days when one day is missed', () => {
    expect(computeStreak([...range(100, 106), 108], 108)).toEqual({ current: 8, freezes: 0 })
  })

  it('should reset when two days are missed after earning one freeze', () => {
    expect(computeStreak([...range(100, 106), 109], 109)).toEqual({ current: 1, freezes: 0 })
  })

  it('should count duplicate days once', () => {
    expect(computeStreak([100, 100, 101], 101)).toEqual({ current: 2, freezes: 0 })
  })

  it('should be zero when there are no days', () => {
    expect(computeStreak([], 100)).toEqual({ current: 0, freezes: 0 })
  })
})

describe('participationDays', () => {
  it('should return sorted unique JST day keys of entered rounds only', () => {
    const records = [
      rec(3, ts0 + 15 * 3600 + 10, true),
      rec(1, ts0 + 100, true),
      rec(2, ts0 + 200, true),
      rec(4, ts0 + 300, false),
    ]
    expect(participationDays(records)).toEqual([20454, 20455])
  })
})
