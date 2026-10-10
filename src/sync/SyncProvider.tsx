import { liveQuery } from 'dexie'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { db } from '../db'
import { disconnect as disconnectAuth, forgetToken, getToken, isConnected, startSignIn } from './auth'
import { DriveAuthError, googleDrive } from './drive'
import { fetchReceipt, runSync } from './sync'

export type SyncState = 'off' | 'needs-signin' | 'syncing' | 'ok' | 'error' | 'offline'

interface SyncContextValue {
  state: SyncState
  lastSyncAt: number
  error: string
  connect: () => void
  syncNow: () => void
  disconnect: () => Promise<void>
  /** Loads a receipt file from Drive when it was attached on another device. */
  loadReceipt: (receiptId: string) => Promise<Blob | null>
}

const SyncContext = createContext<SyncContextValue | null>(null)
const LAST_SYNC_KEY = 'dt.sync.last'

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync outside SyncProvider')
  return ctx
}

/** Fingerprint of local data; when it changes, there is something to sync. */
async function localFingerprint(): Promise<string> {
  const parts = await Promise.all(
    [db.foundations, db.donations, db.pledges, db.receipts, db.settings].map(async (t) => {
      const all = (await t.toArray()) as Array<{ updatedAt: number }>
      return `${all.length}:${Math.max(0, ...all.map((r) => r.updatedAt))}`
    }),
  )
  return parts.join('|')
}

export function SyncProvider({ initialError, children }: { initialError?: string; children: ReactNode }) {
  const initial = (): SyncState => (!isConnected() ? 'off' : getToken() ? 'ok' : 'needs-signin')
  const [state, setState] = useState<SyncState>(initial)
  const [error, setError] = useState(initialError ?? '')
  const [lastSyncAt, setLastSyncAt] = useState(() => Number(safeGet(LAST_SYNC_KEY) ?? 0))
  const running = useRef(false)
  const again = useRef(false)
  const syncedPrint = useRef('')

  const sync = useCallback(async () => {
    if (!isConnected()) return setState('off')
    const token = getToken()
    if (!token) return setState('needs-signin')
    if (!navigator.onLine) return setState('offline')
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setState('syncing')
    try {
      do {
        again.current = false
        await runSync(googleDrive(token))
      } while (again.current)
      syncedPrint.current = await localFingerprint()
      const now = Date.now()
      safeSet(LAST_SYNC_KEY, String(now))
      setLastSyncAt(now)
      setError('')
      setState('ok')
    } catch (e) {
      if (e instanceof DriveAuthError) {
        forgetToken()
        setState('needs-signin')
      } else {
        setError((e as Error).message || 'Sync failed.')
        setState(navigator.onLine ? 'error' : 'offline')
      }
    } finally {
      running.current = false
    }
  }, [])

  // Sync on start, when the app comes back to the foreground, and when the network returns.
  useEffect(() => {
    sync()
    const onVisible = () => document.visibilityState === 'visible' && sync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', sync)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', sync)
    }
  }, [sync])

  // Sync a couple of seconds after any local change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sub = liveQuery(localFingerprint).subscribe({
      next: (print) => {
        if (!syncedPrint.current || print === syncedPrint.current) return
        clearTimeout(timer)
        timer = setTimeout(sync, 2000)
      },
    })
    return () => {
      clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [sync])

  const value: SyncContextValue = {
    state,
    lastSyncAt,
    error,
    connect: startSignIn,
    syncNow: () => (getToken() ? sync() : startSignIn()),
    disconnect: async () => {
      await disconnectAuth()
      setState('off')
      setError('')
    },
    loadReceipt: async (receiptId) => {
      const token = getToken()
      if (!token) return null
      try {
        return await fetchReceipt(googleDrive(token), receiptId)
      } catch (e) {
        if (e instanceof DriveAuthError) {
          forgetToken()
          setState('needs-signin')
        }
        return null
      }
    },
  }
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

function safeGet(k: string) {
  try { return localStorage.getItem(k) } catch { return null }
}
function safeSet(k: string, v: string) {
  try { localStorage.setItem(k, v) } catch { /* ignore */ }
}

export function describeLastSync(at: number): string {
  if (!at) return 'never'
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
