import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { attachReceipt, db, deleteDonation, emptyFoundation, saveDonation, saveFoundation } from '../db'
import { buildBackupZip, importBackup } from './backup'

const donation = (foundationId: string, amount: number) => ({
  foundationId, amount, date: '2026-10-10', mode: 'UPI' as const, note: '', receiptStatus: 'pending' as const,
  receiptId: '', pledgeId: '', source: 'manual' as const,
})

describe('backup round trip', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('restores donations, foundations, receipts and deletes into an empty device', async () => {
    const f = await saveFoundation({ ...emptyFoundation('Child Help Foundation'), reliability: 'reliable', reliabilityReason: 'on time' })
    const kept = await saveDonation(donation(f.id, 500))
    const removed = await saveDonation(donation(f.id, 999))
    await deleteDonation(removed.id)
    await attachReceipt(kept.id, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'receipt.pdf')

    const zip = await buildBackupZip()
    await Promise.all(db.tables.map((t) => t.clear()))

    const summary = await importBackup(new Blob([zip as Uint8Array<ArrayBuffer>]))
    expect(summary).toMatchObject({ foundations: 1, donations: 2 })

    const live = await db.donations.where('deleted').equals(0).toArray()
    expect(live.map((d) => d.amount)).toEqual([500])
    expect((await db.foundations.get(f.id))?.reliabilityReason).toBe('on time')
    const receipt = await db.receipts.get(live[0].receiptId)
    expect(await receipt?.blob.text()).toBe('%PDF-1.4 test')
  })

  it('does not overwrite newer local edits', async () => {
    const f = await saveFoundation(emptyFoundation('Yukta Charitable Trust'))
    const zip = await buildBackupZip()
    await saveFoundation({ ...f, comments: 'edited after backup' })
    await importBackup(new Blob([zip as Uint8Array<ArrayBuffer>]))
    expect((await db.foundations.get(f.id))?.comments).toBe('edited after backup')
  })

  it('rejects files that are not backups', async () => {
    await expect(importBackup(new Blob(['hello']))).rejects.toThrow(/not a backup/)
  })
})
