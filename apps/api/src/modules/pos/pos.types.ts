import type { AllocationPolicy } from '../products/tracking.types'
import type {
  NormalizedQuantity,
  QuantityInput,
} from '../products/conversion.types'
import type { TrackingMode } from '../products/product.types'
import type { PermissionKey } from '../auth/permissions'
import type { FinancialAccountRecord, CashSessionRecord } from '../finance/finance.types'

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
  configuredPurchasePricePaisa?: string
}

export interface PosProductSearchOptions {
  limit?: number
  includeConfiguredPurchasePrice?: boolean
}

export interface PosSellingSegment {
  lotId: string
  baseQty: string
  unitSellingPricePaisa: string
  amountPaisa: string
}

export interface PosLineQuote {
  variantId: string
  baseQty: string
  pricingQty: string
  displayQty: string
  availableOwnBaseQty: string
  shortfallBaseQty: string
  automaticSalesTotalPaisa: string
  effectiveUnitSellingPricePaisa: string
  sellingSegments: PosSellingSegment[]
  configuredPurchasePricePaisa?: string
  conversion: NormalizedQuantity
  fixedUnitOptions: Array<{
    unitId: string
    unitName: string
    unitSymbol: string | null
    conversionToBase: string
  }>
}

export interface PosLineQuoteInput {
  variantId: string
  businessDate?: string
  baseQty?: string
  quantity?: QuantityInput
}

export interface PosCustomerSearchResult {
  id: string
  customerCode: string
  name: string
  phone: string
  guardianName: string
  address: string
  balancePaisa: string
}

export interface PosBootstrap {
  capabilities: {
    canSell: boolean
    canOverrideSellingPrice: boolean
    canViewConfiguredPurchasePrice: boolean
    canBackdate: boolean
  }
  settings: {
    showPurchasePrice: boolean
    requireCashSession: boolean
    invoiceShareEnabled: boolean
  }
  financialAccounts: FinancialAccountRecord[]
  activeCashSession: CashSessionRecord | null
  recent: {
    drafts: []
    templates: []
  }
}

export interface PosClientContext {
  permissions: PermissionKey[]
}
