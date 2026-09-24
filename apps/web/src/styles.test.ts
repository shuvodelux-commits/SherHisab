import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles.css', 'utf8')

describe('SherHisab UI typography', () => {
  it('uses Geist first with Inter as the Latin fallback', () => {
    expect(styles).toMatch(
      /--font-geist:\s*['"]Geist Variable['"],\s*Inter/,
    )
    expect(styles).toMatch(/:root\s*\{[\s\S]*?font-family:\s*var\(--font-geist\);/)
  })

  it('uses standard shadcn-sized normal text for controls and table values', () => {
    for (const selector of [
      '.ui-input',
      '.ui-select-trigger',
      '.ui-select-item',
      '.ui-dropdown-item',
      '.data-table td',
      '.product-name-cell strong',
      '.product-money,',
    ]) {
      const escaped = selector.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
      expect(styles).toMatch(
        new RegExp(`${escaped}[\\s\\S]*?font-size:\\s*14px;`),
      )
    }

    expect(styles).toMatch(/\.ui-select-trigger[\s\S]*?font-weight:\s*400;/)
    expect(styles).toMatch(/\.ui-select-item[\s\S]*?font-weight:\s*400;/)
    expect(styles).toMatch(/\.ui-dropdown-item[\s\S]*?font-weight:\s*400;/)
    expect(styles).toMatch(/\.product-name-cell strong[\s\S]*?font-weight:\s*400;/)
    expect(styles).toMatch(
      /\.product-money,\s*\n\.product-quantity[\s\S]*?font-weight:\s*400;/,
    )
  })

  it('keeps table headers sharp without making them semibold', () => {
    expect(styles).toMatch(
      /\.data-table th\s*\{[\s\S]*?color:\s*var\(--foreground\);[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*500;/,
    )
    expect(styles).toMatch(
      /\.data-table th \.data-table-sort-button\s*\{[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*500;/,
    )
  })

  it('keeps table sort icons small and visually subtle', () => {
    expect(styles).toMatch(
      /\.data-table-sort-icon\s*\{[\s\S]*?width:\s*12px;[\s\S]*?height:\s*12px;[\s\S]*?opacity:\s*0\.45;/,
    )
  })

  it('keeps every ERP badge consistently compact and rounded', () => {
    expect(styles).toMatch(
      /\.ui-badge\s*\{[\s\S]*?min-height:\s*18px;[\s\S]*?padding:\s*1px 6px;[\s\S]*?border-radius:\s*999px;[\s\S]*?font-size:\s*12px;[\s\S]*?font-weight:\s*500;/,
    )
    expect(styles).not.toMatch(
      /\.stock-lot-status-badge\s*\{[\s\S]*?font-size:/,
    )
  })

  it('keeps Advanced field help controls compact beside their labels', () => {
    expect(styles).toMatch(
      /\.product-variant-label-row\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*flex-start;[\s\S]*?gap:\s*4px;/,
    )
  })

  it('uses one Product-form label hierarchy across basic and Advanced fields', () => {
    expect(styles).toMatch(
      /\.product-field-label\s*\{[\s\S]*?color:\s*var\(--foreground\);[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*500;/,
    )
    expect(styles).toMatch(
      /\.product-field > \.bilingual-label,\s*\n\.product-variant-label-row > \.bilingual-label\s*\{[\s\S]*?color:\s*var\(--foreground\);[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*500;/,
    )
    expect(styles).toMatch(
      /\.bilingual-label-inline\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*baseline;[\s\S]*?column-gap:\s*4px;/,
    )
    expect(styles).toMatch(
      /\.bilingual-label-stacked\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*1px;/,
    )
    expect(styles).toMatch(
      /\.product-advanced-heading strong,\s*\n\.product-check-row strong\s*\{[\s\S]*?color:\s*var\(--foreground\);[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*500;/,
    )
    expect(styles).toMatch(
      /\.product-field-help,[\s\S]*?color:\s*var\(--text-muted\);[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*400;/,
    )
  })
})
