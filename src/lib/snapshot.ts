// A snapshot is the whole database as JSON (receipt files excluded). Backups and Google Drive sync both
// use it, and both merge it the same way: per record, the newer updatedAt wins; deletes are tombstones.

import { db, DEFAULT_SETTINGS } from '../db'
import type { Donation, Foundation, Pledge, Receipt, Settings, SyncFields } from '../types'
import { mergeRecords } from './merge'

export type ReceiptMeta = Omit<Receipt, 'blob'> & { path?: string }

export interface Snapshot {
  app: 'donation-tracker'
  version: number
  exportedAt: string
  foundations: Foundation[]
  donations: Donation[]
  pledges: Pledge[]
  receipts: ReceiptMeta[]
  settings: Settings
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [foundations, donations, pledges, receipts, settings] = await Promise.all([
    db.foundations.toArray(),
    db.donations.toArray(),
    db.pledges.toArray(),
    db.receipts.toArray(),
    db.settings.get('settings'),
  ])
  return {
    app: 'donation-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    foundations,
    donations,
    pledges,
    receipts: receipts.map(({ blob: _blob, ...meta }) => meta),
    settings: settings ?? DEFAULT_SETTINGS,
  }
}

export interface ApplySummary {
  foundations: number
  donations: number
  pledges: number
  receipts: number
  settings: boolean
}

/**
 * Merges a snapshot into this device. `blobFor` supplies receipt file contents when the snapshot carries
 * them (zip backups); otherwise an existing local file for the same receipt is kept.
 */
export async function applySnapshot(data: Snapshot, blobFor: (meta: ReceiptMeta) => Blob | undefined = () => undefined): Promise<ApplySummary> {
  if (data?.app !== 'donation-tracker') throw new Error('That file is not a backup from this app.')
  return db.transaction('rw', [db.foundations, db.donations, db.pledges, db.receipts, db.settings], async () => {
    const f = mergeRecords(await db.foundations.toArray(), data.foundations ?? [])
    const d = mergeRecords(await db.donations.toArray(), data.donations ?? [])
    const p = mergeRecords(await db.pledges.toArray(), data.pledges ?? [])

    const localReceipts = await db.receipts.toArray()
    const localById = new Map(localReceipts.map((r) => [r.id, r]))
    const incoming: Receipt[] = (data.receipts ?? []).map(({ path: _path, ...meta }) => {
      const blob = meta.deleted ? new Blob() : blobFor({ ...meta, path: _path }) ?? localById.get(meta.id)?.blob ?? new Blob()
      return { ...meta, blob }
    })
    const r = mergeRecords(localReceipts, incoming)

    await db.foundations.bulkPut(f.changed)
    await db.donations.bulkPut(d.changed)
    await db.pledges.bulkPut(p.changed)
    await db.receipts.bulkPut(r.changed)

    let settingsChanged = false
    const local = await db.settings.get('settings')
    if (data.settings && (!local || data.settings.updatedAt > local.updatedAt)) {
      // lastBackupAt is about this device's downloads, so it never comes from elsewhere.
      await db.settings.put({ ...data.settings, lastBackupAt: local?.lastBackupAt ?? 0 })
      settingsChanged = true
    }
    return { foundations: f.changed.length, donations: d.changed.length, pledges: p.changed.length, receipts: r.changed.length, settings: settingsChanged }
  })
}

/** True when `local` has something `remote` lacks (a new record or a newer edit). */
export function hasChangesFor(remote: Snapshot | null, local: Snapshot): boolean {
  if (!remote) return true
  const newer = <T extends SyncFields>(r: T[], l: T[]) => mergeRecords(r, l).changed.length > 0
  return (
    newer(remote.foundations ?? [], local.foundations) ||
    newer(remote.donations ?? [], local.donations) ||
    newer(remote.pledges ?? [], local.pledges) ||
    newer((remote.receipts ?? []) as Receipt[], local.receipts as Receipt[]) ||
    (local.settings.updatedAt > (remote.settings?.updatedAt ?? 0))
  )
}
