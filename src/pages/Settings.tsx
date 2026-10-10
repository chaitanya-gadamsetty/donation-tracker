import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, budgetFor, live, saveSettings } from '../db'
import { exportBackup, exportCSV, importBackup } from '../lib/backup'
import { formatINR } from '../lib/format'
import { parseAmount } from '../lib/draft'

export function Settings() {
  const settings = useLiveQuery(live.settings, []) ?? DEFAULT_SETTINGS
  const year = new Date().getFullYear()
  const [defaultBudget, setDefaultBudget] = useState('')
  const [yearBudget, setYearBudget] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [storage, setStorage] = useState<{ persisted: boolean; usage: number } | null>(null)

  useEffect(() => {
    setDefaultBudget(String(settings.defaultBudget))
    setYearBudget(settings.budgets[String(year)] ? String(settings.budgets[String(year)]) : '')
  }, [settings, year])

  useEffect(() => {
    ;(async () => {
      if (!navigator.storage?.estimate) return
      const [est, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? false])
      setStorage({ persisted, usage: est.usage ?? 0 })
    })()
  }, [])

  const saveBudgets = async () => {
    const def = parseAmount(defaultBudget)
    if (!def || def < 0) return setMsg({ kind: 'danger', text: 'Enter a valid default budget.' })
    const budgets = { ...settings.budgets }
    const yb = parseAmount(yearBudget)
    if (yearBudget.trim() && yb > 0) budgets[String(year)] = yb
    else delete budgets[String(year)]
    await saveSettings({ defaultBudget: def, budgets })
    setMsg({ kind: 'ok', text: 'Budget saved.' })
  }

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMsg(null)
    try {
      const text = await fn()
      if (text) setMsg({ kind: 'ok', text })
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Settings</h1>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="card stack">
        <h2>Giving budget</h2>
        <div className="grid-2">
          <label className="field">
            Default yearly budget (₹)
            <input className="input num" inputMode="numeric" value={defaultBudget} onChange={(e) => setDefaultBudget(e.target.value)} />
          </label>
          <label className="field">
            {year} only (optional override)
            <input className="input num" inputMode="numeric" value={yearBudget} placeholder={`Uses default`} onChange={(e) => setYearBudget(e.target.value)} />
          </label>
        </div>
        <div className="spread">
          <span className="small muted">{year} budget: {formatINR(budgetFor(settings, year))}</span>
          <button className="btn primary" onClick={saveBudgets}>Save budget</button>
        </div>
      </div>

      <div className="card stack">
        <h2>Backup &amp; export</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Your data lives on this device until Google Drive sync is set up. Export a backup regularly and keep it in iCloud Drive or Google Drive.
          {settings.lastBackupAt ? ` Last backup: ${new Date(settings.lastBackupAt).toLocaleString('en-IN')}.` : ' No backup yet.'}
        </p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => run(async () => { await exportBackup(); return 'Backup downloaded.' })}>Download full backup (.zip)</button>
          <label className={`btn ${busy ? 'disabled' : ''}`}>
            Restore / merge backup…
            <input
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) run(async () => {
                  const s = await importBackup(f)
                  return `Merged: ${s.donations} donations, ${s.foundations} foundations, ${s.pledges} pledges, ${s.receipts} receipts updated.`
                })
              }}
            />
          </label>
        </div>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(() => exportCSV(year))}>CSV — {year}</button>
          <button className="btn" disabled={busy} onClick={() => run(() => exportCSV())}>CSV — all years</button>
        </div>
        <div className="tiny muted">Restoring merges: for each record, the most recently edited version wins. Nothing newer on this device is overwritten.</div>
      </div>

      <div className="card stack">
        <h2>Sync</h2>
        <div className="small muted">Google Drive sync between iPhone and Mac — coming in the next build.</div>
      </div>

      {storage && (
        <div className="tiny muted">
          Storage used on this device: {(storage.usage / 1024 / 1024).toFixed(1)} MB ·{' '}
          {storage.persisted ? 'Protected from automatic browser cleanup' : 'Not yet protected from browser cleanup (install to Home Screen / Dock to protect it)'}
        </div>
      )}
    </div>
  )
}
