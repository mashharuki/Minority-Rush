import { z } from 'zod'

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address')

const envSchema = z.object({
  PRIVY_APP_ID: z.string().min(1),
  /** Public verification key (PEM) or JWKS URL from the Privy dashboard. Not a secret. */
  PRIVY_VERIFICATION_KEY: z.string().min(1),
  PIMLICO_API_KEY: z.string().min(1),
  PIMLICO_SPONSORSHIP_POLICY_ID: z.string().min(1),
  ALLOWED_WEB_ORIGIN: z.string().min(1),
  CHIP_ADDRESS: addressSchema,
  GAME_ADDRESS: addressSchema,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
})

export type SponsorConfig = {
  privyAppId: string
  privyVerificationKey: string
  pimlicoApiKey: string
  policyId: string
  allowedOrigins: string[]
  chip: `0x${string}`
  game: `0x${string}`
  rateLimitPerMinute: number
}

export type ConfigResult = { ok: true; data: SponsorConfig } | { ok: false; error: string }

/** Validates environment variables once at the boundary. Never echoes values back. */
export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    return { ok: false, error: `Invalid sponsor-api configuration: ${fields}` }
  }
  const v = parsed.data
  return {
    ok: true,
    data: {
      privyAppId: v.PRIVY_APP_ID,
      privyVerificationKey: v.PRIVY_VERIFICATION_KEY,
      pimlicoApiKey: v.PIMLICO_API_KEY,
      policyId: v.PIMLICO_SPONSORSHIP_POLICY_ID,
      allowedOrigins: v.ALLOWED_WEB_ORIGIN.split(',').map((o) => o.trim()),
      chip: v.CHIP_ADDRESS as `0x${string}`,
      game: v.GAME_ADDRESS as `0x${string}`,
      rateLimitPerMinute: v.RATE_LIMIT_PER_MINUTE,
    },
  }
}
