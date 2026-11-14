import { useCallback, useEffect, useRef, useState } from 'react'

import { jstDayKey } from '@/lib/schedule'
import { shareText, type ShareResult } from '@/lib/share'
import { slotOutcomesForDay } from '@/lib/shareGrid'
import { computeStreak, participationDays } from '@/lib/streak'
import { errorMessage, type GameClient, type Outcome, type RoundRecord, type Schedule } from '@/lib/types'

const TICK_MS = 1000
const HISTORY_COUNT = 120
const SCHEDULE_RETRY_MS = 5000
const SETTLE_RETRY_MS = 15_000
const SHARE_NOTE_MS = 4000
/** Squares shown in free play (demo), matching the four daily slots of the live game. */
const FREE_PLAY_SLOTS = 4

export type ScheduleState = { isLoaded: false } | { isLoaded: true; schedule: Schedule | null }

export type History = { records: readonly RoundRecord[]; outcomes: ReadonlyMap<number, Outcome> }

const EMPTY_HISTORY: History = { records: [], outcomes: new Map() }

/** Wall clock in ms, ticking every second only while `isTicking`. */
export function useNow(isTicking: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!isTicking) return
    const tick = (): void => setNowMs(Date.now())
    const firstId = setTimeout(tick, 0)
    const id = setInterval(tick, TICK_MS)
    return () => {
      clearTimeout(firstId)
      clearInterval(id)
    }
  }, [isTicking])
  return nowMs
}

/** Loads the daily schedule once per connected client, retrying on failure. */
export function useSchedule(client: GameClient, isConnected: boolean): ScheduleState {
  const [state, setState] = useState<ScheduleState>({ isLoaded: false })
  useEffect(() => {
    if (!isConnected) return
    let isCancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const load = async (): Promise<void> => {
      try {
        const schedule = await client.getSchedule()
        if (!isCancelled) setState({ isLoaded: true, schedule })
      } catch (error) {
        console.error('load schedule failed', errorMessage(error))
        if (!isCancelled) retryId = setTimeout(() => void load(), SCHEDULE_RETRY_MS)
      }
    }
    void load()
    return () => {
      isCancelled = true
      clearTimeout(retryId)
    }
  }, [client, isConnected])
  return state
}

/** Recent rounds and the player's outcomes, reloaded whenever `loadKey` changes to a non-null value. */
export function useHistory(client: GameClient, loadKey: string | null): History {
  const [history, setHistory] = useState<History>(EMPTY_HISTORY)
  useEffect(() => {
    if (loadKey === null) return
    let isCancelled = false
    const load = async (): Promise<void> => {
      try {
        const records = await client.getRecentRounds(HISTORY_COUNT)
        const outcomes = await client.getOutcomes(records)
        if (!isCancelled) setHistory({ records, outcomes })
      } catch (error) {
        console.error('load history failed', loadKey, errorMessage(error))
      }
    }
    void load()
    return () => {
      isCancelled = true
    }
  }, [client, loadKey])
  return history
}

/** Today's squares: one per scheduled slot, or the latest rounds of today in free play. */
export function todayOutcomes(schedule: Schedule | null, dayKey: number, history: History): Outcome[] {
  if (schedule) return slotOutcomesForDay(schedule, dayKey, history.records, history.outcomes)
  const played = history.records
    .filter((r) => r.entered && jstDayKey(r.endTime) === dayKey)
    .slice(-FREE_PLAY_SLOTS)
    .map((r) => history.outcomes.get(r.id) ?? 'none')
  return [...played, ...Array.from({ length: FREE_PLAY_SLOTS - played.length }, (): Outcome => 'none')]
}

export type DayRecord = { streak: { current: number; freezes: number }; recent: Outcome[] }

export function deriveDayRecord(schedule: Schedule | null, history: History, nowMs: number): DayRecord {
  const todayKey = jstDayKey(Math.floor(nowMs / 1000))
  return {
    streak: computeStreak(participationDays(history.records), todayKey),
    recent: todayOutcomes(schedule, todayKey, history),
  }
}

type AutoSettleInput = {
  isActive: boolean
  /** Round to settle next (from the history queue), or null. */
  roundId: number | null
  isBlocked: boolean
  /** Random wait before an attempt, so watching clients do not all send at the deadline. */
  jitterMs: () => number
  /** Resolves true on success; a failure is retried after SETTLE_RETRY_MS. */
  settle: (roundId: number) => Promise<boolean>
}

/** Settles `roundId` while `isActive`, after a random wait; a failed attempt waits before the next one. */
export function useAutoSettle({ isActive, roundId, isBlocked, jitterMs, settle }: AutoSettleInput): boolean {
  const [isSettling, setIsSettling] = useState(false)
  const lastAttemptMs = useRef(0)
  useEffect(() => {
    if (!isActive || roundId === null || isBlocked || isSettling) return
    const retryWaitMs = lastAttemptMs.current + SETTLE_RETRY_MS - Date.now()
    const id = setTimeout(() => {
      lastAttemptMs.current = Date.now()
      setIsSettling(true)
      void settle(roundId)
        .then((isSettled) => {
          if (isSettled) lastAttemptMs.current = 0
        })
        .finally(() => setIsSettling(false))
    }, Math.max(jitterMs(), retryWaitMs))
    return () => clearTimeout(id)
  }, [isActive, roundId, isBlocked, isSettling, jitterMs, settle])
  return isSettling
}

/** Shares `text` and keeps the result visible for a few seconds. */
export function useShare(text: string): { status: ShareResult | null; share: () => void } {
  const [status, setStatus] = useState<ShareResult | null>(null)
  useEffect(() => {
    if (status === null) return
    const id = setTimeout(() => setStatus(null), SHARE_NOTE_MS)
    return () => clearTimeout(id)
  }, [status])
  const share = useCallback(() => {
    void shareText(text).then(setStatus)
  }, [text])
  return { status, share }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** `h:mm:ss`, or `m:ss` under an hour. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours === 0) return `${minutes}:${pad2(seconds)}`
  return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
}
