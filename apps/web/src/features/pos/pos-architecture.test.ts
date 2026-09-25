import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  cartReducer,
  type CartLineState,
} from './pos-state'
import { ProductCatalog } from './components/product-catalog'
import { Cart } from './components/cart'
import { CartLine } from './components/cart-line'
import { SerialWarrantyEditor } from './components/serial-warranty-editor'
import { BatchEditor } from './components/batch-editor'

const styles = readFileSync('src/styles.css', 'utf8')
const posPageSource = readFileSync(
  'src/features/pos/pos-page.tsx',
  'utf8',
)

function line(
  variantId: string,
  quantity = '1',
): CartLineState {
  return {
    product: {
      productId: `product-${variantId}`,
      variantId,
      productName: `Product ${variantId}`,
      variantName: null,
      sku: null,
      primaryBarcode: null,
      brand: '',
      categoryName: null,
      unitId: 'unit-1',
      unitName: 'Piece',
      unitSymbol: 'pcs',
      currentSellingPricePaisa: '1000',
      availableOwnBaseQty: '5',
      trackingMode: 'SIMPLE',
      allocationPolicy: 'FIFO',
      variantsEnabled: false,
    },
    quantity,
    quote: {
      variantId,
      baseQty: quantity,
      pricingQty: quantity,
      displayQty: quantity,
      availableOwnBaseQty: '5',
      shortfallBaseQty: '0',
      automaticSalesTotalPaisa: '1000',
      effectiveUnitSellingPricePaisa: '1000',
      sellingSegments: [],
      conversion: {
        baseQty: quantity,
        pricingQty: quantity,
        displayQty: quantity,
        components: {},
        snapshot: null,
      },
    },
    priceInput: '10.00',
    manualUnitSellingPricePaisa: null,
    showBreakdown: false,
    conversionExpanded: false,
    conversionComponents: {},
    shortageResolution: null,
    vendorId: null,
    vendorName: '',
    vendorUnitCostInput: '',
    isQuoting: false,
    error: '',
  }
}

describe('mature POS architecture', () => {
  it('keeps one authoritative cart line per Variant in the reducer', () => {
    const first = cartReducer([], {
      type: 'upsert',
      line: line('variant-1', '1'),
    })
    const updated = cartReducer(first, {
      type: 'upsert',
      line: line('variant-1', '2'),
    })
    const withSecond = cartReducer(updated, {
      type: 'upsert',
      line: line('variant-2', '1'),
    })

    expect(updated).toHaveLength(1)
    expect(updated[0]?.quantity).toBe('2')
    expect(withSecond.map((item) => item.product.variantId)).toEqual([
      'variant-1',
      'variant-2',
    ])
    expect(
      cartReducer(withSecond, {
        type: 'remove',
        variantId: 'variant-1',
      }),
    ).toHaveLength(1)
    expect(cartReducer(withSecond, { type: 'clear' })).toEqual([])
  })

  it('extracts the approved Product, Cart, tracking and batch components', () => {
    expect(typeof ProductCatalog).toBe('function')
    expect(typeof Cart).toBe('function')
    expect(typeof CartLine).toBe('function')
    expect(typeof SerialWarrantyEditor).toBe('function')
    expect(typeof BatchEditor).toBe('function')

    expect(posPageSource).toMatch(/useReducer/)
    expect(posPageSource).toMatch(/from ['"]\.\/pos-state['"]/)
    expect(posPageSource).toMatch(
      /from ['"]\.\/components\/product-catalog['"]/,
    )
    expect(posPageSource).toMatch(
      /from ['"]\.\/components\/cart['"]/,
    )
  })

  it('keeps the compact two-workspace desktop layout and stacks it for tablet/mobile', () => {
    expect(styles).toMatch(
      /\.pos-workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(280px,\s*380px\)\s+minmax\(0,\s*1fr\)/,
    )
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*960px\)[\s\S]*?\.pos-workspace\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    )
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*560px\)[\s\S]*?\.pos-product-list\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    )
  })

  it('keeps compound quantity editing inline rather than introducing a modal or side sheet', () => {
    expect(styles).toMatch(/\.pos-conversion-row\s+td/)
    expect(styles).not.toMatch(/\.pos-conversion-(dialog|modal|sheet)/)
    expect(posPageSource).not.toMatch(
      /Dialog[^\n]*(quantity|conversion)|Sheet[^\n]*(quantity|conversion)/i,
    )
  })
})
