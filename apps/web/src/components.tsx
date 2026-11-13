import type { ReactNode } from 'react'

import { MAX_STAKE, MIN_STAKE, type Side } from '@/lib/types'

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
      <div className="c--wordmark">Minority Rush</div>
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

export function Timer({ seconds }: { seconds: number }) {
  return (
    <div className="c--timer" role="timer" aria-label={`${seconds} seconds remaining`}>
      <span>{seconds}</span>
    </div>
  )
}

const SunIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </svg>
)
const MoonIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M20 15.4A8.5 8.5 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z" />
  </svg>
)

export function SidePicker({ value, onChange }: { value: Side; onChange: (side: Side) => void }) {
  const items: { side: Side; name: string; hint: string; icon: ReactNode }[] = [
    { side: 'sun', name: 'Sun', hint: 'Warm instinct', icon: SunIcon },
    { side: 'moon', name: 'Moon', hint: 'Cool instinct', icon: MoonIcon },
  ]
  return (
    <div className="c--choices" role="group" aria-label="Choose a side">
      {items.map((item) => (
        <button
          key={item.side}
          type="button"
          className={`c--choice is--${item.side}${value === item.side ? ' is--selected' : ''}`}
          aria-pressed={value === item.side}
          onClick={() => onChange(item.side)}
        >
          <span className="c--choiceIcon">{item.icon}</span>
          <span className="c--choiceName">{item.name}</span>
          <span className="c--choiceHint">{item.hint}</span>
        </button>
      ))}
    </div>
  )
}

export function StakeSlider({ value, onChange }: { value: number; onChange: (stake: number) => void }) {
  return (
    <div className="c--stakeBox">
      <div className="c--stakeTop">
        <label htmlFor="stake">Secret stake</label>
        <strong className="c--stakeValue">{value} RUSH</strong>
      </div>
      <input
        className="c--range"
        id="stake"
        type="range"
        min={MIN_STAKE}
        max={MAX_STAKE}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="c--stakeScale">
        <span>{MIN_STAKE} cautious</span>
        <span>{MAX_STAKE} bold</span>
      </div>
    </div>
  )
}
