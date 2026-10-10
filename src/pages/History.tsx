import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { live } from '../db'
import { FoundationLabel, Icon } from '../components/ui'
import { MONTHS, formatDate, yearOf } from '../lib/dates'
import { draftFromDonation, type DonationDraft } from '../lib/draft'
import { formatINR } from '../lib/format'
import { normalize } from '../lib/fuzzy'
import { CATEGORIES, RECEIPT_STATUSES, RECEIPT_STATUS_LABEL, RELIABILITY, RELIABILITY_LABEL } from '../types'

export function History({ onOpenForm, initialReceipt }: { onOpenForm: (d: DonationDraft) => void; initialReceipt?: string }) {
  const donations = useLiveQuery(live.donations, []) ?? []
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const fById = useMemo(() => new Map(foundations.map((f) => [f.id, f])), [foundations])
  const [q, setQ] = useState('')
  const [year, setYear] = useState<string>(String(new Date().getFullYear()))
  const [cat, setCat] = useState('')
  const [rel, setRel] = useState('')
  const [receipt, setReceipt] = useState(initialReceipt ?? '')

  const years = useMemo(() => [...new Set(donations.map((d) => String(yearOf(d.date))))].sort().reverse(), [donations])

  const filtered = useMemo(() => {
    const nq = normalize(q)
    return donations.filter((d) => {
      const f = fById.get(d.foundationId)
      if (year && !d.date.startsWith(year)) return false
      if (cat && f?.category !== cat) return false
      if (rel && f?.reliability !== rel) return false
      if (receipt && d.receiptStatus !== receipt) return false
      if (nq && !normalize(`${f?.name ?? ''} ${d.note} ${d.amount} ${d.mode}`).includes(nq)) return false
      return true
    })
  }, [donations, fById, q, year, cat, rel, receipt])

  const total = filtered.reduce((s, d) => s + d.amount, 0)
  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>()
    for (const d of filtered) {
      const k = d.date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), d])
    }
    return [...m.entries()]
  }, [filtered])

  const select = (value: string, set: (v: string) => void, all: string, opts: Array<[string, string]>) => (
    <select className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{all}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  return (
    <div className="stack">
      <div className="page-head">
        <h1>History</h1>
        <span className="small muted num">{filtered.length} · {formatINR(total)}</span>
      </div>
      <input className="input" type="search" placeholder="Search foundation, note, amount…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row">
        {select(year, setYear, 'All years', years.map((y) => [y, y]))}
        {select(cat, setCat, 'All categories', CATEGORIES.map((c) => [c, c]))}
        {select(rel, setRel, 'Any reliability', RELIABILITY.map((r) => [r, RELIABILITY_LABEL[r]]))}
        {select(receipt, setReceipt, 'Any receipt status', RECEIPT_STATUSES.map((r) => [r, RECEIPT_STATUS_LABEL[r]]))}
      </div>

      <div className="card" style={{ padding: '4px 12px' }}>
        {groups.length === 0 && <div className="empty">No donations match.</div>}
        {groups.map(([month, ds]) => (
          <div key={month}>
            <div className="month-label spread">
              <span>{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</span>
              <span className="num">{formatINR(ds.reduce((s, d) => s + d.amount, 0))}</span>
            </div>
            <div className="list">
              {ds.map((d) => {
                const f = fById.get(d.foundationId)
                return (
                  <button key={d.id} className="list-item" onClick={() => onOpenForm(draftFromDonation(d, f?.name ?? ''))}>
                    <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                      <FoundationLabel f={f} />
                      <span className="tiny muted ellipsis">
                        {formatDate(d.date)} · {d.mode}
                        {d.note ? ` · ${d.note}` : ''}
                      </span>
                    </div>
                    <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
                      <span className="num" style={{ fontWeight: 600 }}>{formatINR(d.amount)}</span>
                      {d.receiptStatus === 'pending' && <span className="chip pending">Receipt pending</span>}
                      {d.receiptId && <span className="tiny muted row" style={{ gap: 2 }}><span style={{ width: 14, height: 14, display: 'inline-flex' }}>{Icon.paperclip}</span>Receipt</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
