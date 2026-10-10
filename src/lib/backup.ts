import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db, saveSettings, DEFAULT_SETTINGS } from '../db'
import type { Donation, Foundation, Pledge, Receipt, Settings } from '../types'
import { RECEIPT_STATUS_LABEL, RELIABILITY_LABEL } from '../types'
import { todayISO } from './dates'
import { mergeRecords } from './merge'
import { extensionFor } from './receipts'

const BACKUP_VERSION = 1

interface BackupData {
  app: 'donation-tracker'
  version: number
  exportedAt: string
  foundations: Foundation[]
  donations: Donation[]
  pledges: Pledge[]
  receipts: Array<Omit<Receipt, 'blob'> & { path: string }>
  settings: Settings
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Full backup: data.json + receipts/ folder, zipped. Includes deletes so a restore merges correctly. */
export async function exportBackup(): Promise<void> {
  const zipped = await buildBackupZip()
  downloadBlob(new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `donations-backup-${todayISO()}.zip`)
  await saveSettings({ lastBackupAt: Date.now() })
}

export async function buildBackupZip(): Promise<Uint8Array> {
  const [foundations, donations, pledges, receipts, settings] = await Promise.all([
    db.foundations.toArray(),
    db.donations.toArray(),
    db.pledges.toArray(),
    db.receipts.toArray(),
    db.settings.get('settings'),
  ])
  const files: Zippable = {}
  const receiptMeta: BackupData['receipts'] = []
  for (const r of receipts) {
    const { blob, ...meta } = r
    const path = r.deleted ? '' : `receipts/${r.id}.${extensionFor(r.mimeType, r.fileName)}`
    if (path) files[path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
    receiptMeta.push({ ...meta, path })
  }
  const data: BackupData = {
    app: 'donation-tracker',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    foundations,
    donations,
    pledges,
    receipts: receiptMeta,
    settings: settings ?? DEFAULT_SETTINGS,
  }
  files['data.json'] = strToU8(JSON.stringify(data, null, 2))
  return zipSync(files)
}

export interface ImportSummary {
  foundations: number
  donations: number
  pledges: number
  receipts: number
}

/** Merges a backup into this device: newer version of each record wins, nothing is blindly overwritten. */
export async function importBackup(file: Blob): Promise<ImportSummary> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('That file is not a backup .zip from this app.')
  }
  if (!entries['data.json']) throw new Error('Backup is missing data.json.')
  const data = JSON.parse(strFromU8(entries['data.json'])) as BackupData
  if (data.app !== 'donation-tracker') throw new Error('That file is not a backup from this app.')

  return db.transaction('rw', [db.foundations, db.donations, db.pledges, db.receipts, db.settings], async () => {
    const f = mergeRecords(await db.foundations.toArray(), data.foundations)
    const d = mergeRecords(await db.donations.toArray(), data.donations)
    const p = mergeRecords(await db.pledges.toArray(), data.pledges)
    const incomingReceipts: Receipt[] = data.receipts.map(({ path, ...meta }) => ({
      ...meta,
      blob: path && entries[path] ? new Blob([entries[path] as Uint8Array<ArrayBuffer>], { type: meta.mimeType }) : new Blob(),
    }))
    const r = mergeRecords(
      (await db.receipts.toArray()),
      incomingReceipts,
    )
    await db.foundations.bulkPut(f.changed)
    await db.donations.bulkPut(d.changed)
    await db.pledges.bulkPut(p.changed)
    await db.receipts.bulkPut(r.changed)
    const local = await db.settings.get('settings')
    if (data.settings && (!local || data.settings.updatedAt > local.updatedAt)) {
      await db.settings.put({ ...data.settings, lastBackupAt: local?.lastBackupAt ?? 0 })
    }
    return { foundations: f.changed.length, donations: d.changed.length, pledges: p.changed.length, receipts: r.changed.length }
  })
}

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCSV(year?: number): Promise<void> {
  const [donations, foundations] = await Promise.all([
    db.donations.where('deleted').equals(0).sortBy('date'),
    db.foundations.toArray(),
  ])
  const byId = new Map(foundations.map((f) => [f.id, f]))
  const header = ['Date', 'Foundation', 'Category', 'Reliability', 'Amount (INR)', 'Payment mode', 'Receipt', 'Note', 'PAN', '80G reg no.', '80G eligibility']
  const rows = donations
    .filter((d) => !year || d.date.startsWith(String(year)))
    .map((d) => {
      const f = byId.get(d.foundationId)
      return [
        d.date, f?.name ?? '(deleted)', f?.category ?? '', f ? RELIABILITY_LABEL[f.reliability] : '', d.amount, d.mode,
        RECEIPT_STATUS_LABEL[d.receiptStatus], d.note, f?.pan ?? '', f?.reg80G ?? '',
        f?.eligibility80G ? (f.eligibility80G === 'none' ? 'Not eligible' : `${f.eligibility80G}%`) : '',
      ]
    })
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `donations-${year ?? 'all'}.csv`)
}
