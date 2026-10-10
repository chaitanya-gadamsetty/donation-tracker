// One sync pass between this device and the hidden Drive app folder:
//   1. download the shared data file and merge it into this device (newer record wins)
//   2. once a day, keep a dated copy of the data file before changing it (last 7 kept)
//   3. upload receipt files Drive doesn't have yet; delete files of deleted receipts
//   4. upload this device's merged data if it has anything Drive lacks
// Every device keeps its full copy, so even if two devices sync at the same moment and one upload
// overwrites the other, the next sync from that device puts its records back.

import { db } from '../db'
import { todayISO } from '../lib/dates'
import { applySnapshot, buildSnapshot, hasChangesFor, type Snapshot } from '../lib/snapshot'
import type { DriveApi } from './drive'

export const DATA_FILE = 'donations-data.json'
const BACKUP_PREFIX = 'donations-data-backup-'
const KEEP_BACKUPS = 7

export interface SyncResult {
  pulled: number
  pushed: boolean
  receiptsUploaded: number
}

export async function runSync(drive: DriveApi, today = todayISO()): Promise<SyncResult> {
  const files = await drive.list()
  const dataFile = files.find((f) => f.name === DATA_FILE)

  // 1. Pull
  let remote: Snapshot | null = null
  let pulled = 0
  if (dataFile) {
    remote = JSON.parse(await drive.readText(dataFile.id)) as Snapshot
    const s = await applySnapshot(remote)
    pulled = s.foundations + s.donations + s.pledges + s.receipts + (s.settings ? 1 : 0)
  }

  // 2. Daily safety copy of the shared file
  if (dataFile) {
    const backups = files.filter((f) => f.name.startsWith(BACKUP_PREFIX)).sort((a, b) => a.name.localeCompare(b.name))
    if (!backups.some((f) => f.name === `${BACKUP_PREFIX}${today}.json`)) {
      await drive.copy(dataFile.id, `${BACKUP_PREFIX}${today}.json`)
      backups.push({ id: '', name: `${BACKUP_PREFIX}${today}.json` })
    }
    for (const old of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) {
      if (old.id) await drive.remove(old.id)
    }
  }

  // 3. Receipt files
  let receiptsUploaded = 0
  const remoteIds = new Set(files.map((f) => f.id))
  for (const r of await db.receipts.toArray()) {
    if (!r.deleted && r.blob.size && !r.driveFileId) {
      const file = await drive.create(`receipt-${r.id}`, r.blob, { receiptId: r.id })
      await db.receipts.update(r.id, { driveFileId: file.id, updatedAt: Date.now() })
      receiptsUploaded++
    } else if (r.deleted && r.driveFileId) {
      if (remoteIds.has(r.driveFileId)) await drive.remove(r.driveFileId)
      await db.receipts.update(r.id, { driveFileId: '', updatedAt: Date.now() })
    }
  }

  // 4. Push
  const local = await buildSnapshot()
  const pushed = hasChangesFor(remote, local)
  if (pushed) {
    const body = new Blob([JSON.stringify(local)], { type: 'application/json' })
    if (dataFile) await drive.update(dataFile.id, body)
    else await drive.create(DATA_FILE, body)
  }
  return { pulled, pushed, receiptsUploaded }
}

/** Fetches a receipt file that was attached on another device. */
export async function fetchReceipt(drive: DriveApi, receiptId: string): Promise<Blob | null> {
  const r = await db.receipts.get(receiptId)
  if (!r || r.deleted || !r.driveFileId) return null
  const blob = await drive.readBlob(r.driveFileId)
  const typed = blob.type ? blob : new Blob([blob], { type: r.mimeType })
  // Not a user edit, so updatedAt stays as is.
  await db.receipts.update(receiptId, { blob: typed })
  return typed
}
