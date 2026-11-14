import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AppBar,
  ChipsNotice,
  Disclaimer,
  ErrorBox,
  InstallHint,
  OfflineBanner,
  SidePicker,
  StakeSlider,
  StatusBar,
  Timer,
  UpdateBanner,
} from '@/components'
import { HomeScreen, ShareButton } from '@/home'
import { deriveDayRecord, useAutoSettle, useHistory, useNow, useSchedule, useShare } from '@/homeState'
import { createGameClient, type LoginKind } from '@/lib/client'
import { env, isAaEnabled, isDeployed } from '@/lib/env'
import { usePwa } from '@/lib/pwa'
import { dayNumber, joinState, LAUNCH_DAY_KEY } from '@/lib/schedule'
import { isJoinBlocked, roundToClaim, roundToSettle, SETTLE_JITTER_MAX_MS, settleJitterMs } from '@/lib/settleQueue'
import { formatShareText } from '@/lib/shareGrid'
import { errorMessage, MIN_PLAYERS, MIN_STAKE, type MyResult, type RoundState, type Side } from '@/lib/types'

type Screen = 'login' | 'setup' | 'home' | 'pick' | 'sealed' | 'reveal'

const POLL_MS = 3000

function useRound(client: ReturnType<typeof createGameClient>, enabled: boolean) {
  const [round, setRound] = useState<RoundState | null>(null)
  const refresh = useCallback(async () => {
    try {
      setRound(await client.getRound())
    } catch (error) {
      console.error('refresh round failed', errorMessage(error))
    }
  }, [client])
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [enabled, refresh])
  return { round, refresh }
}

type RunOptions = {
  /** False for background work (auto-settle): failures are logged, never shown to the player. */
  shouldReportError?: boolean
  /** Operation name for the error log. */
  label?: string
}

/** True when the round the player sealed in has passed its deadline (or a newer round already exists). */
function isSealedRoundOver(round: RoundState | null, sealedRoundId: number | null, nowMs: number): boolean {
  if (round === null || sealedRoundId === null || round.status === 'none') return false
  if (round.id !== sealedRoundId) return true
  return round.endTime <= nowMs
}

export default function App() {
  const clients = useMemo(() => ({ email: createGameClient('email'), wallet: createGameClient('wallet') }), [])
  const [kind, setKind] = useState<LoginKind>(isAaEnabled ? 'email' : 'wallet')
  const client = clients[kind]
  const isGasless = client.mode === 'live' && kind === 'email'
  const [screen, setScreen] = useState<Screen>('login')
  const [address, setAddress] = useState<string | null>(null)
  const [side, setSide] = useState<Side>('sun')
  const [stake, setStake] = useState(4)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [result, setResult] = useState<MyResult | null>(null)
  const [sealedRoundId, setSealedRoundId] = useState<number | null>(null)
  const [revealedRoundId, setRevealedRoundId] = useState<number | null>(null)
  /** Bumped after a settle or claim so the history (squares, claim queue) reloads in place. */
  const [historyVersion, setHistoryVersion] = useState(0)
  const [chipsAvailableAtMs, setChipsAvailableAtMs] = useState<number | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  /** The sealed round this client already tried to settle automatically; later attempts are the player's "Retry". */
  const autoSettledRoundId = useRef<number | null>(null)
  const pwa = usePwa()

  const isLocked = isBusy || pwa.isOffline
  const { round, refresh } = useRound(client, screen === 'home' || screen === 'pick' || screen === 'sealed')
  const nowMs = useNow(screen === 'home' || screen === 'pick' || screen === 'sealed')
  const secondsLeft = Math.max(0, Math.ceil(((round?.endTime ?? 0) - nowMs) / 1000))
  const scheduleState = useSchedule(client, address !== null)
  const schedule = scheduleState.isLoaded ? scheduleState.schedule : null
  // Reload on entering home or reveal, when the latest round changes, and after every settle or claim.
  const historyKey = screen === 'home' ? `home:${round?.id ?? 0}:${round?.status ?? 'none'}` : screen
  const history = useHistory(
    client,
    address !== null && (screen === 'home' || screen === 'reveal') ? `${historyKey}:${historyVersion}` : null,
  )
  const settleTarget = roundToSettle(history.records, nowMs)
  const claimTarget = roundToClaim(history.records)
  const { streak, recent } = useMemo(() => deriveDayRecord(schedule, history, nowMs), [schedule, history, nowMs])
  const shareMessage = formatShareText({
    dayNumber: dayNumber(Math.floor(nowMs / 1000), LAUNCH_DAY_KEY),
    streak: streak.current,
    outcomes: recent,
  })
  const share = useShare(shareMessage)

  const run = useCallback(async (task: () => Promise<void>, options: RunOptions = {}): Promise<boolean> => {
    const { shouldReportError = true, label = 'action' } = options
    setIsBusy(true)
    if (shouldReportError) setError(null)
    try {
      await task()
      return true
    } catch (e) {
      console.error(`${label} failed`, errorMessage(e))
      if (shouldReportError) setError(errorMessage(e))
      return false
    } finally {
      setStep(null)
      setIsBusy(false)
    }
  }, [])

  /** Background decrypt of the chip balance; unknown (null) on failure so the next pick screen asks again. */
  const refreshBalance = useCallback(async (): Promise<void> => {
    try {
      setBalance(await client.readBalance())
    } catch (e) {
      console.error('refresh balance failed', errorMessage(e))
      setBalance(null)
    }
  }, [client])

  const connect = (next: LoginKind) =>
    run(async () => {
      setKind(next)
      const chosen = clients[next]
      setAddress(await chosen.connect())
      setScreen('setup')
      setStep('Preparing your private player')
      await chosen.onboard(setStep)
      setScreen('home')
    })

  const revealBalance = () =>
    run(async () => {
      setStep('Decrypting your balance')
      setBalance(await client.readBalance())
    })

  const getChips = () =>
    run(async () => {
      setStep('Checking your daily chips')
      const chips = await client.claimDailyChips(setStep)
      setChipsAvailableAtMs(chips.claimed ? null : chips.availableAtMs)
      if (!chips.claimed) return
      setStep('Decrypting your balance')
      setBalance(await client.readBalance())
    })

  const openPick = () => {
    setScreen('pick')
    if (balance === null) void revealBalance()
  }

  const seal = () =>
    run(async () => {
      setSealedRoundId(await client.enter(side, stake, setStep))
      await refresh()
      setScreen('sealed')
      void refreshBalance()
    })

  // Resume if the player already sealed a move in the open round.
  useEffect(() => {
    if (screen === 'pick' && round?.hasEntered && round.status !== 'settled' && round.status !== 'cancelled') {
      setSealedRoundId(round.id)
      setScreen('sealed')
    }
  }, [screen, round])

  const canSettle = screen === 'sealed' && isSealedRoundOver(round, sealedRoundId, nowMs)
  const jitterMs = useCallback(() => settleJitterMs(client.mode === 'demo' ? 0 : SETTLE_JITTER_MAX_MS), [client])

  const claimAndReveal = useCallback(
    async (roundId: number) => {
      setResult(await client.claim(roundId, setStep))
      setRevealedRoundId(roundId)
      setHistoryVersion((v) => v + 1)
      setScreen('reveal')
      void refreshBalance()
    },
    [client, refreshBalance],
  )

  const settleAndClaim = useCallback(
    () =>
      run(async () => {
        if (sealedRoundId === null) return
        await client.settle(sealedRoundId, setStep)
        await claimAndReveal(sealedRoundId)
      }),
    [client, run, claimAndReveal, sealedRoundId],
  )

  const seeResult = () => {
    if (claimTarget !== null) void run(() => claimAndReveal(claimTarget))
  }

  // Errors here are background noise (another client usually settles first); they are logged and retried, not shown.
  const settleFromHome = useCallback(
    (roundId: number) =>
      run(
        async () => {
          await client.settle(roundId, setStep)
          setHistoryVersion((v) => v + 1)
          await refresh()
        },
        { shouldReportError: false, label: `auto-settle round ${roundId}` },
      ),
    [client, run, refresh],
  )

  // On home, settle expired rounds from the history, oldest first, so none is left unfinalized.
  const isSettling = useAutoSettle({
    isActive: screen === 'home',
    roundId: settleTarget,
    isBlocked: isBusy || pwa.isOffline,
    jitterMs,
    settle: settleFromHome,
  })

  // Anyone can settle after the deadline; after a random wait, this client does it unless another already has.
  useEffect(() => {
    if (!canSettle || autoSettledRoundId.current === sealedRoundId || isBusy || pwa.isOffline) return
    const id = setTimeout(() => {
      autoSettledRoundId.current = sealedRoundId
      void settleAndClaim()
    }, jitterMs())
    return () => clearTimeout(id)
  }, [canSettle, sealedRoundId, isBusy, pwa.isOffline, settleAndClaim, jitterMs])

  const goHome = () => {
    setResult(null)
    setScreen('home')
    void refresh()
  }

  const players = round?.playerCount ?? 0
  const isOutOfChips = balance !== null && balance < MIN_STAKE
  const isScheduleReady = scheduleState.isLoaded
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

  return (
    <main className="c--canvas">
      <section className="c--phoneStage" aria-label="Minority Rush">
        <div className="c--phone">
          <OfflineBanner isOffline={pwa.isOffline} />
          <UpdateBanner hasUpdate={pwa.hasUpdate && !pwa.isOffline} isLocked={isBusy} onUpdate={() => void pwa.applyUpdate()} />
          {screen === 'login' && (
            <section className="c--screen c--login is--active">
              <StatusBar />
              <AppBar right={<span className="c--barNote">{client.mode === 'demo' ? 'Demo mode' : 'Sepolia'}</span>} />
              <div className="c--loginHero">
                <div>
                  <h2 className="c--loginTitle">
                    Stay <span>unread.</span>
                  </h2>
                  <p className="c--loginCopy">Choose a side. Set a secret stake. Win by thinking unlike the crowd.</p>
                </div>
                <div className="c--loginForm">
                  <button className="c--btn" type="button" onClick={() => void connect(isAaEnabled ? 'email' : 'wallet')} disabled={isLocked}>
                    {client.mode === 'demo' ? 'Play the demo' : isAaEnabled ? 'Play with email' : 'Connect wallet'}
                  </button>
                  {isAaEnabled && (
                    <button className="c--btn is--secondary" type="button" onClick={() => void connect('wallet')} disabled={isLocked}>
                      Use a wallet instead
                    </button>
                  )}
                  <span className="c--trustLine">
                    {client.mode === 'demo'
                      ? 'Offline simulation · nothing is encrypted in demo mode'
                      : isAaEnabled
                        ? 'Private wallet by Privy · gas sponsored · no seed phrase'
                        : 'Sepolia testnet · your side and stake stay encrypted'}
                  </span>
                  <ErrorBox message={error} />
                  <Disclaimer />
                </div>
              </div>
            </section>
          )}

          {screen === 'setup' && (
            <section className="c--screen c--setup is--active">
              <StatusBar />
              <AppBar right={<span className="c--barNote">{shortAddress}</span>} />
              <div className="c--setupBody">
                <div>
                  <div className="c--setupSeal" />
                  <h2>Getting your private player ready.</h2>
                  <p className="c--setupLead">{step ?? 'Almost there…'}</p>
                  <ErrorBox message={error} />
                </div>
                {error && (
                  <button className="c--btn" type="button" onClick={() => void connect(kind)} disabled={isLocked}>
                    Try again
                  </button>
                )}
                <Disclaimer />
              </div>
            </section>
          )}

          {screen === 'home' && (
            <section className="c--screen is--active">
              <StatusBar />
              <AppBar right={<span className="c--barNote">{client.mode === 'demo' ? 'Demo mode' : shortAddress}</span>} />
              <HomeScreen
                join={joinState(schedule, nowMs, round ?? { status: 'none', endTime: 0 })}
                nowMs={nowMs}
                players={players}
                minPlayers={MIN_PLAYERS}
                streak={streak}
                recent={recent}
                hasUnseenResult={claimTarget !== null}
                isLocked={isLocked || !isScheduleReady}
                isSettling={isSettling || isJoinBlocked(history.records, nowMs)}
                step={step}
                error={error}
                shareStatus={share.status}
                onJoin={openPick}
                onShare={share.share}
                onSeeResult={() => void seeResult()}
              />
            </section>
          )}

          {screen === 'pick' && (
            <section className="c--screen is--active">
              <StatusBar />
              <AppBar
                right={
                  <button className="c--balancePill" type="button" onClick={revealBalance} disabled={isLocked}>
                    <i /> {balance === null ? 'Reveal balance' : `${balance} private chips`}
                  </button>
                }
              />
              <div className="c--content">
                <div className="c--gameHeader">
                  <div>
                    <span className="c--roundPill">
                      <i /> {round && round.status !== 'none' ? `Round ${round.id} · ${players} joined` : 'Next round'}
                    </span>
                    <h2 style={{ marginTop: 16 }}>Which side stays small?</h2>
                    <p>Both the choice and stake stay encrypted.</p>
                  </div>
                  {round?.status === 'open' && <Timer seconds={secondsLeft} />}
                </div>
                <SidePicker value={side} onChange={setSide} />
                <StakeSlider value={stake} onChange={setStake} />
                <button className="c--btn c--sealBtn" type="button" onClick={seal} disabled={isLocked || isOutOfChips}>
                  {isBusy ? (step ?? 'Working…') : `Seal ${side === 'sun' ? 'Sun' : 'Moon'} · ${stake} RUSH`}
                </button>
                {isOutOfChips && (
                  <ChipsNotice availableAtMs={chipsAvailableAtMs} isLocked={isLocked} onGetChips={() => void getChips()} />
                )}
                <ErrorBox message={error} />
                <div className="c--gasless">
                  <i /> {client.mode === 'demo'
                    ? 'Demo mode · no wallet needed'
                    : isGasless
                      ? 'Gas sponsored · No ETH required'
                      : 'Sepolia testnet · test ETH for gas'}
                </div>
                <Disclaimer />
              </div>
            </section>
          )}

          {screen === 'sealed' && (
            <section className="c--screen c--sealed is--active">
              <StatusBar />
              <AppBar
                right={
                  <span className="c--roundPill">
                    <i /> {players} joined
                  </span>
                }
              />
              <div className="c--sealedBody">
                <div>
                  <div className="c--sealRing">
                    <span className="c--lock" />
                  </div>
                  <h2>Your move is sealed.</h2>
                  <p className="c--sealedLead">Nobody can read your side or stake — not even from the block explorer.</p>
                  <div className="c--hashSlip">
                    <span>Round {round?.id ?? '—'}</span>
                    <code>{secondsLeft > 0 ? `Closes in ${secondsLeft}s` : 'Round closed'}</code>
                  </div>
                </div>
                <div style={{ width: '100%' }}>
                  <ErrorBox message={error} />
                  {error && (
                    <button className="c--btn is--moon" type="button" onClick={() => void settleAndClaim()} disabled={isLocked}>
                      Retry reveal
                    </button>
                  )}
                  <div className="c--gasless">
                    <i /> {step ?? (secondsLeft > 0 ? 'Waiting for the crowd' : 'Computing on encrypted stakes')}
                  </div>
                  <Disclaimer />
                </div>
              </div>
            </section>
          )}

          {screen === 'reveal' && result && (
            <section className="c--screen c--reveal is--active">
              <StatusBar />
              <AppBar right={<span className="c--barNote">Round {revealedRoundId ?? ''} settled</span>} />
              <div className="c--revealBody">
                <div>
                  <p className="c--winLabel">{result.cancelled ? 'Not enough players' : 'The quieter side was'}</p>
                  <div className="c--winnerWord">{result.cancelled ? 'VOID' : result.winner === 'moon' ? 'MOON' : 'SUN'}</div>
                </div>
                <div>
                  <h2>{result.cancelled ? 'Your stake is back.' : result.won ? 'You read the room.' : 'The crowd got you.'}</h2>
                  <div className="c--reward">
                    <div>
                      <span>Private reward</span>
                      <strong>+{result.reward} RUSH</strong>
                    </div>
                    <span className="c--rewardBadge">{result.cancelled ? 'refund' : result.won ? '2× stake' : '0×'}</span>
                  </div>
                  <div className="c--proofRow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="m8 12.5 2.8 2.8L16 9.5" />
                    </svg>
                    <span>
                      Winner verified by on-chain decryption proof · Your stake remains private
                      {isDeployed && (
                        <>
                          {' · '}
                          <a
                            className="c--verifyLink"
                            href={`https://sepolia.etherscan.io/address/${env.gameAddress}#events`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Verify on Etherscan
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="c--revealActions">
                    <button className="c--btn" type="button" onClick={goHome}>
                      Back to home
                    </button>
                    <ShareButton status={share.status} onShare={share.share} />
                  </div>
                  <InstallHint canInstall={pwa.canInstall} isIosSafari={pwa.isIosSafari} onInstall={() => void pwa.install()} />
                  <Disclaimer />
                </div>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  )
}
