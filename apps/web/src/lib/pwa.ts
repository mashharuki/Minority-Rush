import { useCallback, useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

type InstallEvent = Event & { prompt: () => Promise<void> }

export type PwaState = {
  isOffline: boolean
  canInstall: boolean
  isIosSafari: boolean
  hasUpdate: boolean
  install: () => Promise<void>
  applyUpdate: () => Promise<void>
}

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Online/offline, install prompt and service-worker update state. Registers the SW once. */
export function usePwa(): PwaState {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [updateSw, setUpdateSw] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    const onInstall = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallEvent)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('beforeinstallprompt', onInstall)
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const update = registerSW({ onNeedRefresh: () => setHasUpdate(true) })
    setUpdateSw(() => update)
  }, [])

  const install = useCallback(async () => {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
  }, [installEvent])

  const applyUpdate = useCallback(async () => {
    await updateSw?.(true)
  }, [updateSw])

  return {
    isOffline,
    canInstall: installEvent !== null && !isStandalone(),
    isIosSafari: isIos() && !isStandalone(),
    hasUpdate,
    install,
    applyUpdate,
  }
}
