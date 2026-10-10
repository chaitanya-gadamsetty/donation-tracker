import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { deletePledge, emptyFoundation, findFoundationByName, live, saveFoundation, savePledge, type PledgeInput } from '../db'
import { FoundationPicker, type FoundationChoice } from '../components/FoundationPicker'
import { FoundationLabel, Icon, Modal, Segmented } from '../components/ui'
import { daysBetween, formatDate, todayISO } from '../lib/dates'
import { parseAmount } from '../lib/draft'
import { formatINR } from '../lib/format'
import { CADENCE_LABEL, advance } from '../lib/pledges'
import { CADENCES, type Pledge } from '../types'

export function Pledges() {
  const pledges = useLiveQuery(live.pledges, []) ?? []
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const fById = useMemo(() => new Map(foundations.map((f) => [f.id, f])), [foundations])
  const [editing, setEditing] = useState<(PledgeInput & { foundationName: string }) | null>(null)
  const today = todayISO()

  const yearlyCommitment = pledges
    .filter((p) => p.active)
    .reduce((s, p) => s + p.amount * (p.cadence === 'monthly' ? 12 : p.cadence === 'quarterly' ? 4 : 1), 0)

  const open = (p?: Pledge) =>
    setEditing(
      p
        ? { ...p, foundationName: fById.get(p.foundationId)?.name ?? '' }
        : { foundationId: '', foundationName: '', amount: 0, cadence: 'yearly', nextDueDate: advance(today, 'yearly'), active: true, note: '' },
    )

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Recurring pledges</h1>
        <button className="btn primary" onClick={() => open()}>{Icon.plus} Add</button>
      </div>
      {pledges.length > 0 && <div className="small muted">Active commitments add up to about <strong className="num">{formatINR(yearlyCommitment)}</strong> a year.</div>}
      <div className="card" style={{ padding: '4px 12px' }}>
        {pledges.length === 0 && (
          <div className="empty">No recurring pledges. Say “…and this is yearly” when logging, or add one here.</div>
        )}
        <div className="list">
          {pledges.map((p) => {
            const days = daysBetween(today, p.nextDueDate)
            return (
              <button key={p.id} className="list-item" onClick={() => open(p)} style={{ opacity: p.active ? 1 : 0.55 }}>
                <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                  <FoundationLabel f={fById.get(p.foundationId)} />
                  <span className="tiny muted">
                    {CADENCE_LABEL[p.cadence]} · next {formatDate(p.nextDueDate)}
                    {p.active ? (days < 0 ? ` · ${-days}d overdue` : '') : ' · paused'}
                  </span>
                </div>
                <span className="num" style={{ fontWeight: 600 }}>{formatINR(p.amount)}</span>
              </button>
            )
          })}
        </div>
      </div>
      {editing && <PledgeForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PledgeForm({ initial, onClose }: { initial: PledgeInput & { foundationName: string }; onClose: () => void }) {
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const [p, setP] = useState(initial)
  const [foundation, setFoundation] = useState<FoundationChoice>({ id: initial.foundationId || undefined, name: initial.foundationName })
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '')
  const [error, setError] = useState('')
  const set = (patch: Partial<PledgeInput>) => setP((cur) => ({ ...cur, ...patch }))

  const save = async () => {
    const amt = parseAmount(amount)
    if (!foundation.name.trim()) return setError('Choose a foundation.')
    if (!amt || amt <= 0) return setError('Enter an amount.')
    if (!p.nextDueDate) return setError('Choose the next due date.')
    let foundationId = foundation.id
    if (!foundationId) {
      foundationId = (await findFoundationByName(foundation.name))?.id ?? (await saveFoundation(emptyFoundation(foundation.name))).id
    }
    const { foundationName: _, ...rest } = p
    await savePledge({ ...rest, foundationId, amount: amt })
    onClose()
  }

  return (
    <Modal title={p.id ? 'Edit pledge' : 'Add pledge'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="field">
          Foundation
          <FoundationPicker foundations={foundations} value={foundation} onChange={setFoundation} />
        </label>
        <div className="grid-2">
          <label className="field">
            Amount (₹)
            <input className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="field">
            Next due date
            <input className="input" type="date" value={p.nextDueDate} onChange={(e) => set({ nextDueDate: e.target.value })} />
          </label>
        </div>
        <label className="field">
          Repeats
          <Segmented options={CADENCES} labels={CADENCE_LABEL} value={p.cadence} onChange={(cadence) => set({ cadence })} />
        </label>
        <label className="field">
          Note (optional)
          <input className="input" value={p.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
        <label className="row small">
          <input type="checkbox" checked={p.active} onChange={(e) => set({ active: e.target.checked })} />
          Active (uncheck to pause reminders)
        </label>
        {error && <div className="alert danger">{error}</div>}
        <div className="spread">
          {p.id ? (
            <button type="button" className="btn danger" onClick={async () => { if (confirm('Delete this pledge?')) { await deletePledge(p.id!); onClose() } }}>Delete</button>
          ) : <span />}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary">Save</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
