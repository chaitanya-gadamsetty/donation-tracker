import { MATCH_THRESHOLD, similarity } from './fuzzy'

export interface BulkRow {
  name: string
  /** new = add; exists = same name already saved; similar = looks like a saved or earlier-listed name */
  status: 'new' | 'exists' | 'similar'
  similarTo?: string
  /** Default selection: add new names, skip exact and likely duplicates until the user decides. */
  include: boolean
}

/** Turns a pasted list (one name per line) into rows, flagging exact and likely duplicates. */
export function planBulkAdd(text: string, existingNames: string[]): BulkRow[] {
  const rows: BulkRow[] = []
  const seen: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.replace(/^[\s\-*•\d.)]+/, '').replace(/\s+/g, ' ').trim()
    if (!name) continue
    const lower = name.toLowerCase()
    const exact = [...existingNames, ...seen].find((n) => n.toLowerCase() === lower)
    if (exact) {
      rows.push({ name, status: 'exists', similarTo: exact, include: false })
      continue
    }
    const close = [...existingNames, ...seen]
      .map((n) => ({ n, s: similarity(name, n) }))
      .filter((x) => x.s >= MATCH_THRESHOLD)
      .sort((a, b) => b.s - a.s)[0]
    rows.push(close ? { name, status: 'similar', similarTo: close.n, include: false } : { name, status: 'new', include: true })
    seen.push(name)
  }
  return rows
}
