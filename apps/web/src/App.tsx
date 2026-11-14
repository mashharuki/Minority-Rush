import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AppBar,
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

const isResultReady = (round: RoundState | null): boolean =>
  round !== null && round.hasEntered && !round.hasClaimed && (round.status === 'settled' || round.status === 'cancelled')

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
  const [isBusy, setIsBusy] = useState(false)
  const settling = useRef(false)
  const pwa = usePwa()

  const isLocked = isBusy || pwa.isOffline
  const { round, refresh } = useRound(client, screen === 'home' || screen === 'pick' || screen === 'sealed')
  const nowMs = useNow(screen === 'home' || screen === 'pick' || screen === 'sealed')
  const secondsLeft = Math.max(0, Math.ceil(((round?.endTime ?? 0) - nowMs) / 1000))
  const scheduleState = useSchedule(client, address !== null)
  const schedule = scheduleState.isLoaded ? scheduleState.schedule : null
  // Reload on entering home, and on reveal (every claim lands there).
  const history = useHistory(client, address !== null && (screen === 'home' || screen === 'reveal') ? screen : null)
  const { streak, recent } = useMemo(() => deriveDayRecord(schedule, history, nowMs), [schedule, history, nowMs])
  const shareMessage = formatShareText({
    dayNumber: dayNumber(Math.floor(nowMs / 1000), LAUNCH_DAY_KEY),
    streak: streak.current,
    outcomes: recent,
  })
  const share = useShare(shareMessage)

  const run = useCallback(async (task: () => Promise<void>) => {
    setIsBusy(true)
    setError(null)
    try {
      await task()
    } catch (e) {
      console.error('action failed', errorMessage(e))
      setError(errorMessage(e))
    } finally {
      setStep(null)
      setIsBusy(false)
    }
  }, [])

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

  const seal = () =>
    run(async () => {
      await client.enter(side, stake, setStep)
      await refresh()
      setScreen('sealed')
    })

  // Resume if the player already sealed a move in the open round.
  useEffect(() => {
    if (screen === 'pick' && round?.hasEntered && round.status !== 'settled' && round.status !== 'cancelled') {
      setScreen('sealed')
    }
  }, [screen, round])

  const roundOver = round !== null && round.status !== 'none' && secondsLeft === 0
  const canSettle = screen === 'sealed' && roundOver && round.hasEntered

  const claimAndReveal = useCallback(async () => {
    setResult(await client.claim(setStep))
    setBalance(null)
    setScreen('reveal')
  }, [client])

  const settleAndClaim = useCallback(
    () =>
      run(async () => {
        await client.settle(setStep)
        await claimAndReveal()
      }),
    [client, run, claimAndReveal],
  )

  const seeResult = () => run(claimAndReveal)

  const settleExpired = useCallback(
    () =>
      run(async () => {
        await client.settle(setStep)
        await refresh()
      }),
    [client, run, refresh],
  )

  // On home, close and finalize an expired round so the next one can start.
  const isSettling = useAutoSettle({
    isActive: screen === 'home',
    round,
    nowMs,
    isBlocked: isBusy || pwa.isOffline,
    settle: settleExpired,
  })

  // Anyone can settle after the deadline; the first client to notice does it automatically.
  useEffect(() => {
    if (!canSettle || settling.current || isBusy || pwa.isOffline) return
    settling.current = true
    void settleAndClaim().finally(() => {
      settling.current = false
    })
  }, [canSettle, round, isBusy, pwa.isOffline, settleAndClaim])

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
                hasUnseenResult={isResultReady(round)}
                isLocked={isLocked || !isScheduleReady}
                isSettling={isSettling}
                step={step}
                error={error}
                shareStatus={share.status}
                onJoin={() => setScreen('pick')}
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
                <ErrorBox message={isOutOfChips ? "Not enough chips. Claim today's chips first." : null} />
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
              <AppBar right={<span className="c--barNote">Round {round?.id ?? ''} settled</span>} />
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
