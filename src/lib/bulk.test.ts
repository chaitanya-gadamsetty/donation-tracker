import { describe, expect, it } from 'vitest'
import { planBulkAdd } from './bulk'

describe('planBulkAdd', () => {
  it('flags exact and likely duplicates, keeps distinct names', () => {
    const rows = planBulkAdd(
      [
        'Save the Children',
        '  child help foundation ',
        '',
        'Ashrita - A Society for Helping to Needy',
        'Ashritha - A Society for Helping to Needy',
        'Yuktha Charitable Trust',
        'Vikas Disabled Charitable Trust',
        'Child Vikas Foundation',
        '1. Nanhi Pari Foundation',
      ].join('\n'),
      ['Child Help Foundation', 'Yukta Charitable Trust'],
    )
    expect(rows.map((r) => [r.name, r.status, r.include])).toEqual([
      ['Save the Children', 'new', true],
      ['child help foundation', 'exists', false],
      ['Ashrita - A Society for Helping to Needy', 'new', true],
      ['Ashritha - A Society for Helping to Needy', 'similar', false],
      ['Yuktha Charitable Trust', 'similar', false],
      ['Vikas Disabled Charitable Trust', 'new', true],
      ['Child Vikas Foundation', 'new', true],
      ['Nanhi Pari Foundation', 'new', true],
    ])
    expect(rows[3].similarTo).toBe('Ashrita - A Society for Helping to Needy')
  })
})
