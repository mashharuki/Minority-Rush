import type { ReactNode } from 'react'

export const DISCLAIMER = 'This project is not audited, endorsed or operated by Zama. Use at your own risk.'

export function Disclaimer() {
  return <p className="c--disclaimer">{DISCLAIMER}</p>
}

export function StatusBar() {
  return (
    <div className="c--statusBar">
      <span />
      <span />
    </div>
  )
}

export function AppBar({ right }: { right: ReactNode }) {
  return (
    <header className="c--appBar">
      <div className="c--wordmark">Blind Bluff</div>
      {right}
    </header>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="c--errorBox" role="alert">
      {message}
    </div>
  )
}

export function OfflineBanner({ isOffline }: { isOffline: boolean }) {
  if (!isOffline) return null
  return (
    <div className="c--offline" role="status" aria-live="polite">
      You're offline. Playing needs a connection, so actions are paused.
    </div>
  )
}

export function UpdateBanner({ hasUpdate, isLocked, onUpdate }: { hasUpdate: boolean; isLocked: boolean; onUpdate: () => void }) {
  if (!hasUpdate) return null
  return (
    <div className="c--offline is--update" role="status" aria-live="polite">
      Update available
      <button type="button" onClick={onUpdate} disabled={isLocked}>
        Update
      </button>
    </div>
  )
}
