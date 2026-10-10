import { describeLastSync, useSync } from '../sync/SyncProvider'

/** One-line sync status for the top of Home. Hidden until Drive sync is connected. */
export function SyncStatus() {
  const { state, lastSyncAt, error, syncNow } = useSync()
  if (state === 'off' && !error) return null

  const text: Record<typeof state, string> = {
    off: 'Google Drive sync is off',
    'needs-signin': 'Tap to sync with Google Drive',
    syncing: 'Syncing…',
    ok: `Synced ${describeLastSync(lastSyncAt)}`,
    error: 'Sync problem — tap to retry',
    offline: 'Offline — will sync when back online',
  }
  const tone = state === 'error' ? 'var(--danger)' : state === 'needs-signin' ? 'var(--warn)' : 'var(--muted)'
  return (
    <button
      className="row tiny"
      style={{ alignSelf: 'flex-end', gap: 6, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: tone }}
      onClick={syncNow}
      disabled={state === 'syncing'}
      title={error || undefined}
    >
      <span aria-hidden="true">☁︎</span>
      {text[state]}
    </button>
  )
}
