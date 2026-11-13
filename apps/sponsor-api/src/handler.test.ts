import { encodeFunctionData, parseAbi } from 'viem'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { SponsorConfig } from './config'
import { handleSponsorRequest, type Deps, type SponsorRequest } from './handler'
import { createRateLimiter } from './rateLimit'
import { ENTRY_POINT_V07 } from './validate'

const CHIP = '0x011B6b4b58738a93D123d129Ee7E1a5B0B1A50F2' as const
const GAME = '0x0B12A3748f8E97F01ab9c077b5c39d97Df28aBA6' as const
const SENDER = '0x1111111111111111111111111111111111111111' as const
const ORIGIN = 'https://minority-rush.example'

const config: SponsorConfig = {
  privyAppId: 'app',
  privyVerificationKey: 'key',
  pimlicoApiKey: 'pk',
  policyId: 'sp_real',
  allowedOrigins: [ORIGIN],
  chip: CHIP,
  game: GAME,
  rateLimitPerMinute: 2,
}

const account = parseAbi(['function execute(address dest, uint256 value, bytes func)'])
const faucetData = encodeFunctionData({ abi: parseAbi(['function faucet()']), functionName: 'faucet' })
const goodOp = {
  sender: SENDER,
  callData: encodeFunctionData({ abi: account, functionName: 'execute', args: [CHIP, 0n, faucetData] }),
}

const rpc = (method: string, params: unknown[]) => ({ jsonrpc: '2.0', id: 1, method, params })
const request = (body: unknown, overrides: Partial<SponsorRequest> = {}): SponsorRequest => ({
  method: 'POST',
  headers: { origin: ORIGIN, authorization: 'Bearer good-token' },
  body,
  ...overrides,
})

describe('handleSponsorRequest', () => {
  let forward: Mock<Deps['forward']>
  let deps: Deps

  beforeEach(() => {
    forward = vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: 'ok' })
    deps = {
      config,
      limiter: createRateLimiter(config.rateLimitPerMinute),
      verifyToken: async (token) => (token === 'good-token' ? { userId: 'did:privy:abc' } : null),
      forward,
    }
  })

  it('should answer preflight only for allowed origins', async () => {
    expect((await handleSponsorRequest(request(null, { method: 'OPTIONS' }), deps)).status).toBe(204)
    const evil = request(null, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })
    expect((await handleSponsorRequest(evil, deps)).status).toBe(403)
  })

  it('should reject requests without a valid Privy token', async () => {
    const missing = request(rpc('eth_chainId', []), { headers: { origin: ORIGIN } })
    expect((await handleSponsorRequest(missing, deps)).status).toBe(401)
    const bad = request(rpc('eth_chainId', []), { headers: { origin: ORIGIN, authorization: 'Bearer nope' } })
    expect((await handleSponsorRequest(bad, deps)).status).toBe(401)
    expect(forward).not.toHaveBeenCalled()
  })

  it('should reject disallowed origins even with a valid token', async () => {
    const res = await handleSponsorRequest(
      request(rpc('eth_chainId', []), { headers: { origin: 'https://evil.example', authorization: 'Bearer good-token' } }),
      deps,
    )
    expect(res.status).toBe(403)
  })

  it('should rate limit per user', async () => {
    const send = () => handleSponsorRequest(request(rpc('eth_chainId', [])), deps)
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(429)
  })

  it('should reject methods that are not allowlisted', async () => {
    const res = await handleSponsorRequest(request(rpc('eth_sendRawTransaction', ['0x00'])), deps)
    expect(res.status).toBe(403)
    expect(forward).not.toHaveBeenCalled()
  })

  it('should forward a valid paymaster request with our policy forced into the context', async () => {
    const body = rpc('pm_getPaymasterData', [goodOp, ENTRY_POINT_V07, '0xaa36a7', { sponsorshipPolicyId: 'sp_attacker' }])
    const res = await handleSponsorRequest(request(body), deps)
    expect(res.status).toBe(200)
    const sent = forward.mock.calls[0]?.[0] as { params: unknown[] }
    expect(sent.params[3]).toEqual({ sponsorshipPolicyId: 'sp_real' })
  })

  it('should reject sponsorship for the wrong entry point, chain or call', async () => {
    const wrongEntry = rpc('eth_sendUserOperation', [goodOp, '0x0000000000000000000000000000000000000001'])
    expect((await handleSponsorRequest(request(wrongEntry), deps)).status).toBe(403)
    deps.limiter = createRateLimiter(100)
    const wrongChain = rpc('pm_getPaymasterStubData', [goodOp, ENTRY_POINT_V07, '0x1', {}])
    expect((await handleSponsorRequest(request(wrongChain), deps)).status).toBe(403)
    const badOp = { sender: SENDER, callData: '0xdeadbeef' }
    const wrongCall = rpc('eth_sendUserOperation', [badOp, ENTRY_POINT_V07])
    expect((await handleSponsorRequest(request(wrongCall), deps)).status).toBe(403)
    expect(forward).not.toHaveBeenCalled()
  })

  it('should return 502 without leaking upstream details when forwarding fails', async () => {
    forward.mockRejectedValue(new Error('secret-url?apikey=abc'))
    const res = await handleSponsorRequest(request(rpc('eth_chainId', [])), deps)
    expect(res.status).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('apikey')
  })
})
