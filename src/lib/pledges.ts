import type { Cadence, Pledge } from '../types'
import { addDays, addMonths, daysBetween } from './dates'

/** Pledges appear on the Due list this many days before their due date. */
export const DUE_WINDOW_DAYS = 14
/** A donation this many days before a pledge's due date can count as paying it. */
export const EARLY_PAYMENT_DAYS = 45

const CADENCE_MONTHS: Record<Cadence, number> = { monthly: 1, quarterly: 3, yearly: 12 }

export const CADENCE_LABEL: Record<Cadence, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }

export function advance(dateIso: string, cadence: Cadence): string {
  return addMonths(dateIso, CADENCE_MONTHS[cadence])
}

export interface DueItem {
  pledge: Pledge
  status: 'overdue' | 'due'
  /** Negative = days overdue */
  daysLeft: number
}

export function duePledges(pledges: Pledge[], today: string): DueItem[] {
  const horizon = addDays(today, DUE_WINDOW_DAYS)
  return pledges
    .filter((p) => !p.deleted && p.active && p.nextDueDate <= horizon)
    .map((p) => {
      const daysLeft = daysBetween(today, p.nextDueDate)
      return { pledge: p, status: daysLeft < 0 ? ('overdue' as const) : ('due' as const), daysLeft }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/** The open pledge (if any) that a donation to this foundation on this date would pay. */
export function pledgeForDonation(pledges: Pledge[], foundationId: string, donationDate: string): Pledge | undefined {
  return pledges
    .filter(
      (p) =>
        !p.deleted &&
        p.active &&
        p.foundationId === foundationId &&
        donationDate >= addDays(p.nextDueDate, -EARLY_PAYMENT_DAYS),
    )
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0]
}

export function describeDue(item: DueItem): string {
  const d = item.daysLeft
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`
  if (d === 0) return 'Due today'
  return `Due in ${d} day${d === 1 ? '' : 's'}`
}
