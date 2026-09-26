import type { NormalizedQuantity, QuantityInput } from '../products/conversion.types'
import type { PosLineQuote, PosProductSearchResult } from '../pos/pos.types'

export type TemplatePriceStrategy = 'CURRENT_AUTO' | 'FIXED_MANUAL'

export interface SalesTemplateLineInput {
  variantId: string
  quantityInput: QuantityInput
  pricingStrategy?: TemplatePriceStrategy
  manualUnitSellingPricePaisa?: string | null
}

export interface SalesTemplateInput {
  name: string
  lines: SalesTemplateLineInput[]
}

export interface SalesTemplateStoredLine {
  variantId: string
  quantityInput: QuantityInput
  normalizedQuantitySnapshot: NormalizedQuantity
  pricingStrategy: TemplatePriceStrategy
  manualUnitSellingPricePaisa: string | null
}

export interface SalesTemplateRecord {
  id: string
  name: string
  version: number
  status: 'ACTIVE' | 'ARCHIVED'
  createdByUserId: string
  createdAt: string
  updatedAt: string
  lines: SalesTemplateStoredLine[]
}

export interface SalesTemplateSummary {
  id: string
  name: string
  version: number
  lineCount: number
  createdAt: string
  updatedAt: string
}

export interface SalesTemplateLoadedLine extends SalesTemplateStoredLine {
  product: PosProductSearchResult
  quote: PosLineQuote
}

export interface SalesTemplateLoaded {
  id: string
  name: string
  version: number
  lines: SalesTemplateLoadedLine[]
}
