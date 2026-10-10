import { attachReceipt, emptyFoundation, findFoundationByName, saveDonation, saveFoundation } from '../db'
import type { Cadence, Category, Donation, PaymentMode, Pledge, ReceiptStatus } from '../types'
import type { FoundationChoice } from '../components/FoundationPicker'
import { todayISO } from './dates'
import { advance, pledgeForDonation } from './pledges'
import { prepareReceipt } from './receipts'

/** Everything the donation form / voice confirmation card edits, before it is saved. */
export interface DonationDraft {
  id?: string
  foundation: FoundationChoice
  /** Category used only when the foundation is new. */
  newCategory: Category
  amount: string
  date: string
  mode: PaymentMode
  note: string
  receiptStatus: ReceiptStatus
  receiptId: string
  pledgeId: string
  source: 'voice' | 'manual'
  /** Mark the open pledge for this foundation as paid. */
  payPledge: boolean
  /** Create a new recurring pledge with this donation. */
  recurring: boolean
  cadence: Cadence
  nextDueDate: string
}

export function newDraft(over: Partial<DonationDraft> = {}): DonationDraft {
  const date = over.date ?? todayISO()
  return {
    foundation: { name: '' },
    newCategory: 'Others',
    amount: '',
    date,
    mode: 'UPI',
    note: '',
    receiptStatus: 'pending',
    receiptId: '',
    pledgeId: '',
    source: 'manual',
    payPledge: true,
    recurring: false,
    cadence: 'yearly',
    nextDueDate: advance(date, 'yearly'),
    ...over,
  }
}

export function draftFromDonation(d: Donation, foundationName: string): DonationDraft {
  return newDraft({
    id: d.id,
    foundation: { id: d.foundationId, name: foundationName },
    amount: String(d.amount),
    date: d.date,
    mode: d.mode,
    note: d.note,
    receiptStatus: d.receiptStatus,
    receiptId: d.receiptId,
    pledgeId: d.pledgeId,
    source: d.source,
  })
}

export function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : NaN
}

export function validateDraft(d: DonationDraft): string | null {
  if (!d.foundation.name.trim()) return 'Choose or add a foundation.'
  const amt = parseAmount(d.amount)
  if (!amt || amt <= 0) return 'Enter an amount greater than zero.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Choose a date.'
  if (d.recurring && !/^\d{4}-\d{2}-\d{2}$/.test(d.nextDueDate)) return 'Choose the next due date for the reminder.'
  return null
}

/** The open pledge a new donation would pay, if any. */
export function openPledgeFor(d: DonationDraft, pledges: Pledge[]): Pledge | undefined {
  if (d.id || !d.foundation.id) return undefined
  return pledgeForDonation(pledges, d.foundation.id, d.date)
}

/** True when the foundation already has an active pledge (so we don't offer to create a second). */
export function hasActivePledge(d: DonationDraft, pledges: Pledge[]): boolean {
  return !!d.foundation.id && pledges.some((p) => p.active && !p.deleted && p.foundationId === d.foundation.id)
}

export async function commitDraft(d: DonationDraft, pledges: Pledge[], receiptFile?: File | null): Promise<Donation> {
  const err = validateDraft(d)
  if (err) throw new Error(err)

  let foundationId = d.foundation.id
  if (!foundationId) {
    const existing = await findFoundationByName(d.foundation.name)
    foundationId = existing?.id ?? (await saveFoundation({ ...emptyFoundation(d.foundation.name), category: d.newCategory })).id
  }

  const resolved = { ...d, foundation: { ...d.foundation, id: foundationId } }
  const open = openPledgeFor(resolved, pledges)
  const amount = parseAmount(d.amount)
  const createPledge = !d.id && d.recurring && !hasActivePledge(resolved, pledges)

  const donation = await saveDonation(
    {
      id: d.id,
      foundationId,
      amount,
      date: d.date,
      mode: d.mode,
      note: d.note.trim(),
      receiptStatus: d.receiptStatus,
      receiptId: d.receiptId,
      pledgeId: d.pledgeId,
      source: d.source,
    },
    {
      payPledgeId: open && d.payPledge ? open.id : undefined,
      newPledge: createPledge
        ? { amount, cadence: d.cadence, nextDueDate: d.nextDueDate, active: true, note: '' }
        : undefined,
    },
  )

  if (receiptFile) {
    const { blob, fileName } = await prepareReceipt(receiptFile)
    await attachReceipt(donation.id, blob, fileName)
  }
  return donation
}
