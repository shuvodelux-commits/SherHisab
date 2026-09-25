import type { AllocationPolicy } from '../products/tracking.types'
import type { TrackingMode } from '../products/product.types'

export interface PosProductSearchResult {
  productId: string
  variantId: string
  productName: string
  variantName: string | null
  sku: string | null
  primaryBarcode: string | null
  brand: string
  categoryName: string | null
  unitId: string
  unitName: string
  unitSymbol: string | null
  currentSellingPricePaisa: string
  availableOwnBaseQty: string
  trackingMode: TrackingMode
  allocationPolicy: AllocationPolicy
  variantsEnabled: boolean
}

export interface PosProductSearchOptions {
  limit?: number
}
