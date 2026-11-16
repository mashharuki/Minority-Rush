import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/app.css'
import './poker/poker.css'
import App from './poker/PokerApp.tsx'
import { isAaEnabled } from './lib/env'
import { PrivyAuthProvider } from './lib/privyBridge'
import { PrivyBoundary } from './lib/PrivyBoundary'
import { installStaleBuildRecovery } from './lib/staleBuild'

installStaleBuildRecovery()

const app = <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAaEnabled ? (
      <PrivyBoundary fallback={app}>
        <PrivyAuthProvider>{app}</PrivyAuthProvider>
      </PrivyBoundary>
    ) : (
      app
    )}
  </StrictMode>,
)
