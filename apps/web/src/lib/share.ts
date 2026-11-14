export type ShareResult = 'shared' | 'copied' | 'failed'

/** Native share sheet first, clipboard second. Never throws. */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      // Cancelled or unsupported: fall back to the clipboard.
      console.warn('shareText: navigator.share failed', error)
    }
  }
  if (typeof navigator.clipboard?.writeText !== 'function') return 'failed'
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch (error) {
    console.warn('shareText: clipboard write failed', error)
    return 'failed'
  }
}
