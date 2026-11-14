import { describe, expect, it } from 'vitest'

import { outcomeOf } from './outcomes'
import type { RoundRecord } from './types'

const record = (overrides: Partial<RoundRecord> = {}): RoundRecord => ({
  id: 1,
  endTime: 1767225600,
  status: 'settled',
  entered: true,
  winner: 'moon',
  ...overrides,
})

describe('outcomeOf', () => {
  it('should be none when the player did not enter', () => {
    expect(outcomeOf(record({ entered: false }), 'moon')).toBe('none')
  })

  it('should be none when the round was cancelled', () => {
    expect(outcomeOf(record({ status: 'cancelled' }), 'moon')).toBe('none')
  })

  it('should be none when there is no winner', () => {
    expect(outcomeOf(record({ winner: null }), 'moon')).toBe('none')
  })

  it('should be won when the choice matches the winner', () => {
    expect(outcomeOf(record(), 'moon')).toBe('won')
  })

  it('should be lost when the choice differs from the winner', () => {
    expect(outcomeOf(record(), 'sun')).toBe('lost')
  })
})
