import Dexie, { type Table } from 'dexie'
import type { Donation, Foundation, Pledge, Receipt, Settings } from './types'
import { newId } from './lib/format'
import { advance } from './lib/pledges'

class DonationDB extends Dexie {
  foundations!: Table<Foundation, string>
  donations!: Table<Donation, string>
  pledges!: Table<Pledge, string>
  receipts!: Table<Receipt, string>
  settings!: Table<Settings, string>

  constructor() {
    super('donation-tracker')
    this.version(1).stores({
      foundations: 'id, name, deleted, updatedAt',
      donations: 'id, foundationId, date, deleted, updatedAt',
      pledges: 'id, foundationId, nextDueDate, deleted, updatedAt',
      receipts: 'id, donationId, deleted, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new DonationDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  defaultBudget: 120000,
  budgets: {},
  lastBackupAt: 0,
  updatedAt: 0,
}

const stamp = () => ({ updatedAt: Date.now() })

// ---------- reads ----------

export const live = {
  foundations: () => db.foundations.where('deleted').equals(0).sortBy('name'),
  donations: () => db.donations.where('deleted').equals(0).reverse().sortBy('date'),
  pledges: () => db.pledges.where('deleted').equals(0).sortBy('nextDueDate'),
  settings: async () => (await db.settings.get('settings')) ?? DEFAULT_SETTINGS,
}

export function budgetFor(settings: Settings, year: number): number {
  return settings.budgets[String(year)] ?? settings.defaultBudget
}

// ---------- foundations ----------

export type FoundationInput = Omit<Foundation, 'id' | 'updatedAt' | 'deleted'> & { id?: string }

export const emptyFoundation = (name = ''): FoundationInput => ({
  name,
  category: 'Others',
  reliability: 'unrated',
  reliabilityReason: '',
  comments: '',
  pan: '',
  reg80G: '',
  eligibility80G: '',
})

export async function saveFoundation(input: FoundationInput): Promise<Foundation> {
  const record: Foundation = { ...input, name: input.name.trim(), id: input.id ?? newId(), deleted: 0, ...stamp() }
  await db.foundations.put(record)
  return record
}

export async function findFoundationByName(name: string): Promise<Foundation | undefined> {
  const n = name.trim().toLowerCase()
  const all = await db.foundations.where('deleted').equals(0).toArray()
  return all.find((f) => f.name.toLowerCase() === n)
}

/** Returns an error message if the foundation can't be deleted. */
export async function deleteFoundation(id: string): Promise<string | null> {
  const used = await db.donations.where('foundationId').equals(id).filter((d) => !d.deleted).count()
  if (used) return `This foundation has ${used} donation${used === 1 ? '' : 's'}. Delete or move those first.`
  await db.transaction('rw', db.foundations, db.pledges, async () => {
    await db.foundations.update(id, { deleted: 1, ...stamp() })
    const pledges = await db.pledges.where('foundationId').equals(id).toArray()
    for (const p of pledges) await db.pledges.update(p.id, { deleted: 1, ...stamp() })
  })
  return null
}

// ---------- donations ----------

export type DonationInput = Omit<Donation, 'id' | 'updatedAt' | 'deleted'> & { id?: string }

export async function saveDonation(
  input: DonationInput,
  opts: { payPledgeId?: string; newPledge?: Omit<PledgeInput, 'foundationId'> } = {},
): Promise<Donation> {
  return db.transaction('rw', db.donations, db.pledges, async () => {
    let pledgeId = input.pledgeId
    if (opts.payPledgeId) {
      const p = await db.pledges.get(opts.payPledgeId)
      if (p) {
        await db.pledges.update(p.id, { nextDueDate: advance(p.nextDueDate, p.cadence), ...stamp() })
        pledgeId = p.id
      }
    }
    if (opts.newPledge) {
      const p = await savePledge({ ...opts.newPledge, foundationId: input.foundationId })
      pledgeId = p.id
    }
    const record: Donation = { ...input, pledgeId, id: input.id ?? newId(), deleted: 0, ...stamp() }
    await db.donations.put(record)
    return record
  })
}

export async function deleteDonation(id: string): Promise<void> {
  await db.transaction('rw', db.donations, db.receipts, async () => {
    await db.donations.update(id, { deleted: 1, receiptId: '', ...stamp() })
    const receipts = await db.receipts.where('donationId').equals(id).toArray()
    for (const r of receipts) await db.receipts.update(r.id, { deleted: 1, blob: new Blob(), ...stamp() })
  })
}

// ---------- receipts ----------

export async function attachReceipt(donationId: string, file: Blob, fileName: string): Promise<string> {
  const id = newId()
  await db.transaction('rw', db.donations, db.receipts, async () => {
    const old = await db.receipts.where('donationId').equals(donationId).toArray()
    for (const r of old) await db.receipts.update(r.id, { deleted: 1, blob: new Blob(), ...stamp() })
    await db.receipts.put({ id, donationId, fileName, mimeType: file.type, blob: file, deleted: 0, ...stamp() })
    await db.donations.update(donationId, { receiptId: id, receiptStatus: 'received', ...stamp() })
  })
  return id
}

export async function removeReceipt(donationId: string): Promise<void> {
  await db.transaction('rw', db.donations, db.receipts, async () => {
    const old = await db.receipts.where('donationId').equals(donationId).toArray()
    for (const r of old) await db.receipts.update(r.id, { deleted: 1, blob: new Blob(), ...stamp() })
    await db.donations.update(donationId, { receiptId: '', receiptStatus: 'pending', ...stamp() })
  })
}

// ---------- pledges ----------

export type PledgeInput = Omit<Pledge, 'id' | 'updatedAt' | 'deleted'> & { id?: string }

export async function savePledge(input: PledgeInput): Promise<Pledge> {
  const record: Pledge = { ...input, id: input.id ?? newId(), deleted: 0, ...stamp() }
  await db.pledges.put(record)
  return record
}

export async function skipPledge(id: string): Promise<void> {
  const p = await db.pledges.get(id)
  if (p) await db.pledges.update(id, { nextDueDate: advance(p.nextDueDate, p.cadence), ...stamp() })
}

export async function deletePledge(id: string): Promise<void> {
  await db.pledges.update(id, { deleted: 1, ...stamp() })
}

// ---------- settings ----------

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS
  await db.settings.put({ ...current, ...patch, id: 'settings', ...stamp() })
}
