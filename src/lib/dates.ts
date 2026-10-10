// All dates are local calendar dates stored as YYYY-MM-DD strings, so there are no timezone surprises.

export const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now)
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** Adds months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const d = fromISO(iso)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const last = lastDayOfMonth(target.getFullYear(), target.getMonth())
  target.setDate(Math.min(day, last))
  return toISO(target)
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function isValidDate(year: number, monthIndex: number, day: number): boolean {
  return monthIndex >= 0 && monthIndex < 12 && day >= 1 && day <= lastDayOfMonth(year, monthIndex)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromISO(toIso).getTime() - fromISO(fromIso).getTime()) / 86_400_000)
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  return fromISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}
