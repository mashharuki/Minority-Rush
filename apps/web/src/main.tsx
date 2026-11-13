import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/app.css'
import App from './App.tsx'
import { isAaEnabled } from './lib/env'
import { PrivyAuthProvider } from './lib/privyBridge'
import { PrivyBoundary } from './lib/PrivyBoundary'

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
