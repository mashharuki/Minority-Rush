import { describe, expect, it } from 'vitest'

import { loadConfig } from './config'

const base = {
  PRIVY_APP_ID: 'app',
  PRIVY_VERIFICATION_KEY: 'key',
  PIMLICO_API_KEY: 'pk',
  PIMLICO_SPONSORSHIP_POLICY_ID: 'sp',
  ALLOWED_WEB_ORIGIN: 'http://localhost:5173',
  CHIP_ADDRESS: '0x011B6b4b58738a93D123d129Ee7E1a5B0B1A50F2',
  GAME_ADDRESS: '0x0B12A3748f8E97F01ab9c077b5c39d97Df28aBA6',
}

describe('loadConfig', () => {
  it('should accept a complete configuration', () => {
    expect(loadConfig(base)).toMatchObject({ ok: true })
  })

  it('should normalise allowed origins (trim, trailing slash, empty entries)', () => {
    const result = loadConfig({ ...base, ALLOWED_WEB_ORIGIN: ' http://localhost:5173/ , https://app.example/,, ' })
    expect(result.ok && result.data.allowedOrigins).toEqual(['http://localhost:5173', 'https://app.example'])
  })

  it('should list the invalid fields without echoing their values', () => {
    const result = loadConfig({ ...base, PIMLICO_API_KEY: undefined, GAME_ADDRESS: 'nope' })
    expect(result).toMatchObject({ ok: false })
    const message = result.ok ? '' : result.error
    expect(message).toContain('PIMLICO_API_KEY')
    expect(message).toContain('GAME_ADDRESS')
    expect(message).not.toContain('nope')
  })
})
