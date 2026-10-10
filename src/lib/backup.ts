import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db, saveSettings } from '../db'
import { RECEIPT_STATUS_LABEL, RELIABILITY_LABEL } from '../types'
import { todayISO } from './dates'
import { extensionFor } from './receipts'
import { applySnapshot, buildSnapshot, type ApplySummary, type Snapshot } from './snapshot'

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
  const snapshot = await buildSnapshot()
  const blobs = new Map((await db.receipts.toArray()).map((r) => [r.id, r.blob]))
  const files: Zippable = {}
  for (const meta of snapshot.receipts) {
    const blob = blobs.get(meta.id)
    if (meta.deleted || !blob?.size) continue
    meta.path = `receipts/${meta.id}.${extensionFor(meta.mimeType, meta.fileName)}`
    files[meta.path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  files['data.json'] = strToU8(JSON.stringify(snapshot, null, 2))
  return zipSync(files)
}

export type ImportSummary = ApplySummary

/** Merges a backup into this device: newer version of each record wins, nothing is blindly overwritten. */
export async function importBackup(file: Blob): Promise<ImportSummary> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('That file is not a backup .zip from this app.')
  }
  if (!entries['data.json']) throw new Error('Backup is missing data.json.')
  const data = JSON.parse(strFromU8(entries['data.json'])) as Snapshot
  return applySnapshot(data, (meta) =>
    meta.path && entries[meta.path] ? new Blob([entries[meta.path] as Uint8Array<ArrayBuffer>], { type: meta.mimeType }) : undefined,
  )
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
