import type { Foundation, Pledge } from '../types'
import { formatDate } from '../lib/dates'
import { formatINR } from '../lib/format'
import { CADENCE_LABEL, describeDue, duePledges } from '../lib/pledges'
import { FoundationLabel } from './ui'

export function DueList({ pledges, foundations, today, onPay, onSkip }: {
  pledges: Pledge[]
  foundations: Map<string, Foundation>
  today: string
  onPay: (p: Pledge) => void
  onSkip: (p: Pledge) => void
}) {
  const items = duePledges(pledges, today)
  if (!items.length) return null
  return (
    <div className="card stack" style={{ borderColor: items.some((i) => i.status === 'overdue') ? 'var(--warn)' : undefined }}>
      <h2>Due pledges</h2>
      <div className="list">
        {items.map((item) => {
          const p = item.pledge
          return (
            <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="grow stack" style={{ gap: 2 }}>
                <FoundationLabel f={foundations.get(p.foundationId)} />
                <span className="small muted">
                  {formatINR(p.amount)} · {CADENCE_LABEL[p.cadence]} · {formatDate(p.nextDueDate)} ·{' '}
                  <span style={{ color: item.status === 'overdue' ? 'var(--warn)' : undefined, fontWeight: 600 }}>{describeDue(item)}</span>
                </span>
              </div>
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <button className="btn sm ghost" onClick={() => onSkip(p)}>Skip</button>
                <button className="btn sm primary" onClick={() => onPay(p)}>Log payment</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
