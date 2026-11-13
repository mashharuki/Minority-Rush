import { z } from 'zod'

import type { SponsorConfig } from './config.js'
import type { RateLimiter } from './rateLimit.js'
import { ENTRY_POINT_V07, SEPOLIA_CHAIN_ID, validateUserOp, type UserOpLike } from './validate.js'

export type SponsorRequest = { method: string; headers: Record<string, string | undefined>; body: unknown }
export type SponsorResponse = { status: number; headers: Record<string, string>; body: unknown }

export type Deps = {
  config: SponsorConfig
  limiter: RateLimiter
  /** Returns the Privy user id for a valid access token, otherwise null. */
  verifyToken: (token: string) => Promise<{ userId: string } | null>
  /** Sends a JSON-RPC body to Pimlico (bundler + paymaster) and returns the parsed response. */
  forward: (body: unknown) => Promise<unknown>
}

/** Read-only calls (gas price, receipt polling) may run this many times more often than sponsored ones. */
const READ_LIMIT_MULTIPLIER = 10

const rpcSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string()]),
  method: z.string(),
  params: z.array(z.unknown()).default([]),
})
type Rpc = z.infer<typeof rpcSchema>

const PASS_THROUGH = new Set([
  'eth_chainId',
  'eth_supportedEntryPoints',
  'eth_getUserOperationReceipt',
  'eth_getUserOperationByHash',
  'pimlico_getUserOperationGasPrice',
])
const USER_OP_METHODS = new Set(['eth_sendUserOperation', 'eth_estimateUserOperationGas'])
const PAYMASTER_METHODS = new Set(['pm_getPaymasterStubData', 'pm_getPaymasterData'])

const cors = (origin: string | undefined, allowed: string[]): Record<string, string> =>
  origin && allowed.includes(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
        vary: 'Origin',
      }
    : {}

const fail = (
  status: number,
  id: Rpc['id'] | null,
  message: string,
  headers: Record<string, string>,
): SponsorResponse => ({
  status,
  headers,
  body: { jsonrpc: '2.0', id, error: { code: -32000, message } },
})

/** Checks the sponsored parts of a request (user op, entry point, chain). Returns an error string or null. */
function checkSponsored(rpc: Rpc, config: SponsorConfig): string | null {
  const [userOp, entryPoint, chainId] = rpc.params
  if (typeof entryPoint !== 'string' || entryPoint.toLowerCase() !== ENTRY_POINT_V07.toLowerCase()) {
    return 'entry point not allowed'
  }
  if (PAYMASTER_METHODS.has(rpc.method) && Number(chainId) !== SEPOLIA_CHAIN_ID) return 'chain not allowed'
  if (typeof userOp !== 'object' || userOp === null) return 'missing user operation'
  const result = validateUserOp(userOp as UserOpLike, { chip: config.chip, game: config.game })
  return result.ok ? null : result.reason
}

/** Forces our sponsorship policy and drops anything the client put in the paymaster context. */
function withPolicy(rpc: Rpc, policyId: string): Rpc {
  if (!PAYMASTER_METHODS.has(rpc.method)) return rpc
  const params = [...rpc.params]
  params[3] = { sponsorshipPolicyId: policyId }
  return { ...rpc, params }
}

async function authenticate(req: SponsorRequest, deps: Deps): Promise<string | null> {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!token) return null
  const user = await deps.verifyToken(token)
  return user?.userId ?? null
}

export async function handleSponsorRequest(req: SponsorRequest, deps: Deps): Promise<SponsorResponse> {
  const headers = cors(req.headers.origin, deps.config.allowedOrigins)
  const originAllowed = Boolean(headers['access-control-allow-origin'])
  if (!originAllowed) {
    // Origins are public values (not secrets): logging them makes ALLOWED_WEB_ORIGIN typos easy to spot.
    console.warn('sponsor request rejected: origin not allowed', {
      origin: req.headers.origin ?? null,
      allowed: deps.config.allowedOrigins,
    })
  }
  if (req.method === 'OPTIONS') return { status: originAllowed ? 204 : 403, headers, body: null }
  if (req.method !== 'POST') return fail(405, null, 'method not allowed', headers)
  if (!originAllowed) return fail(403, null, 'origin not allowed', headers)

  const userId = await authenticate(req, deps)
  if (!userId) return fail(401, null, 'unauthorized', headers)

  const parsed = rpcSchema.safeParse(req.body)
  if (!parsed.success) return fail(400, null, 'invalid JSON-RPC request', headers)
  const rpc = parsed.data

  const isSponsored = USER_OP_METHODS.has(rpc.method) || PAYMASTER_METHODS.has(rpc.method)
  if (!isSponsored && !PASS_THROUGH.has(rpc.method)) return fail(403, rpc.id, 'method not allowed', headers)

  // Sponsored calls cost money: tight limit. Read-only calls (gas price, receipt polling) get a looser one.
  const allowed = isSponsored
    ? deps.limiter.allow(`${userId}:sponsor`)
    : deps.limiter.allow(`${userId}:read`, deps.config.rateLimitPerMinute * READ_LIMIT_MULTIPLIER)
  if (!allowed) return fail(429, rpc.id, 'rate limit exceeded', headers)
  const problem = isSponsored ? checkSponsored(rpc, deps.config) : null
  if (problem) {
    // Public diagnostics only: param types and the entry point address (never the user operation contents).
    const entryPoint = rpc.params[1]
    console.warn('sponsor request rejected', {
      method: rpc.method,
      reason: problem,
      paramTypes: rpc.params.map((p) => (Array.isArray(p) ? 'array' : typeof p)),
      entryPoint: typeof entryPoint === 'string' ? entryPoint : null,
    })
    return fail(403, rpc.id, problem, headers)
  }

  try {
    return { status: 200, headers, body: await deps.forward(withPolicy(rpc, deps.config.policyId)) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.error('sponsor upstream failure', { method: rpc.method, message })
    return fail(502, rpc.id, 'upstream error', headers)
  }
}
