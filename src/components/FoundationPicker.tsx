import { useMemo, useState } from 'react'
import type { Foundation } from '../types'
import { normalize, similarity } from '../lib/fuzzy'
import { ReliabilityChip } from './ui'

export interface FoundationChoice {
  /** Set when an existing foundation is chosen; undefined means "create new with this name". */
  id?: string
  name: string
}

/** Searchable dropdown of saved foundations that also accepts a new name. */
export function FoundationPicker({ foundations, value, onChange, autoFocus }: {
  foundations: Foundation[]
  value: FoundationChoice
  onChange: (v: FoundationChoice) => void
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hl, setHl] = useState(0)
  const q = value.name.trim()

  const options = useMemo(() => {
    if (!q) return foundations
    const nq = normalize(q)
    return foundations
      .map((f) => ({ f, s: normalize(f.name).includes(nq) ? 2 : similarity(q, f.name) }))
      .filter((x) => x.s >= 0.6)
      .sort((a, b) => b.s - a.s || a.f.name.localeCompare(b.f.name))
      .map((x) => x.f)
  }, [foundations, q])

  const exact = foundations.find((f) => f.name.toLowerCase() === q.toLowerCase())
  const showAdd = !!q && !exact
  const total = options.length + (showAdd ? 1 : 0)

  const pick = (f: Foundation) => {
    onChange({ id: f.id, name: f.name })
    setOpen(false)
  }
  const pickNew = () => {
    onChange({ name: q })
    setOpen(false)
  }

  return (
    <div className="combo">
      <input
        className="input"
        value={value.name}
        placeholder="Search or add a foundation"
        autoFocus={autoFocus}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          const name = e.target.value
          const match = foundations.find((f) => f.name.toLowerCase() === name.trim().toLowerCase())
          onChange({ id: match?.id, name })
          setOpen(true)
          setHl(0)
        }}
        onKeyDown={(e) => {
          if (!open || !total) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => (h + 1) % total) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => (h - 1 + total) % total) }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (hl < options.length) pick(options[hl])
            else pickNew()
          }
        }}
      />
      {open && total > 0 && (
        <div className="combo-list" role="listbox">
          {options.map((f, i) => (
            <button type="button" key={f.id} className={i === hl ? 'hl' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(f)}>
              <ReliabilityChip value={f.reliability} short />
              <span className="grow ellipsis">{f.name}</span>
              <span className="tiny muted">{f.category}</span>
            </button>
          ))}
          {showAdd && (
            <button type="button" className={`add ${hl === options.length ? 'hl' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={pickNew}>
              + Add “{q}” as a new foundation
            </button>
          )}
        </div>
      )}
    </div>
  )
}
