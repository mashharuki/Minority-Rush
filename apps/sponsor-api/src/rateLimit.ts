export type RateLimiter = { allow: (key: string) => boolean }

/**
 * Sliding-window limiter (per key, per minute). In-memory: on serverless it is per instance and best-effort,
 * so the Pimlico sponsorship policy must carry the hard spend limits.
 */
export function createRateLimiter(limitPerMinute: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    allow(key) {
      const cutoff = now() - 60_000
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff)
      if (recent.length >= limitPerMinute) {
        hits.set(key, recent)
        return false
      }
      recent.push(now())
      hits.set(key, recent)
      return true
    },
  }
}
