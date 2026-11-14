import { describe, expect, it } from 'vitest'

import { faucetAvailableAtSec, isFaucetReady } from './faucet'

const LAST = 1_794_600_000n

describe('faucetAvailableAtSec', () => {
  it('should be available now when the faucet was never used', () => {
    expect(faucetAvailableAtSec(0n)).toBe(0n)
  })

  it('should be 24 hours after the last claim', () => {
    expect(faucetAvailableAtSec(LAST)).toBe(LAST + 86_400n)
  })
})

describe('isFaucetReady', () => {
  it('should be ready when the faucet was never used', () => {
    expect(isFaucetReady(0n, LAST)).toBe(true)
  })

  it('should not be ready one second before the cooldown ends', () => {
    expect(isFaucetReady(LAST, LAST + 86_399n)).toBe(false)
  })

  it('should be ready exactly when the cooldown ends', () => {
    expect(isFaucetReady(LAST, LAST + 86_400n)).toBe(true)
  })
})
