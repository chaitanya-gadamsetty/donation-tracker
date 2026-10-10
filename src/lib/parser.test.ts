import { describe, expect, it } from 'vitest'
import { parseDonation, resolveFoundation } from './parser'

const TODAY = '2026-10-10' // a Saturday

describe('parseDonation — your phrasings', () => {
  it('500 today', () => {
    const r = parseDonation('I donated 500 to Child Help Foundation today', TODAY)
    expect(r).toMatchObject({ amount: 500, foundationText: 'Child Help Foundation', date: '2026-10-10', dateAssumed: false, missing: [] })
    expect(r.recurrence).toBeUndefined()
  })

  it('1K yesterday', () => {
    const r = parseDonation('I donated 1K to Yukta Charitable Trust yesterday', TODAY)
    expect(r).toMatchObject({ amount: 1000, foundationText: 'Yukta Charitable Trust', date: '2026-10-09' })
  })

  it('8K on a date, yearly, with explicit reminder', () => {
    const r = parseDonation(
      'I donated 8K to Pragathi Charitable Trust on August 5th, 2026 and this is yearly, so create a reminder for me Next July end 2027.',
      TODAY,
    )
    expect(r).toMatchObject({
      amount: 8000,
      foundationText: 'Pragathi Charitable Trust',
      date: '2026-08-05',
      recurrence: 'yearly',
      reminderDate: '2027-07-31',
      missing: [],
    })
  })
})

describe('parseDonation — amounts', () => {
  const amt = (t: string) => parseDonation(t, TODAY).amount
  it.each([
    ['I donated 5,000 to X', 5000],
    ['donated ₹1,20,000 to X', 120000],
    ['donated 1.5k to X', 1500],
    ['donated 2 lakh to X', 200000],
    ['donated 1L to X', 100000],
    ['donated five thousand to X', 5000],
    ['donated a thousand rupees to X', 1000],
    ['donated one lakh twenty thousand to X', 120000],
    ['donated Rs. 750 to X', 750],
    ['donated 2500 rupees to X', 2500],
  ])('%s', (text, expected) => expect(amt(text)).toBe(expected))
})

describe('parseDonation — dates', () => {
  const date = (t: string) => parseDonation(t, TODAY).date
  it('defaults to today and flags it', () => {
    const r = parseDonation('donated 500 to X', TODAY)
    expect(r.date).toBe(TODAY)
    expect(r.dateAssumed).toBe(true)
  })
  it.each([
    ['donated 500 to X day before yesterday', '2026-10-08'],
    ['donated 500 to X 3 days ago', '2026-10-07'],
    ['donated 500 to X last Sunday', '2026-10-04'],
    ['donated 500 to X last Saturday', '2026-10-03'],
    ['donated 500 to X on 5th August', '2026-08-05'],
    ['donated 500 to X on Dec 25', '2025-12-25'], // no year + future -> last year
    ['donated 500 to X on 5/8/2026', '2026-08-05'], // DD/MM/YYYY
    ['donated 500 to X on the 2nd of March 2026', '2026-03-02'],
  ])('%s', (text, expected) => expect(date(text)).toBe(expected))
})

describe('parseDonation — recurrence, reminders, mode', () => {
  it('monthly with no reminder', () => {
    const r = parseDonation('I donated 1000 to Akshaya Patra today, it is monthly', TODAY)
    expect(r).toMatchObject({ recurrence: 'monthly', foundationText: 'Akshaya Patra', amount: 1000 })
    expect(r.reminderDate).toBeUndefined()
  })
  it('reminder without year goes to the next occurrence', () => {
    const r = parseDonation('donated 8k to X today, yearly, remind me end of July', TODAY)
    expect(r.reminderDate).toBe('2027-07-31')
  })
  it('payment mode', () => {
    const r = parseDonation('I paid 500 via UPI to Child Help Foundation yesterday', TODAY)
    expect(r).toMatchObject({ mode: 'UPI', amount: 500, foundationText: 'Child Help Foundation', date: '2026-10-09' })
  })
  it('foundation without "to"', () => {
    const r = parseDonation('paid Child Help Foundation 500 today', TODAY)
    expect(r).toMatchObject({ amount: 500, foundationText: 'Child Help Foundation' })
  })
  it('lowercase transcript is title-cased', () => {
    expect(parseDonation('donated 500 to yukta charitable trust', TODAY).foundationText).toBe('Yukta Charitable Trust')
  })
  it('reports missing fields', () => {
    expect(parseDonation('donated to Child Help Foundation', TODAY).missing).toEqual(['amount'])
    expect(parseDonation('donated 500 today', TODAY).missing).toEqual(['foundation'])
  })
  it('keeps "to" inside a name', () => {
    expect(parseDonation('donated 500 to Path to Hope yesterday', TODAY).foundationText).toBe('Path to Hope')
  })
})

describe('resolveFoundation', () => {
  const saved = ['Child Help Foundation', 'Yukta Charitable Trust', 'Pragati Charitable Trust', 'Akshaya Patra Foundation']
  const resolve = (t: string) => resolveFoundation(t, saved, (s) => s)

  it.each([
    ['Child Help Foundation', 'Child Help Foundation'],
    ['child help', 'Child Help Foundation'],
    ['Pragathi Charitable Trust', 'Pragati Charitable Trust'],
    ['Yuktha Trust', 'Yukta Charitable Trust'],
    ['Akshaya Patra', 'Akshaya Patra Foundation'],
    ['Child Help Foundation for the school drive', 'Child Help Foundation'],
  ])('%s -> %s', (text, expected) => expect(resolve(text).match?.item).toBe(expected))

  it('unknown name has no match', () => {
    expect(resolve('Goonj').match).toBeUndefined()
  })
  it('similar-but-different name is a suggestion, not an automatic match', () => {
    const r = resolve('Mukta Charitable Trust')
    expect(r.match).toBeUndefined()
    expect(r.suggestions[0]?.item).toBe('Yukta Charitable Trust')
  })
})
