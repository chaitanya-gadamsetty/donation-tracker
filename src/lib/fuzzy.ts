// Fuzzy matching of spoken/typed foundation names against saved ones.
// Speech-to-text often varies spelling ("Pragathi" vs "Pragati") or drops generic words ("Trust").

const GENERIC_WORDS = new Set([
  'the', 'foundation', 'trust', 'charitable', 'charity', 'society', 'ngo', 'org',
  'organisation', 'organization', 'india', 'mission', 'fund', 'seva', 'samithi', 'samiti',
])

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Phonetic-ish folding for common Indian-English transliteration variants. */
function fold(s: string): string {
  return s
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/bh/g, 'b')
    .replace(/kh/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/sh/g, 's')
    .replace(/w/g, 'v')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/(.)\1+/g, '$1')
}

function core(s: string): string {
  return normalize(s)
    .split(' ')
    .filter((w) => w && !GENERIC_WORDS.has(w))
    .join(' ')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

function ratio(a: string, b: string): number {
  if (!a || !b) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

/** 0..1 similarity between two foundation names. */
export function similarity(spoken: string, saved: string): number {
  const a = normalize(spoken)
  const b = normalize(saved)
  if (!a || !b) return 0
  if (a === b) return 1
  const ca = core(spoken)
  const cb = core(saved)
  // Compare the distinctive words only, so shared generic words ("Charitable Trust") don't make
  // "Mukta Charitable Trust" look like "Yukta Charitable Trust".
  if (ca && cb) {
    // "Child Help" vs "Child Help Foundation" -> same core words
    if (fold(ca) === fold(cb)) return 0.97
    return Math.max(ratio(ca, cb), ratio(fold(ca), fold(cb)))
  }
  return Math.max(ratio(a, b), ratio(fold(a), fold(b)))
}

export interface Match<T> {
  item: T
  score: number
}

export const MATCH_THRESHOLD = 0.82
export const SUGGEST_THRESHOLD = 0.6

export function bestMatches<T>(query: string, items: T[], getName: (t: T) => string, limit = 3): Match<T>[] {
  return items
    .map((item) => ({ item, score: similarity(query, getName(item)) }))
    .filter((m) => m.score >= SUGGEST_THRESHOLD)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
}
