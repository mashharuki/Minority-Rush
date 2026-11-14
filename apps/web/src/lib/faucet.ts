/** RushChip.FAUCET_COOLDOWN (24 hours). */
export const FAUCET_COOLDOWN_SECONDS = 86_400n

/** Unix seconds from which `faucet()` succeeds again. 0 = never claimed, available now. */
export function faucetAvailableAtSec(lastFaucetAtSec: bigint): bigint {
  if (lastFaucetAtSec === 0n) return 0n
  return lastFaucetAtSec + FAUCET_COOLDOWN_SECONDS
}

/** Mirrors the contract check against the latest block timestamp (not the client clock). */
export function isFaucetReady(lastFaucetAtSec: bigint, blockTimestampSec: bigint): boolean {
  return blockTimestampSec >= faucetAvailableAtSec(lastFaucetAtSec)
}
