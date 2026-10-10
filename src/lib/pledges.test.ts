import { describe, expect, it } from 'vitest'
import type { Pledge } from '../types'
import { advance, duePledges, pledgeForDonation } from './pledges'

const pledge = (over: Partial<Pledge>): Pledge => ({
  id: 'p1', foundationId: 'f1', amount: 8000, cadence: 'yearly', nextDueDate: '2027-07-31',
  active: true, note: '', updatedAt: 0, deleted: 0, ...over,
})

describe('advance', () => {
  it('yearly', () => expect(advance('2027-07-31', 'yearly')).toBe('2028-07-31'))
  it('monthly clamps to month end', () => expect(advance('2026-01-31', 'monthly')).toBe('2026-02-28'))
  it('quarterly', () => expect(advance('2026-11-15', 'quarterly')).toBe('2027-02-15'))
})

describe('duePledges', () => {
  const today = '2027-07-20'
  it('includes pledges due within 14 days and overdue ones, soonest first', () => {
    const items = duePledges(
      [
        pledge({ id: 'later', nextDueDate: '2027-08-30' }),
        pledge({ id: 'soon', nextDueDate: '2027-07-31' }),
        pledge({ id: 'late', nextDueDate: '2027-07-10' }),
        pledge({ id: 'paused', nextDueDate: '2027-07-01', active: false }),
        pledge({ id: 'gone', nextDueDate: '2027-07-01', deleted: 1 }),
      ],
      today,
    )
    expect(items.map((i) => [i.pledge.id, i.status, i.daysLeft])).toEqual([
      ['late', 'overdue', -10],
      ['soon', 'due', 11],
    ])
  })
})

describe('pledgeForDonation', () => {
  const ps = [pledge({})]
  it('matches a donation up to 45 days early', () => expect(pledgeForDonation(ps, 'f1', '2027-06-20')?.id).toBe('p1'))
  it('ignores donations long before the due date', () => expect(pledgeForDonation(ps, 'f1', '2027-01-01')).toBeUndefined())
  it('ignores other foundations', () => expect(pledgeForDonation(ps, 'f2', '2027-07-31')).toBeUndefined())
})
