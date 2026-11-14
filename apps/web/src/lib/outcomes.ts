import type { Outcome, RoundRecord, Side } from './types'

export function outcomeOf(record: RoundRecord, choice: Side | null): Outcome {
  if (!record.entered || record.status === 'cancelled') return 'none'
  if (record.winner === null || choice === null) return 'none'
  return record.winner === choice ? 'won' : 'lost'
}
