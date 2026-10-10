import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db, deleteFoundation, emptyFoundation, live, saveFoundation, type FoundationInput } from '../db'
import { CategoryChip, Icon, Modal, ReliabilityChip, Segmented } from '../components/ui'
import { yearOf } from '../lib/dates'
import { formatINR, newId } from '../lib/format'
import { normalize } from '../lib/fuzzy'
import { planBulkAdd, type BulkRow } from '../lib/bulk'
import { CATEGORIES, RELIABILITY, RELIABILITY_LABEL, type Category, type Eligibility80G, type Foundation, type Reliability } from '../types'

export function Foundations() {
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const donations = useLiveQuery(live.donations, []) ?? []
  const [q, setQ] = useState('')
  const [rel, setRel] = useState<Reliability | ''>('')
  const [editing, setEditing] = useState<FoundationInput | null>(null)
  const [bulk, setBulk] = useState(false)
  const thisYear = new Date().getFullYear()

  const totals = useMemo(() => {
    const m = new Map<string, { year: number; all: number; count: number }>()
    for (const d of donations) {
      const t = m.get(d.foundationId) ?? { year: 0, all: 0, count: 0 }
      t.all += d.amount
      t.count++
      if (yearOf(d.date) === thisYear) t.year += d.amount
      m.set(d.foundationId, t)
    }
    return m
  }, [donations, thisYear])

  const list = foundations.filter((f) => (!rel || f.reliability === rel) && (!q || normalize(f.name).includes(normalize(q))))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Foundations</h1>
        <div className="row">
          <button className="btn" onClick={() => setBulk(true)}>Add many</button>
          <button className="btn primary" onClick={() => setEditing(emptyFoundation())}>{Icon.plus} Add</button>
        </div>
      </div>
      <input className="input" type="search" placeholder="Search foundations" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row">
        <button className={`btn sm ${rel === '' ? 'primary' : ''}`} onClick={() => setRel('')}>All ({foundations.length})</button>
        {RELIABILITY.map((r) => {
          const n = foundations.filter((f) => f.reliability === r).length
          return (
            <button key={r} className={`btn sm ${rel === r ? 'primary' : ''}`} onClick={() => setRel(rel === r ? '' : r)}>
              <ReliabilityChip value={r} short /> {RELIABILITY_LABEL[r]} ({n})
            </button>
          )
        })}
      </div>

      <div className="card" style={{ padding: '4px 12px' }}>
        {list.length === 0 && (
          <div className="empty">{foundations.length ? 'No foundations match.' : 'No foundations yet. They are added automatically when you log a donation, or add one here.'}</div>
        )}
        <div className="list">
          {list.map((f) => {
            const t = totals.get(f.id)
            return (
              <button key={f.id} className="list-item" onClick={() => setEditing(f)}>
                <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <strong className="ellipsis">{f.name}</strong>
                    <CategoryChip value={f.category} />
                    <ReliabilityChip value={f.reliability} />
                  </span>
                  {(f.reliabilityReason || f.comments) && (
                    <span className="tiny muted ellipsis">{[f.reliabilityReason, f.comments].filter(Boolean).join(' · ')}</span>
                  )}
                </div>
                <div className="stack" style={{ gap: 0, alignItems: 'flex-end' }}>
                  <span className="num" style={{ fontWeight: 600 }}>{formatINR(t?.year ?? 0)}</span>
                  <span className="tiny muted">{thisYear} · {t?.count ?? 0} total</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      {editing && <FoundationForm initial={editing} onClose={() => setEditing(null)} />}
      {bulk && <BulkAdd existing={foundations.map((f) => f.name)} onClose={() => setBulk(false)} />}
    </div>
  )
}

function FoundationForm({ initial, onClose }: { initial: FoundationInput | Foundation; onClose: () => void }) {
  const [f, setF] = useState<FoundationInput>(initial)
  const [error, setError] = useState('')
  const [showTax, setShowTax] = useState(!!(initial.pan || initial.reg80G || initial.eligibility80G))
  const foundations = useLiveQuery(live.foundations, []) ?? []
  const set = (patch: Partial<FoundationInput>) => setF((cur) => ({ ...cur, ...patch }))

  const save = async () => {
    const name = f.name.trim()
    if (!name) return setError('Enter a name.')
    if (foundations.some((x) => x.id !== f.id && x.name.toLowerCase() === name.toLowerCase())) return setError('A foundation with this name already exists.')
    if (f.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(f.pan)) return setError('PAN should look like AAATC1234X (or leave it blank).')
    await saveFoundation(f)
    onClose()
  }

  const remove = async () => {
    if (!f.id || !confirm(`Delete ${f.name}? Its recurring reminders are deleted too.`)) return
    const err = await deleteFoundation(f.id)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Modal title={f.id ? 'Edit foundation' : 'Add foundation'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="field">
          Name
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!f.id} />
        </label>
        <label className="field">
          Category
          <Segmented options={CATEGORIES} value={f.category} onChange={(category) => set({ category })} />
        </label>
        <div className="field">
          Reliability
          <div className="row">
            {RELIABILITY.map((r) => (
              <button
                type="button"
                key={r}
                className="btn sm"
                style={f.reliability === r ? { outline: '2px solid var(--accent)', outlineOffset: -1 } : undefined}
                onClick={() => set({ reliability: r })}
                aria-pressed={f.reliability === r}
              >
                <ReliabilityChip value={r} />
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          Why? (optional)
          <textarea className="input" value={f.reliabilityReason} onChange={(e) => set({ reliabilityReason: e.target.value })} placeholder="e.g. Sends 80G receipts promptly; visited their school in 2025" />
        </label>
        <label className="field">
          Comments (optional)
          <textarea className="input" value={f.comments} onChange={(e) => set({ comments: e.target.value })} placeholder="Contact person, bank details, how you heard of them…" />
        </label>

        <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowTax((s) => !s)}>
          {showTax ? '− Hide' : '+ Add'} tax details (80G)
        </button>
        {showTax && (
          <div className="card stack" style={{ padding: 12 }}>
            <div className="grid-2">
              <label className="field">
                PAN of foundation
                <input className="input" value={f.pan} onChange={(e) => set({ pan: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="AAATC1234X" maxLength={10} />
              </label>
              <label className="field">
                80G registration no.
                <input className="input" value={f.reg80G} onChange={(e) => set({ reg80G: e.target.value })} />
              </label>
            </div>
            <label className="field">
              80G eligibility
              <Segmented<Eligibility80G>
                options={['', '50', '100', 'none']}
                labels={{ '': 'Unknown', '50': '50%', '100': '100%', none: 'Not eligible' }}
                value={f.eligibility80G}
                onChange={(eligibility80G) => set({ eligibility80G })}
              />
            </label>
            <div className="tiny muted">Not deductible under the new tax regime — kept for your records.</div>
          </div>
        )}

        {error && <div className="alert danger">{error}</div>}
        <div className="spread">
          {f.id ? <button type="button" className="btn danger" onClick={remove}>Delete</button> : <span />}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary">Save</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function BulkAdd({ existing, onClose }: { existing: string[]; onClose: () => void }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<BulkRow[] | null>(null)
  const [category, setCategory] = useState<Category>('Others')
  const [done, setDone] = useState('')
  const selected = rows?.filter((r) => r.include) ?? []

  const add = async () => {
    const now = Date.now()
    await db.foundations.bulkPut(
      selected.map((r, i) => ({ ...emptyFoundation(r.name), category, id: newId(), deleted: 0 as const, updatedAt: now + i })),
    )
    setDone(`Added ${selected.length} foundation${selected.length === 1 ? '' : 's'}.`)
  }

  return (
    <Modal title="Add many foundations" onClose={onClose}>
      {done ? (
        <div className="stack">
          <div className="alert ok">{done} Set each one's category and reliability by tapping it in the list.</div>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      ) : !rows ? (
        <div className="stack">
          <label className="field">
            One foundation per line
            <textarea className="input" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Save the Children\nChild Help Foundation\n…'} autoFocus />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!text.trim()} onClick={() => setRows(planBulkAdd(text, existing))}>Review</button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="small muted">
            {selected.length} of {rows.length} selected. Names already saved, or that look like a duplicate, are unticked. Tick them if they really are different.
          </div>
          <div className="card" style={{ padding: '4px 12px', maxHeight: '45dvh', overflowY: 'auto' }}>
            {rows.map((r, i) => (
              <label key={i} className="list-item" style={{ cursor: 'pointer', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                />
                <span className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                  <span>{r.name}</span>
                  {r.status === 'exists' && <span className="tiny muted">Already saved</span>}
                  {r.status === 'similar' && <span className="tiny" style={{ color: 'var(--warn)' }}>Looks like “{r.similarTo}”</span>}
                </span>
              </label>
            ))}
          </div>
          <label className="field">
            Category for all (change individually later)
            <Segmented options={CATEGORIES} value={category} onChange={setCategory} />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setRows(null)}>Back</button>
            <button className="btn primary" disabled={!selected.length} onClick={add}>Add {selected.length}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
