import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { live } from '../db'
import { formatDate } from '../lib/dates'
import { commitDraft, hasActivePledge, newDraft, openPledgeFor, validateDraft, type DonationDraft } from '../lib/draft'
import { formatINR } from '../lib/format'
import { CADENCE_LABEL, advance } from '../lib/pledges'
import { parseDonation, resolveFoundation, type ParseResult } from '../lib/parser'
import { useSpeech } from '../lib/useSpeech'
import { CATEGORIES, RELIABILITY_LABEL, type Foundation } from '../types'
import { Icon, ReliabilityChip, Segmented } from './ui'

interface Pending {
  parsed: ParseResult
  draft: DonationDraft
  suggestions: Foundation[]
}

/** Voice / text quick entry with a confirmation card. Anything unclear goes to the full form. */
export function VoiceEntry({ onOpenForm }: { onOpenForm: (draft: DonationDraft, notice?: string) => void }) {
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const pledges = useLiveQuery(live.pledges, []) ?? []
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  const handle = (input: string) => {
    const t = input.trim()
    if (!t) return
    setSaved('')
    setError('')
    const parsed = parseDonation(t)
    const res = parsed.foundationText ? resolveFoundation(parsed.foundationText, foundations, (f) => f.name) : { suggestions: [] }
    const match = res.match?.item
    const draft = newDraft({
      source: 'voice',
      foundation: match ? { id: match.id, name: match.name } : { name: parsed.foundationText ?? '' },
      amount: parsed.amount ? String(parsed.amount) : '',
      date: parsed.date,
      mode: parsed.mode ?? 'UPI',
      note: '',
      recurring: !!parsed.recurrence,
      cadence: parsed.recurrence ?? 'yearly',
      nextDueDate: parsed.reminderDate ?? advance(parsed.date, parsed.recurrence ?? 'yearly'),
    })
    if (parsed.missing.length) {
      const what = parsed.missing.map((m) => (m === 'amount' ? 'the amount' : 'the foundation')).join(' and ')
      onOpenForm(draft, `Couldn't catch ${what} from “${t}”. Please fill it in.`)
      setText('')
      return
    }
    setPending({ parsed, draft, suggestions: res.suggestions.map((s) => s.item) })
    setText('')
  }

  const speech = useSpeech(handle)

  const setDraft = (patch: Partial<DonationDraft>) =>
    setPending((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p))

  const confirm = async () => {
    if (!pending) return
    try {
      await commitDraft(pending.draft, pledges)
      setSaved(`Saved ${formatINR(Number(pending.draft.amount))} to ${pending.draft.foundation.name}.`)
      setPending(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const d = pending?.draft
  const chosen = d && foundations.find((f) => f.id === d.foundation.id)
  const open = d && openPledgeFor(d, pledges)
  const willCreatePledge = d && d.recurring && !open && !hasActivePledge(d, pledges)

  return (
    <div className="card stack">
      <div className="spread">
        <h2>Log a donation</h2>
        <button className="btn sm" onClick={() => onOpenForm(newDraft())}>{Icon.plus} Quick add</button>
      </div>
      <form className="voice" onSubmit={(e) => { e.preventDefault(); handle(text) }}>
        {speech.supported && (
          <button
            type="button"
            className={`mic ${speech.listening ? 'listening' : ''}`}
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={speech.listening ? 'Stop listening' : 'Speak a donation'}
          >
            {speech.listening ? Icon.stop : Icon.mic}
          </button>
        )}
        <input
          className="input grow"
          value={speech.listening ? speech.interim : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={speech.listening ? 'Listening…' : '“I donated 1K to Yukta Charitable Trust yesterday”'}
          readOnly={speech.listening}
          enterKeyHint="go"
        />
        <button type="submit" className="btn primary" disabled={!text.trim() || speech.listening}>Go</button>
      </form>
      {speech.error && <div className="alert warn">{speech.error}</div>}
      {!speech.supported && <div className="tiny muted">Tip: tap the text box and use your keyboard’s 🎤 dictation.</div>}
      {saved && <div className="alert ok">{saved}</div>}

      {pending && d && (
        <div className="card stack" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
          <div className="tiny muted">Heard: “{pending.parsed.raw}”</div>
          <dl className="parsed">
            <dt>Foundation</dt>
            <dd>
              {chosen ? (
                <span className="row" style={{ gap: 6 }}><ReliabilityChip value={chosen.reliability} short />{chosen.name}</span>
              ) : (
                <span>{d.foundation.name} <span className="chip cat">New</span></span>
              )}
            </dd>
            <dt>Amount</dt>
            <dd className="num">{formatINR(Number(d.amount))}</dd>
            <dt>Date</dt>
            <dd>{formatDate(d.date)}{pending.parsed.dateAssumed && <span className="muted small"> (today — not mentioned)</span>}</dd>
            <dt>Mode</dt>
            <dd>{d.mode}{!pending.parsed.mode && <span className="muted small"> (default)</span>}</dd>
            {willCreatePledge && (
              <>
                <dt>Reminder</dt>
                <dd>{CADENCE_LABEL[d.cadence]}, next due {formatDate(d.nextDueDate)}</dd>
              </>
            )}
          </dl>

          {!chosen && pending.suggestions.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="small">Did you mean one of these?</div>
              <div className="row">
                {pending.suggestions.map((f) => (
                  <button key={f.id} className="btn sm" onClick={() => setDraft({ foundation: { id: f.id, name: f.name } })}>
                    <ReliabilityChip value={f.reliability} short /> {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!chosen && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="small">Category for the new foundation:</div>
              <Segmented options={CATEGORIES} value={d.newCategory} onChange={(newCategory) => setDraft({ newCategory })} />
            </div>
          )}
          {chosen?.reliability === 'unreliable' && (
            <div className="alert danger">
              <strong>Marked {RELIABILITY_LABEL.unreliable}.</strong> {chosen.reliabilityReason || 'No reason noted.'}
            </div>
          )}
          {open && (
            <label className="row small">
              <input type="checkbox" checked={d.payPledge} onChange={(e) => setDraft({ payPledge: e.target.checked })} />
              Counts as the {CADENCE_LABEL[open.cadence].toLowerCase()} pledge due {formatDate(open.nextDueDate)}
            </label>
          )}
          {d.recurring && !willCreatePledge && !open && (
            <div className="tiny muted">A recurring reminder already exists for this foundation — not creating another.</div>
          )}
          {error && <div className="alert danger">{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setPending(null)}>Discard</button>
            <button className="btn" onClick={() => { onOpenForm(d); setPending(null) }}>Edit details</button>
            <button className="btn primary" onClick={confirm} disabled={!!validateDraft(d)}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
