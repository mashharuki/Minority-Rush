import { describe, expect, it } from 'vitest'

import { formatShareText, slotOutcomesForDay } from './shareGrid'
import type { Outcome, RoundRecord, Schedule } from './types'

const ts0 = 1767225600
const schedule: Schedule = { deadlinesUtcSec: [10800, 32400, 43200, 50400], windowSec: 5400 }

const rec = (id: number, endTime: number): RoundRecord => ({
  id,
  endTime,
  status: 'settled',
  entered: true,
  winner: 'sun',
})

describe('slotOutcomesForDay', () => {
  it('should map outcomes to slots and fill missing slots with none', () => {
    const records = [
      rec(1, ts0 + 10800),
      rec(2, ts0 + 32400),
      rec(3, ts0 + 43200),
    ]
    const outcomes = new Map<number, Outcome>([
      [1, 'won'],
      [2, 'lost'],
      [3, 'won'],
    ])
    expect(slotOutcomesForDay(schedule, 20454, records, outcomes)).toEqual(['won', 'lost', 'won', 'none'])
  })

  it('should ignore rounds that ended on another JST day', () => {
    const records = [rec(1, ts0 + 10800 + 86400)]
    const outcomes = new Map<number, Outcome>([[1, 'won']])
    expect(slotOutcomesForDay(schedule, 20454, records, outcomes)).toEqual(['none', 'none', 'none', 'none'])
  })
})

describe('formatShareText', () => {
  it('should render the grid and the win ratio', () => {
    expect(
      formatShareText({ dayNumber: 128, streak: 6, outcomes: ['won', 'lost', 'won', 'none'] }),
    ).toBe('Minority Rush #128  連続 6日\n🟩⬛🟩⬜  読み勝ち 2/3')
  })

  it('should say no participation when every slot is none', () => {
    expect(
      formatShareText({ dayNumber: 1, streak: 0, outcomes: ['none', 'none', 'none', 'none'] }),
    ).toBe('Minority Rush #1  連続 0日\n⬜⬜⬜⬜  参加なし')
  })
})
