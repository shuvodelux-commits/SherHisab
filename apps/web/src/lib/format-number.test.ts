import { describe, expect, it } from 'vitest'
import { formatNumber } from './format-number'

describe('formatNumber', () => {
  it('removes unnecessary trailing decimal zeros', () => {
    expect(formatNumber(2.0)).toBe('2')
    expect(formatNumber('2.500')).toBe('2.5')
    expect(formatNumber('5000.00')).toBe('5,000')
  })

  it('preserves useful decimal precision', () => {
    expect(formatNumber('1234.5678')).toBe('1,234.5678')
  })

  it('can disable grouping', () => {
    expect(formatNumber('5000.00', { useGrouping: false })).toBe('5000')
  })
})
