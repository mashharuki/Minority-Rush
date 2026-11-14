import type { JSX } from 'react'

import { Disclaimer, ErrorBox } from '@/components'
import { formatCountdown } from '@/homeState'
import type { ShareResult } from '@/lib/share'
import type { JoinState, Outcome } from '@/lib/types'

export type HomeProps = {
  join: JoinState
  nowMs: number
  /** Public participant count of the open round. */
  players: number
  minPlayers: number
  streak: { current: number; freezes: number }
  /** Today's slot squares from slotOutcomesForDay. */
  recent: readonly Outcome[]
  hasUnseenResult: boolean
  isLocked: boolean
  isSettling: boolean
  /** Progress label of the running action, if any. */
  step: string | null
  error: string | null
  shareStatus: ShareResult | null
  onJoin: () => void
  onShare: () => void
  onSeeResult: () => void
}

const OUTCOME_LABEL: Record<Outcome, string> = { won: 'won', lost: 'lost', none: 'not played' }
const SHARE_NOTE: Record<ShareResult, string | null> = { shared: null, copied: 'Copied', failed: 'Could not share' }

function countdownOf(join: JoinState, nowMs: number): { label: string; ms: number } | null {
  switch (join.kind) {
    case 'free':
      return null
    case 'waiting':
      return { label: 'Next round opens in', ms: join.opensMs - nowMs }
    case 'open':
      return { label: 'This round closes in', ms: join.endMs - nowMs }
    case 'startable':
      return { label: 'Next round closes in', ms: join.endMs - nowMs }
  }
}

function playersLine(join: JoinState, players: number, minPlayers: number): string | null {
  if (join.kind !== 'open') return null
  if (players >= minPlayers) return `${players} joined`
  return `${players} joined · ${minPlayers - players} more needed`
}

function Countdown({ join, nowMs, players, minPlayers }: Pick<HomeProps, 'join' | 'nowMs' | 'players' | 'minPlayers'>): JSX.Element {
  const countdown = countdownOf(join, nowMs)
  const crowd = playersLine(join, players, minPlayers)
  if (!countdown) {
    return (
      <div className="c--homeHead">
        <p className="c--countLabel">Free play</p>
        <h2 className="c--countdown">Any time</h2>
        <p className="c--countNote">A round starts when you join.</p>
      </div>
    )
  }
  return (
    <div className="c--homeHead">
      <p className="c--countLabel">{countdown.label}</p>
      <h2 className="c--countdown" role="timer">
        {formatCountdown(countdown.ms)}
      </h2>
      {crowd && <p className="c--countNote">{crowd}</p>}
    </div>
  )
}

function DayRecord({ streak, recent }: Pick<HomeProps, 'streak' | 'recent'>): JSX.Element {
  return (
    <section className="c--homeStats" aria-label="Your record">
      <div>
        <span className="c--statLabel">Streak</span>
        <strong className="c--streakValue">
          {streak.current} {streak.current === 1 ? 'day' : 'days'}
        </strong>
        {streak.freezes > 0 && <span className="c--statLabel">1 missed day covered</span>}
      </div>
      <div>
        <span className="c--statLabel">Today</span>
        <ol className="c--squares">
          {recent.map((outcome, index) => (
            <li key={index} className={`c--square is--${outcome}`}>
              <span className="sr-only">
                Round {index + 1}: {OUTCOME_LABEL[outcome]}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function ShareButton({ status, onShare }: { status: ShareResult | null; onShare: () => void }): JSX.Element {
  const note = status ? SHARE_NOTE[status] : null
  return (
    <div>
      <button className="c--btn is--secondary" type="button" onClick={onShare}>
        Share
      </button>
      <p className="c--shareNote" role="status" aria-live="polite">
        {note}
      </p>
    </div>
  )
}

export function HomeScreen(props: HomeProps): JSX.Element {
  const { join, hasUnseenResult, isLocked, isSettling, step } = props
  const canJoin = !isLocked && !isSettling && join.kind !== 'waiting'
  return (
    <div className="c--homeBody">
      <Countdown join={join} nowMs={props.nowMs} players={props.players} minPlayers={props.minPlayers} />
      <DayRecord streak={props.streak} recent={props.recent} />
      <div className="c--homeActions">
        {hasUnseenResult && (
          <button className="c--btn is--moon" type="button" onClick={props.onSeeResult} disabled={isLocked || isSettling}>
            {isLocked && step ? step : 'See result'}
          </button>
        )}
        <button className="c--btn" type="button" onClick={props.onJoin} disabled={!canJoin}>
          Join the round
        </button>
        {isSettling && (
          <div className="c--gasless" role="status">
            <i /> Calculating…
          </div>
        )}
        <ErrorBox message={props.error} />
        <ShareButton status={props.shareStatus} onShare={props.onShare} />
        <Disclaimer />
      </div>
    </div>
  )
}
