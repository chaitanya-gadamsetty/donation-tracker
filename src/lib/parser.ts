// Rule-based parser for spoken/typed donation entries, e.g.
//   "I donated 1K to Yukta Charitable Trust yesterday"
//   "I donated 8K to Pragathi Charitable Trust on August 5th, 2026 and this is yearly,
//    so create a reminder for me next July end 2027"
//
// Strategy: clean the text, then find and blank out (replace with spaces) each recognised piece —
// reminder clause, recurrence, payment mode, date, amount. Blanked regions leave runs of 2+ spaces,
// which act as boundaries when extracting the foundation name that follows "to".

import type { Cadence, PaymentMode } from '../types'
import { MONTHS, addDays, fromISO, isValidDate, lastDayOfMonth, toISO, todayISO } from './dates'
import { MATCH_THRESHOLD, bestMatches, type Match } from './fuzzy'

export interface ParseResult {
  raw: string
  amount?: number
  foundationText?: string
  /** YYYY-MM-DD */
  date: string
  /** True when no date was spoken and we defaulted to today. */
  dateAssumed: boolean
  recurrence?: Cadence
  reminderDate?: string
  mode?: PaymentMode
  missing: Array<'amount' | 'foundation'>
}

// ---------- number words ----------

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const MULT: Record<string, number> = {
  hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000,
  crore: 10000000, crores: 10000000,
}
const NUM_WORD = `(?:${[...Object.keys(SMALL), ...Object.keys(MULT)].join('|')})`
const NUM_SEQ = new RegExp(`\\b${NUM_WORD}(?:(?:\\s+|\\s*-\\s*|\\s+and\\s+)${NUM_WORD})*\\b`, 'gi')

function wordsToNumber(seq: string): number | null {
  const words = seq.toLowerCase().split(/[\s-]+/).filter((w) => w && w !== 'and')
  if (!words.some((w) => w in MULT || SMALL[w] >= 10)) return null // leave a lone "one"/"five" alone
  let total = 0
  let current = 0
  for (const w of words) {
    if (w in SMALL) current += SMALL[w]
    else if (w === 'hundred') current = (current || 1) * 100
    else {
      total += (current || 1) * MULT[w]
      current = 0
    }
  }
  return total + current
}

// ---------- dates ----------

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const ORD = '(?:st|nd|rd|th)?'
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function monthIndex(token: string): number {
  const t = token.toLowerCase().slice(0, 3)
  return MONTHS.findIndex((m) => m.startsWith(t))
}

type DateMode = 'past' | 'future'

interface DateHit {
  date: string
  start: number
  end: number
}

/** Resolve a day+month with an optional year. Without a year, pick the nearest past (or future) occurrence. */
function resolveYear(mIdx: number, day: number | 'end' | 'start', year: number | undefined, today: string, mode: DateMode): string | null {
  const t = fromISO(today)
  const build = (y: number) => {
    const d = day === 'end' ? lastDayOfMonth(y, mIdx) : day === 'start' ? 1 : day
    return isValidDate(y, mIdx, d) ? toISO(new Date(y, mIdx, d)) : null
  }
  if (year) return build(year)
  const thisYear = build(t.getFullYear())
  if (!thisYear) return build(t.getFullYear() - 1)
  if (mode === 'past' && thisYear > today) return build(t.getFullYear() - 1)
  if (mode === 'future' && thisYear < today) return build(t.getFullYear() + 1)
  return thisYear
}

function fourDigitYear(y: string | undefined): number | undefined {
  if (!y) return undefined
  const n = Number(y)
  return y.length === 2 ? 2000 + n : n
}

export function findDate(text: string, today: string, mode: DateMode): DateHit | null {
  const lead = '(?:\\b(?:on|dated|by)\\s+)?(?:the\\s+)?'
  const yr = '(?:\\s*,?\\s*(\\d{4}))?'
  const patterns: Array<[RegExp, (m: RegExpExecArray) => string | null]> = [
    [new RegExp(`${lead}\\bday before yesterday\\b`, 'i'), () => addDays(today, -2)],
    [new RegExp(`${lead}\\byesterday\\b`, 'i'), () => addDays(today, -1)],
    [new RegExp(`${lead}\\btoday\\b`, 'i'), () => today],
    [new RegExp(`${lead}\\btomorrow\\b`, 'i'), () => addDays(today, 1)],
    [/\b(\d{1,2})\s+days?\s+ago\b/i, (m) => addDays(today, -Number(m[1]))],
    [
      new RegExp(`${lead}\\b(?:last|this past|previous)\\s+(${WEEKDAYS.join('|')})\\b`, 'i'),
      (m) => {
        const target = WEEKDAYS.indexOf(m[1].toLowerCase())
        let diff = fromISO(today).getDay() - target
        if (diff <= 0) diff += 7
        return addDays(today, -diff)
      },
    ],
    // "July end 2027", "end of July", "next July start"
    [
      new RegExp(`${lead}(?:\\bnext\\s+)?\\b(?:(?:end|start|beginning)\\s+of\\s+${MONTH_RE}|${MONTH_RE}\\s+(end|start|beginning))\\b${yr}`, 'i'),
      (m) => {
        const monthTok = m[1] ?? m[2]
        const which = /end/i.test(m[0]) ? 'end' : 'start'
        return resolveYear(monthIndex(monthTok), which, fourDigitYear(m[4]), today, mode)
      },
    ],
    // "August 5th, 2026", "Aug 5"
    [
      new RegExp(`${lead}\\b${MONTH_RE}\\s+(?:the\\s+)?(\\d{1,2})${ORD}\\b${yr}`, 'i'),
      (m) => resolveYear(monthIndex(m[1]), Number(m[2]), fourDigitYear(m[3]), today, mode),
    ],
    // "5th August 2026", "5 of Aug"
    [
      new RegExp(`${lead}\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH_RE}\\b${yr}`, 'i'),
      (m) => resolveYear(monthIndex(m[2]), Number(m[1]), fourDigitYear(m[3]), today, mode),
    ],
    // "5/8/2026" — Indian DD/MM/YYYY
    [
      new RegExp(`${lead}\\b(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2}|\\d{4})\\b`, 'i'),
      (m) => resolveYear(Number(m[2]) - 1, Number(m[1]), fourDigitYear(m[3]), today, mode),
    ],
  ]
  for (const [re, resolve] of patterns) {
    const m = re.exec(text)
    if (m) {
      const date = resolve(m)
      if (date) return { date, start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}

// ---------- helpers ----------

function blank(s: string, start: number, end: number): string {
  return s.slice(0, start) + ' '.repeat(end - start) + s.slice(end)
}

function blankMatch(s: string, re: RegExp): [string, RegExpExecArray | null] {
  const m = re.exec(s)
  return m ? [blank(s, m.index, m.index + m[0].length), m] : [s, null]
}

const MODE_MAP: Array<[RegExp, PaymentMode]> = [
  [/upi|g\s?pay|google pay|phone\s?pe|paytm|bhim/i, 'UPI'],
  [/neft|imps|rtgs|bank transfer|net\s?banking|bank/i, 'Bank'],
  [/credit card|debit card|card/i, 'Card'],
  [/cash/i, 'Cash'],
  [/cheque|check/i, 'Cheque'],
]
const MODE_RE = /\b(?:(?:via|through|by|using|with|on|in)\s+)?(upi|g\s?pay|google pay|phone\s?pe|paytm|bhim|neft|imps|rtgs|bank transfer|net\s?banking|credit card|debit card|card|cash|cheque)\b/i

const RECURRENCE_RE = /\b(?:(?:it'?s|it is|this is|this will be|make it|as)\s+(?:a\s+)?)?(monthly|every\s+month|quarterly|every\s+quarter|every\s+three\s+months|yearly|annually|annual|every\s+year)(?:\s+(?:donation|pledge|payment|one))?\b/i

const AMOUNT_RE = /(?:\b(?:rs\.?|inr|rupees)\s*)?\b(\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|cr|crores?)?\b(?:\s*(?:rupees|rs\.?|inr|\/-))?/i

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 }

const TRAILING_STOP = /\s+(?:on|so|and|this|it|is|the|for|via|by|of|with|a|an|which|that|please|as)$/i

function tidyName(s: string): string {
  let name = s.replace(/\s+/g, ' ').trim()
  let prev = ''
  while (prev !== name) {
    prev = name
    name = name.replace(TRAILING_STOP, '').trim()
  }
  if (name && name === name.toLowerCase()) {
    name = name.replace(/\b[a-z]/g, (c) => c.toUpperCase())
  }
  return name
}

// ---------- main ----------

export function parseDonation(input: string, today: string = todayISO()): ParseResult {
  const raw = input
  let s = ' ' + input.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim() + ' '
  s = s.replace(/₹\s*/g, ' rs ')
  s = s.replace(/(\d),(?=\d{2,3}\b)/g, '$1') // 1,20,000 -> 120000
  s = s.replace(/\ban?\s+(hundred|thousand|lakh)\b/gi, 'one $1')
  s = s.replace(NUM_SEQ, (seq, offset: number, str: string) => {
    // "2 lakh" is handled as digits + unit by AMOUNT_RE; don't turn "lakh" into 100000 here.
    if (/\d\s*$/.test(str.slice(0, offset)) && seq.split(/\s/)[0].toLowerCase() in MULT) return seq
    const n = wordsToNumber(seq)
    return n === null ? seq : String(n)
  })
  s = s.replace(/\s+/g, ' ')

  const result: ParseResult = { raw, date: today, dateAssumed: true, missing: [] }

  // 1. Reminder clause: everything from "(create a) reminder" to the end.
  const remRe = /\b(?:(?:and\s+)?(?:so\s+)?(?:please\s+)?(?:create|set|add|make|put)\s+(?:a\s+|me\s+a\s+)?)?remind(?:er|\s+me)?\b.*$/i
  const rem = remRe.exec(s)
  if (rem) {
    const hit = findDate(rem[0], today, 'future')
    if (hit) result.reminderDate = hit.date
    s = blank(s, rem.index, rem.index + rem[0].length)
  }

  // 2. Recurrence
  let rec: RegExpExecArray | null
  ;[s, rec] = blankMatch(s, RECURRENCE_RE)
  if (rec) {
    const w = rec[1].toLowerCase()
    result.recurrence = /month/.test(w) && !/three/.test(w) ? 'monthly' : /quarter|three/.test(w) ? 'quarterly' : 'yearly'
  }

  // 3. Payment mode
  let mode: RegExpExecArray | null
  ;[s, mode] = blankMatch(s, MODE_RE)
  if (mode) result.mode = MODE_MAP.find(([re]) => re.test(mode![1]))?.[1]

  // 4. Donation date
  const d = findDate(s, today, 'past')
  if (d) {
    result.date = d.date
    result.dateAssumed = false
    s = blank(s, d.start, d.end)
  }

  // 5. Amount
  const a = AMOUNT_RE.exec(s)
  if (a) {
    const unit = a[2]?.toLowerCase()
    result.amount = Math.round(Number(a[1]) * (unit ? UNIT[unit] : 1))
    s = blank(s, a.index, a.index + a[0].length)
  }

  // 6. Foundation: words after "to", up to the next blanked gap or punctuation.
  const to = /\bto\s+(?:the\s+(?=\S))?/i.exec(s)
  let candidate = ''
  if (to) {
    candidate = s.slice(to.index + to[0].length)
  } else {
    const verb = /\b(?:donated|gave|given|paid|donate|give|pay|sent|contributed)\s+/i.exec(s)
    if (verb) candidate = s.slice(verb.index + verb[0].length)
  }
  candidate = candidate.split(/\s{2,}|[,.;!?]/)[0] ?? ''
  const name = tidyName(candidate)
  if (name) result.foundationText = name

  if (!result.amount) result.missing.push('amount')
  if (!result.foundationText) result.missing.push('foundation')
  return result
}

// ---------- foundation resolution ----------

export interface FoundationResolution<T> {
  match?: Match<T>
  suggestions: Match<T>[]
}

/**
 * Match spoken text to a saved foundation. Tries the full phrase and its shorter prefixes, so trailing
 * words ("Child Help Foundation for the school drive") don't prevent a match.
 */
export function resolveFoundation<T>(text: string, items: T[], getName: (t: T) => string): FoundationResolution<T> {
  const words = text.split(' ').filter(Boolean)
  let best: Match<T> | undefined
  for (let n = words.length; n >= 1; n--) {
    const [top] = bestMatches(words.slice(0, n).join(' '), items, getName, 1)
    if (top && (!best || top.score > best.score)) best = top
  }
  const suggestions = bestMatches(text, items, getName, 3)
  if (best && best.score >= MATCH_THRESHOLD) return { match: best, suggestions }
  return { suggestions: best && !suggestions.some((s) => s.item === best!.item) ? [best, ...suggestions].slice(0, 3) : suggestions }
}
