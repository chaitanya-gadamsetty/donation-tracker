import { useEffect, type ReactNode } from 'react'
import type { Category, Foundation, Reliability } from '../types'
import { RELIABILITY_LABEL } from '../types'

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)

export const Icon = {
  home: svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>),
  list: svg(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>),
  building: svg(<><path d="M4 21V5l8-3 8 3v16" /><path d="M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01" /></>),
  repeat: svg(<><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>),
  gear: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  mic: svg(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" /></>),
  stop: svg(<rect x="6" y="6" width="12" height="12" rx="2" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  close: svg(<path d="M18 6 6 18M6 6l12 12" />),
  heart: svg(<path d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 1 1 7.5-6.6 5 5 0 1 1 7.5 6.6z" />),
  paperclip: svg(<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />),
  chevL: svg(<path d="m15 18-6-6 6-6" />),
  chevR: svg(<path d="m9 18 6-6-6-6" />),
}

export function ReliabilityChip({ value, short }: { value: Reliability; short?: boolean }) {
  return (
    <span className={`chip rel-${value} ${short ? "short" : ""}`} title={RELIABILITY_LABEL[value]}>
      <span className="dot" />
      {!short && RELIABILITY_LABEL[value]}
    </span>
  )
}

export function CategoryChip({ value }: { value: Category }) {
  return <span className="chip cat">{value}</span>
}

export function FoundationLabel({ f }: { f?: Foundation }) {
  if (!f) return <span className="muted">(deleted foundation)</span>
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
      <ReliabilityChip value={f.reliability} short />
      <span className="ellipsis">{f.name}</span>
    </span>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            {Icon.close}
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, labels }: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labels?: Partial<Record<T, string>>
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o} className={o === value ? 'on' : ''} role="radio" aria-checked={o === value} onClick={() => onChange(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}
