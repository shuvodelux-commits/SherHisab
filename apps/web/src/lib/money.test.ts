import { describe, expect, it } from 'vitest'
import { formatPaisaToTaka, parseTakaToPaisa } from './money'

describe('money helpers', () => {
  it('parses taka exactly into paisa', () => {
    expect(parseTakaToPaisa('12')).toBe('1200')
    expect(parseTakaToPaisa('12.5')).toBe('1250')
    expect(parseTakaToPaisa('12.50')).toBe('1250')
    expect(parseTakaToPaisa('0.01')).toBe('1')
  })

  it('rejects invalid or over-precise money', () => {
    expect(() => parseTakaToPaisa('-1')).toThrow()
    expect(() => parseTakaToPaisa('12.345')).toThrow()
    expect(() => parseTakaToPaisa('abc')).toThrow()
  })

  it('formats paisa without floating point', () => {
    expect(formatPaisaToTaka('1250')).toBe('12.50')
    expect(formatPaisaToTaka('1')).toBe('0.01')
    expect(formatPaisaToTaka('0')).toBe('0.00')
  })
})
