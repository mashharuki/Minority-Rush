import { afterEach, describe, expect, it, vi } from 'vitest'

import { shareText } from './share'

describe('shareText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return shared when navigator.share resolves', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    await expect(shareText('hi')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'hi' })
  })

  it('should return failed when share rejects and there is no clipboard', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('cancelled')) })
    await expect(shareText('hi')).resolves.toBe('failed')
  })

  it('should return copied when only clipboard.writeText resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(shareText('hi')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hi')
  })

  it('should return failed when clipboard.writeText rejects', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(shareText('hi')).resolves.toBe('failed')
  })

  it('should return failed when navigator has no share or clipboard', async () => {
    vi.stubGlobal('navigator', {})
    await expect(shareText('hi')).resolves.toBe('failed')
  })
})
