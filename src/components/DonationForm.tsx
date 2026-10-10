import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, deleteDonation, live, removeReceipt } from '../db'
import { CADENCE_LABEL, advance } from '../lib/pledges'
import { formatDate } from '../lib/dates'
import { formatINR } from '../lib/format'
import { commitDraft, hasActivePledge, openPledgeFor, type DonationDraft } from '../lib/draft'
import { CADENCES, CATEGORIES, PAYMENT_MODES, RECEIPT_STATUSES, RELIABILITY_LABEL } from '../types'
import { FoundationPicker } from './FoundationPicker'
import { Icon, Modal, Segmented } from './ui'

export async function openReceipt(receiptId: string) {
  const r = await db.receipts.get(receiptId)
  if (!r || r.deleted || !r.blob.size) {
    alert('Receipt file not found on this device.')
    return
  }
  const url = URL.createObjectURL(r.blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function DonationForm({ initial, notice, onClose, onSaved }: {
  initial: DonationDraft
  /** Shown at the top, e.g. when a voice entry was unclear. */
  notice?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const pledges = useLiveQuery(live.pledges, []) ?? []
  const [d, setD] = useState<DonationDraft>(initial)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<DonationDraft>) => setD((cur) => ({ ...cur, ...patch }))

  const editing = !!d.id
  const chosen = foundations.find((f) => f.id === d.foundation.id)
  const isNew = !!d.foundation.name.trim() && !chosen
  const open = openPledgeFor(d, pledges)
  const canCreatePledge = !editing && !open && !hasActivePledge(d, pledges)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await commitDraft(d, pledges, file)
      onSaved?.()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!d.id || !confirm('Delete this donation?')) return
    await deleteDonation(d.id)
    onClose()
  }

  return (
    <Modal title={editing ? 'Edit donation' : 'Add donation'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        {notice && <div className="alert warn">{notice}</div>}
        <label className="field">
          Foundation
          <FoundationPicker foundations={foundations} value={d.foundation} onChange={(foundation) => set({ foundation })} autoFocus={!editing && !d.foundation.name} />
        </label>
        {chosen?.reliability === 'unreliable' && (
          <div className="alert danger">
            <strong>Marked {RELIABILITY_LABEL.unreliable}.</strong> {chosen.reliabilityReason || 'No reason noted.'}
          </div>
        )}
        {isNew && (
          <div className="card stack" style={{ padding: 12 }}>
            <div className="small">New foundation <strong>“{d.foundation.name.trim()}”</strong> will be created. Category:</div>
            <Segmented options={CATEGORIES} value={d.newCategory} onChange={(newCategory) => set({ newCategory })} />
            <div className="tiny muted">Add reliability, comments and 80G details later from Foundations.</div>
          </div>
        )}

        <div className="grid-2">
          <label className="field">
            Amount (₹)
            <input className="input num" inputMode="numeric" autoFocus={!editing && !!d.foundation.name && !d.amount} value={d.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="e.g. 5000" />
          </label>
          <label className="field">
            Date
            <input
              className="input"
              type="date"
              value={d.date}
              onChange={(e) => set({ date: e.target.value, nextDueDate: d.recurring ? d.nextDueDate : advance(e.target.value || d.date, d.cadence) })}
            />
          </label>
        </div>

        <label className="field">
          Payment mode
          <Segmented options={PAYMENT_MODES} value={d.mode} onChange={(mode) => set({ mode })} />
        </label>

        {open && (
          <label className="row small" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={d.payPledge} onChange={(e) => set({ payPledge: e.target.checked })} />
            <span>
              Count this as the {CADENCE_LABEL[open.cadence].toLowerCase()} pledge of {formatINR(open.amount)} due {formatDate(open.nextDueDate)}.
              <span className="muted"> Next reminder moves to {formatDate(advance(open.nextDueDate, open.cadence))}.</span>
            </span>
          </label>
        )}

        {canCreatePledge && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="row small">
              <input type="checkbox" checked={d.recurring} onChange={(e) => set({ recurring: e.target.checked })} />
              This is recurring — remind me next time
            </label>
            {d.recurring && (
              <div className="grid-2">
                <label className="field">
                  Repeats
                  <Segmented
                    options={CADENCES}
                    labels={CADENCE_LABEL}
                    value={d.cadence}
                    onChange={(cadence) => set({ cadence, nextDueDate: advance(d.date, cadence) })}
                  />
                </label>
                <label className="field">
                  Next due date
                  <input className="input" type="date" value={d.nextDueDate} onChange={(e) => set({ nextDueDate: e.target.value })} />
                </label>
              </div>
            )}
          </div>
        )}

        <label className="field">
          Receipt
          <Segmented options={RECEIPT_STATUSES} labels={{ pending: 'Pending', received: 'Received', na: 'Not needed' }} value={d.receiptStatus} onChange={(receiptStatus) => set({ receiptStatus })} />
        </label>
        <div className="row">
          {d.receiptId && !file ? (
            <>
              <button type="button" className="btn sm" onClick={() => openReceipt(d.receiptId)}>{Icon.paperclip} View receipt</button>
              <button
                type="button"
                className="btn sm danger"
                onClick={async () => {
                  if (d.id && confirm('Remove the attached receipt?')) {
                    await removeReceipt(d.id)
                    set({ receiptId: '', receiptStatus: 'pending' })
                  }
                }}
              >
                Remove
              </button>
            </>
          ) : (
            <label className="btn sm">
              {Icon.paperclip} {file ? file.name : 'Attach photo or PDF'}
              <input
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  if (f) set({ receiptStatus: 'received' })
                }}
              />
            </label>
          )}
          {file && <button type="button" className="btn sm ghost" onClick={() => setFile(null)}>Clear</button>}
        </div>

        <label className="field">
          Note (optional)
          <textarea className="input" value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. for school kit drive" />
        </label>

        {error && <div className="alert danger">{error}</div>}

        <div className="spread">
          {editing ? <button type="button" className="btn danger" onClick={remove}>Delete</button> : <span />}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
