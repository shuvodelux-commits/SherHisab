import type { SetStateAction } from 'react'
import { formatPaisaToTaka } from '../../lib/money'
import type {
  PosConversionProfileDto,
  PosLineQuoteDto,
  PosProductSearchDto,
  SalesDraftLineDto,
  SalesTemplateLoadedDto,
} from './pos-types'

export interface CartLineState {
  product: PosProductSearchDto
  quantity: string
  quote: PosLineQuoteDto
  priceInput: string
  manualUnitSellingPricePaisa: string | null
  showBreakdown: boolean
  conversionExpanded: boolean
  conversionComponents: Record<string, string>
  fixedUnitInput?: { unitId: string; quantity: string }
  shortageResolution: 'VENDOR' | 'NEGATIVE_STOCK' | null
  vendorId: string | null
  vendorName: string
  vendorUnitCostInput: string
  isQuoting: boolean
  error: string
  savedDraftLine?: SalesDraftLineDto
  draftLineEdited?: boolean
  currentConversionProfile?: PosConversionProfileDto
  currentFixedUnitQuote?: PosLineQuoteDto
}

export type CartAction =
  | {
      type: 'set'
      value: SetStateAction<CartLineState[]>
    }
  | { type: 'upsert'; line: CartLineState }
  | { type: 'remove'; variantId: string }
  | { type: 'clear' }

function oneLinePerVariant(
  lines: CartLineState[],
): CartLineState[] {
  const result: CartLineState[] = []
  const indexByVariant = new Map<string, number>()

  for (const line of lines) {
    const variantId = line.product.variantId
    const existingIndex = indexByVariant.get(variantId)

    if (existingIndex === undefined) {
      indexByVariant.set(variantId, result.length)
      result.push(line)
    } else {
      result[existingIndex] = line
    }
  }

  return result
}

export function cartReducer(
  state: CartLineState[],
  action: CartAction,
): CartLineState[] {
  if (action.type === 'clear') {
    return []
  }

  if (action.type === 'remove') {
    return state.filter(
      (line) => line.product.variantId !== action.variantId,
    )
  }

  if (action.type === 'upsert') {
    return oneLinePerVariant([...state, action.line])
  }

  const next =
    typeof action.value === 'function'
      ? action.value(state)
      : action.value

  return oneLinePerVariant(next)
}

export function cartLinesFromTemplate(
  template: SalesTemplateLoadedDto,
): CartLineState[] {
  return template.lines.map((line) => {
    const quote = line.quote
    const manual = line.pricingStrategy === 'FIXED_MANUAL'
      ? line.manualUnitSellingPricePaisa : null
    return {
      product: line.product,
      quantity: quote.conversion.snapshot || quote.conversion.fixedUnitSnapshot
        ? quote.baseQty : quote.displayQty,
      quote,
      priceInput: formatPaisaToTaka(
        manual ?? quote.effectiveUnitSellingPricePaisa,
      ),
      manualUnitSellingPricePaisa: manual,
      showBreakdown: false,
      conversionExpanded: false,
      conversionComponents: { ...quote.conversion.components },
      ...(line.quantityInput.kind === 'FIXED_UNIT' ? {
        fixedUnitInput: {
          unitId: line.quantityInput.unitId,
          quantity: line.quantityInput.quantity,
        },
      } : {}),
      shortageResolution: null,
      vendorId: null,
      vendorName: '',
      vendorUnitCostInput: '',
      isQuoting: false,
      error: '',
    }
  })
}
