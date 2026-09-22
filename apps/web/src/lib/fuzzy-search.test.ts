import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyMatch } from './fuzzy-search'

describe('fuzzy search', () => {
  it('matches direct text and character subsequences', () => {
    expect(fuzzyMatch('sunflower', 'Sunflower Oil 5L')).toBe(true)
    expect(fuzzyMatch('snfl', 'Sunflower Oil 5L')).toBe(true)
    expect(fuzzyMatch('battery', 'Sunflower Oil 5L')).toBe(false)
  })

  it('filters records using searchable text', () => {
    const products = [
      { name: 'Sunflower Oil 5L', sku: 'OIL-5L' },
      { name: 'Cotton Fabric', sku: 'FAB-01' },
    ]

    expect(
      fuzzyFilter(products, 'snfl', (product) => [
        product.name,
        product.sku,
      ]),
    ).toEqual([products[0]])
  })
})
