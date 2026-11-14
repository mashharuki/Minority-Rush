import { describe, expect, it } from 'vitest'

import {
  isAlreadyDoneRevert,
  isJoinBlocked,
  isSettleStepDone,
  nextSettleStep,
  roundToClaim,
  roundToSettle,
  settleJitterMs,
} from './settleQueue'
import type { RoundRecord } from './types'

const NOW_SEC = 1794625200
const NOW_MS = NOW_SEC * 1000

const record = (overrides: Partial<RoundRecord> = {}): RoundRecord => ({
  id: 1,
  endTime: NOW_SEC - 60,
  status: 'settled',
  entered: true,
  claimed: false,
  winner: 'moon',
  ...overrides,
})

describe('roundToSettle', () => {
  it('should be null when the history is empty', () => {
    expect(roundToSettle([], NOW_MS)).toBeNull()
  })

  it('should pick a closing round older than an expired open round', () => {
    const records = [record({ id: 3, status: 'open' }), record({ id: 2, status: 'closing', winner: null })]
    expect(roundToSettle(records, NOW_MS)).toBe(2)
  })

  it('should pick an open round when its deadline has passed', () => {
    expect(roundToSettle([record({ id: 4, status: 'open', winner: null })], NOW_MS)).toBe(4)
  })

  it('should ignore an open round before its deadline', () => {
    const open = record({ id: 4, status: 'open', endTime: NOW_SEC + 60, winner: null })
    expect(roundToSettle([open], NOW_MS)).toBeNull()
  })

  it('should settle rounds the player did not enter', () => {
    expect(roundToSettle([record({ id: 5, status: 'closing', entered: false })], NOW_MS)).toBe(5)
  })

  it('should ignore settled and cancelled rounds', () => {
    const records = [record({ id: 1 }), record({ id: 2, status: 'cancelled', winner: null })]
    expect(roundToSettle(records, NOW_MS)).toBeNull()
  })
})

describe('roundToClaim', () => {
  it('should be null when the history is empty', () => {
    expect(roundToClaim([])).toBeNull()
  })

  it('should pick the oldest settled round not yet claimed', () => {
    const records = [record({ id: 3 }), record({ id: 2 }), record({ id: 1, claimed: true })]
    expect(roundToClaim(records)).toBe(2)
  })

  it('should pick a settled unclaimed round before a later claimed one', () => {
    expect(roundToClaim([record({ id: 1 }), record({ id: 2, claimed: true })])).toBe(1)
  })

  it('should offer a cancelled round for its refund', () => {
    expect(roundToClaim([record({ id: 6, status: 'cancelled', winner: null })])).toBe(6)
  })

  it('should ignore rounds the player did not enter', () => {
    expect(roundToClaim([record({ id: 1, entered: false })])).toBeNull()
  })

  it('should ignore rounds that are still open or closing', () => {
    const records = [record({ id: 1, status: 'closing' }), record({ id: 2, status: 'open' })]
    expect(roundToClaim(records)).toBeNull()
  })
})

describe('isJoinBlocked', () => {
  it('should not block when nothing needs settling', () => {
    expect(isJoinBlocked([record()], NOW_MS)).toBe(false)
  })

  it('should block while a closing round waits to be finalized', () => {
    expect(isJoinBlocked([record({ status: 'closing' })], NOW_MS)).toBe(true)
  })
})

describe('settleJitterMs', () => {
  it('should scale the random value to the bound', () => {
    expect(settleJitterMs(20_000, () => 0.5)).toBe(10_000)
  })

  it('should stay below the bound', () => {
    expect(settleJitterMs(20_000, () => 0.99999)).toBeLessThan(20_000)
  })

  it('should be zero when the bound is zero', () => {
    expect(settleJitterMs(0, () => 0.7)).toBe(0)
  })
})

describe('settle steps', () => {
  it('should close an open round and finalize a closing one', () => {
    expect(nextSettleStep('open')).toBe('close')
    expect(nextSettleStep('closing')).toBe('finalize')
  })

  it('should have nothing to do when the round is settled, cancelled or missing', () => {
    expect(nextSettleStep('settled')).toBeNull()
    expect(nextSettleStep('cancelled')).toBeNull()
    expect(nextSettleStep('none')).toBeNull()
  })

  it('should treat the matching revert as already done', () => {
    expect(isAlreadyDoneRevert('close', 'RoundNotOpen')).toBe(true)
    expect(isAlreadyDoneRevert('finalize', 'RoundNotClosing')).toBe(true)
  })

  it('should not treat other reverts as already done', () => {
    expect(isAlreadyDoneRevert('close', 'RoundNotFinished')).toBe(false)
    expect(isAlreadyDoneRevert('finalize', 'RoundNotOpen')).toBe(false)
    expect(isAlreadyDoneRevert('close', null)).toBe(false)
  })

  it('should see a step as done once the round moved past it', () => {
    expect(isSettleStepDone('close', 'closing')).toBe(true)
    expect(isSettleStepDone('close', 'cancelled')).toBe(true)
    expect(isSettleStepDone('close', 'open')).toBe(false)
    expect(isSettleStepDone('finalize', 'settled')).toBe(true)
    expect(isSettleStepDone('finalize', 'closing')).toBe(false)
  })
})
