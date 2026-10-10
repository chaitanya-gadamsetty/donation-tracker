import { describe, expect, it } from 'vitest'
import { mergeRecords } from './merge'

type R = { id: string; updatedAt: number; deleted: 0 | 1; v: string }

describe('mergeRecords', () => {
  it('newer wins per record, new records are added, deletes propagate', () => {
    const local: R[] = [
      { id: 'a', updatedAt: 10, deleted: 0, v: 'local-newer' },
      { id: 'b', updatedAt: 10, deleted: 0, v: 'local-older' },
      { id: 'c', updatedAt: 10, deleted: 0, v: 'to-be-deleted' },
    ]
    const incoming: R[] = [
      { id: 'a', updatedAt: 5, deleted: 0, v: 'remote-older' },
      { id: 'b', updatedAt: 20, deleted: 0, v: 'remote-newer' },
      { id: 'c', updatedAt: 30, deleted: 1, v: 'to-be-deleted' },
      { id: 'd', updatedAt: 1, deleted: 0, v: 'remote-only' },
    ]
    const { merged, changed } = mergeRecords(local, incoming)
    const byId = Object.fromEntries(merged.map((r) => [r.id, r]))
    expect(byId.a.v).toBe('local-newer')
    expect(byId.b.v).toBe('remote-newer')
    expect(byId.c.deleted).toBe(1)
    expect(byId.d.v).toBe('remote-only')
    expect(changed.map((r) => r.id)).toEqual(['b', 'c', 'd'])
  })
})
