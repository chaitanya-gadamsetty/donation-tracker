import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { attachReceipt, db, deleteDonation, emptyFoundation, saveDonation, saveFoundation } from '../db'
import type { DriveApi, DriveFile } from './drive'
import { DATA_FILE, fetchReceipt, runSync } from './sync'

/** In-memory stand-in for the Drive app folder. */
function fakeDrive() {
  const files = new Map<string, DriveFile & { body: Blob }>()
  let n = 0
  const api: DriveApi = {
    list: async () => [...files.values()].map(({ body: _b, ...f }) => f),
    readText: async (id) => files.get(id)!.body.text(),
    readBlob: async (id) => files.get(id)!.body,
    create: async (name, body, appProperties) => {
      const f = { id: `f${++n}`, name, appProperties, body }
      files.set(f.id, f)
      return { id: f.id, name }
    },
    update: async (id, body) => { files.get(id)!.body = body },
    copy: async (id, name) => { const src = files.get(id)!; files.set(`f${++n}`, { id: `f${n}`, name, body: src.body }) },
    remove: async (id) => { files.delete(id) },
  }
  return { api, files }
}

const donation = (foundationId: string, amount: number) => ({
  foundationId, amount, date: '2026-10-10', mode: 'UPI' as const, note: '', receiptStatus: 'pending' as const,
  receiptId: '', pledgeId: '', source: 'manual' as const,
})

const wipeDevice = () => Promise.all(db.tables.map((t) => t.clear()))
const amounts = async () => (await db.donations.where('deleted').equals(0).toArray()).map((d) => d.amount).sort((a, b) => a - b)

describe('runSync', () => {
  beforeEach(wipeDevice)

  it('merges two devices through Drive, including deletes and receipts', async () => {
    const { api, files } = fakeDrive()

    // iPhone: one foundation, two donations (one later deleted), one receipt
    const f = await saveFoundation(emptyFoundation('Child Help Foundation'))
    const keep = await saveDonation(donation(f.id, 500))
    const gone = await saveDonation(donation(f.id, 999))
    await attachReceipt(keep.id, new Blob(['receipt-bytes'], { type: 'image/jpeg' }), 'r.jpg')
    const first = await runSync(api, '2026-10-10')
    expect(first).toMatchObject({ pushed: true, receiptsUploaded: 1 })

    // Mac: starts empty, adds its own donation, syncs
    const iphone = await db.tables.reduce(async (acc, t) => ({ ...(await acc), [t.name]: await t.toArray() }), Promise.resolve({} as Record<string, unknown[]>))
    await wipeDevice()
    await saveDonation(donation(f.id, 2000))
    await runSync(api, '2026-10-10')
    expect(await amounts()).toEqual([500, 999, 2000])
    const receiptId = (await db.donations.get(keep.id))!.receiptId
    expect((await db.receipts.get(receiptId))!.blob.size).toBe(0) // file not downloaded until opened
    expect(await (await fetchReceipt(api, receiptId))!.text()).toBe('receipt-bytes')

    // back on iPhone: delete a donation, sync -> Mac's donation arrives, delete goes up
    await wipeDevice()
    for (const t of db.tables) await t.bulkPut(iphone[t.name] as never[])
    await deleteDonation(gone.id)
    await runSync(api, '2026-10-11')
    expect(await amounts()).toEqual([500, 2000])

    // Mac again: sees the delete
    await wipeDevice()
    await runSync(api, '2026-10-11')
    expect(await amounts()).toEqual([500, 2000])

    const names = [...files.values()].map((x) => x.name).sort()
    expect(names).toContain(DATA_FILE)
    expect(names).toContain('donations-data-backup-2026-10-11.json')
  })

  it('does not upload when nothing changed', async () => {
    const { api } = fakeDrive()
    await saveFoundation(emptyFoundation('Yukta Charitable Trust'))
    expect((await runSync(api)).pushed).toBe(true)
    expect((await runSync(api)).pushed).toBe(false)
  })

  it('keeps only the last 7 daily backups', async () => {
    const { api, files } = fakeDrive()
    await saveFoundation(emptyFoundation('A'))
    for (let d = 1; d <= 10; d++) await runSync(api, `2026-10-${String(d).padStart(2, '0')}`)
    const backups = [...files.values()].filter((x) => x.name.startsWith('donations-data-backup-'))
    expect(backups).toHaveLength(7)
  })
})
