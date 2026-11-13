import type { IncomingMessage, ServerResponse } from 'node:http'

import { verifyAccessToken } from '@privy-io/node'

import { loadConfig } from '../src/config'
import { handleSponsorRequest } from '../src/handler'
import { createRateLimiter } from '../src/rateLimit'

const SEPOLIA_BUNDLER_RPC = 'https://api.pimlico.io/v2/11155111/rpc'

const configResult = loadConfig(process.env)
const limiter = configResult.ok ? createRateLimiter(configResult.data.rateLimitPerMinute) : null

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : null
}

/** Vercel Node function: authenticated, validated JSON-RPC proxy to Pimlico (bundler + paymaster). */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!configResult.ok || !limiter) {
    console.error(configResult.ok ? 'limiter missing' : configResult.error)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'server misconfigured' }))
    return
  }
  const config = configResult.data
  let body: unknown = null
  try {
    body = req.method === 'POST' ? await readJson(req) : null
  } catch {
    body = undefined // schema validation turns this into a 400
  }

  const result = await handleSponsorRequest(
    { method: req.method ?? 'GET', headers: req.headers as Record<string, string | undefined>, body },
    {
      config,
      limiter,
      verifyToken: async (token) => {
        try {
          const claims = await verifyAccessToken({
            access_token: token,
            app_id: config.privyAppId,
            verification_key: config.privyVerificationKey,
          })
          return { userId: claims.user_id }
        } catch {
          return null // invalid/expired token: rejected as 401, token never logged
        }
      },
      forward: async (rpc) => {
        const url = `${SEPOLIA_BUNDLER_RPC}?apikey=${encodeURIComponent(config.pimlicoApiKey)}`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(rpc),
        })
        return response.json()
      },
    },
  )

  res.statusCode = result.status
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value)
  res.setHeader('content-type', 'application/json')
  res.end(result.body === null ? '' : JSON.stringify(result.body))
}
