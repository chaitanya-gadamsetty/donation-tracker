import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { consumeRedirect } from './sync/auth'
import { SyncProvider } from './sync/SyncProvider'

// Must run before the app reads the URL: Google returns the sign-in result in the address's # part.
const signIn = consumeRedirect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SyncProvider initialError={typeof signIn === 'object' ? signIn.error : undefined}>
      <App />
    </SyncProvider>
  </StrictMode>,
)
