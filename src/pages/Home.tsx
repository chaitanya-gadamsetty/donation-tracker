import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { budgetFor, DEFAULT_SETTINGS, live, skipPledge } from '../db'
import { DueList } from '../components/DueList'
import { SyncStatus } from '../components/SyncStatus'
import { VoiceEntry } from '../components/VoiceEntry'
import { Icon, ReliabilityChip } from '../components/ui'
import { MONTHS, todayISO, yearOf } from '../lib/dates'
import { newDraft, type DonationDraft } from '../lib/draft'
import { formatINR } from '../lib/format'
import { CATEGORIES, type Foundation } from '../types'

export function Home({ onOpenForm, goTo }: { onOpenForm: (d: DonationDraft, notice?: string) => void; goTo: (page: string) => void }) {
  const donations = useLiveQuery(live.donations, []) ?? []
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const pledges = useLiveQuery(live.pledges, []) ?? []
  const settings = useLiveQuery(live.settings, []) ?? DEFAULT_SETTINGS
  const today = todayISO()
  const thisYear = yearOf(today)
  const [year, setYear] = useState(thisYear)
  const [showAll, setShowAll] = useState(false)

  const fById = useMemo(() => new Map(foundations.map((f) => [f.id, f])), [foundations])
  const years = useMemo(() => {
    const ys = new Set(donations.map((d) => yearOf(d.date)))
    ys.add(thisYear)
    return [...ys].sort((a, b) => a - b)
  }, [donations, thisYear])

  const stats = useMemo(() => {
    const ds = donations.filter((d) => yearOf(d.date) === year)
    const total = ds.reduce((s, d) => s + d.amount, 0)
    const months = Array.from({ length: 12 }, () => 0)
    const byCat: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
    const byF = new Map<string, { f?: Foundation; total: number; count: number }>()
    for (const d of ds) {
      months[Number(d.date.slice(5, 7)) - 1] += d.amount
      const f = fById.get(d.foundationId)
      byCat[f?.category ?? 'Others'] += d.amount
      const e = byF.get(d.foundationId) ?? { f, total: 0, count: 0 }
      e.total += d.amount
      e.count++
      byF.set(d.foundationId, e)
    }
    const foundationsRanked = [...byF.values()].sort((a, b) => b.total - a.total)
    const pendingReceipts = ds.filter((d) => d.receiptStatus === 'pending').length
    return { ds, total, months, byCat, foundationsRanked, pendingReceipts }
  }, [donations, year, fById])

  const budget = budgetFor(settings, year)
  const pct = budget ? Math.round((stats.total / budget) * 100) : 0
  const remaining = budget - stats.total
  const maxMonth = Math.max(...stats.months, 1)
  const maxCat = Math.max(...Object.values(stats.byCat), 1)
  const maxF = stats.foundationsRanked[0]?.total ?? 1
  const needsBackup = donations.length > 0 && Date.now() - settings.lastBackupAt > 30 * 86_400_000

  return (
    <div className="stack" style={{ gap: 16 }}>
      <SyncStatus />
      <VoiceEntry onOpenForm={onOpenForm} />

      <DueList
        pledges={pledges}
        foundations={fById}
        today={today}
        onPay={(p) => onOpenForm(newDraft({ foundation: { id: p.foundationId, name: fById.get(p.foundationId)?.name ?? '' }, amount: String(p.amount), payPledge: true }))}
        onSkip={(p) => confirm('Skip this occurrence and move the reminder to the next one?') && skipPledge(p.id)}
      />

      <div className="spread">
        <h1>{year === thisYear ? 'This year' : year}</h1>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm ghost" disabled={year <= years[0]} onClick={() => setYear((y) => y - 1)} aria-label="Previous year">{Icon.chevL}</button>
          <select className="input" style={{ minHeight: 34, padding: '4px 8px', width: 'auto' }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn sm ghost" disabled={year >= years[years.length - 1]} onClick={() => setYear((y) => y + 1)} aria-label="Next year">{Icon.chevR}</button>
        </div>
      </div>

      <div className="card stack">
        <div className="spread" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="small muted">Given in {year}</div>
            <div className="big num">{formatINR(stats.total)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="small muted">Budget {formatINR(budget)}</div>
            <div className="small num" style={{ fontWeight: 600, color: remaining < 0 ? 'var(--warn)' : undefined }}>
              {remaining >= 0 ? `${formatINR(remaining)} left` : `${formatINR(-remaining)} over`}
            </div>
          </div>
        </div>
        <div className={`progress ${pct > 100 ? 'over' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="spread tiny muted">
          <span>{pct}% of budget</span>
          <span>{stats.ds.length} donation{stats.ds.length === 1 ? '' : 's'} · {stats.foundationsRanked.length} foundation{stats.foundationsRanked.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {(stats.pendingReceipts > 0 || needsBackup) && (
        <div className="stack" style={{ gap: 8 }}>
          {stats.pendingReceipts > 0 && (
            <button className="alert warn" style={{ border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => goTo('history?receipt=pending')}>
              {stats.pendingReceipts} donation{stats.pendingReceipts === 1 ? '' : 's'} in {year} still waiting for a receipt →
            </button>
          )}
          {needsBackup && (
            <button className="alert info" style={{ border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => goTo('settings')}>
              {settings.lastBackupAt ? 'No backup in over 30 days.' : 'You haven’t made a backup yet.'} Export one from Settings →
            </button>
          )}
        </div>
      )}

      {stats.ds.length === 0 ? (
        <div className="card empty">No donations recorded for {year} yet.</div>
      ) : (
        <>
          <div className="card stack">
            <h2>By month</h2>
            <div className="months">
              {stats.months.map((v, i) => {
                const future = year === thisYear && i > new Date().getMonth()
                return (
                  <div className="col" key={i} title={`${MONTHS[i]}: ${formatINR(v)}`}>
                    <div className={`bar ${v ? '' : 'zero'} ${future ? 'future' : ''}`} style={{ height: `${(v / maxMonth) * 100}%` }} />
                    <span className="m">{MONTHS[i][0].toUpperCase()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid-2">
            <div className="card stack" style={{ gap: 4 }}>
              <h2 style={{ marginBottom: 6 }}>By category</h2>
              {CATEGORIES.map((c) => (
                <div className="hbar" key={c}>
                  <span>{c}</span>
                  <div className="track"><div style={{ width: `${(stats.byCat[c] / maxCat) * 100}%` }} /></div>
                  <span className="num small">{formatINR(stats.byCat[c])}</span>
                </div>
              ))}
            </div>

            <div className="card stack" style={{ gap: 4 }}>
              <h2 style={{ marginBottom: 6 }}>By foundation</h2>
              {(showAll ? stats.foundationsRanked : stats.foundationsRanked.slice(0, 6)).map(({ f, total, count }, i) => (
                <div className="hbar" key={f?.id ?? i} title={`${count} donation${count === 1 ? '' : 's'}`}>
                  <span className="row ellipsis" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    {f && <ReliabilityChip value={f.reliability} short />}
                    <span className="ellipsis">{f?.name ?? '(deleted)'}</span>
                  </span>
                  <div className="track"><div style={{ width: `${(total / maxF) * 100}%` }} /></div>
                  <span className="num small">{formatINR(total)}</span>
                </div>
              ))}
              {stats.foundationsRanked.length > 6 && (
                <button className="btn sm ghost" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? 'Show top 6' : `Show all ${stats.foundationsRanked.length}`}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
