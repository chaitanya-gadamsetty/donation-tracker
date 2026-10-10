import type { SyncFields } from '../types'

/**
 * Record-level merge used by backup import (and later by Google Drive sync):
 * for each id, the version with the newer updatedAt wins. Deletes are tombstones, so they win too
 * when they are newer.
 */
export function mergeRecords<T extends SyncFields>(local: T[], incoming: T[]): { merged: T[]; changed: T[] } {
  const byId = new Map(local.map((r) => [r.id, r]))
  const changed: T[] = []
  for (const r of incoming) {
    const mine = byId.get(r.id)
    if (!mine || r.updatedAt > mine.updatedAt) {
      byId.set(r.id, r)
      changed.push(r)
    }
  }
  return { merged: [...byId.values()], changed }
}
