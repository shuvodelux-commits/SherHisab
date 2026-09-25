export interface PosSellingSegmentDto {
  lotId: string
  baseQty: string
  unitSellingPricePaisa: string
  amountPaisa: string
}

export interface PosConversionComponentDto {
  id: string
  key: string
  label: string
  unitId: string
  baseFactorNumerator: string
  baseFactorDenominator: string
  sortOrder: number
  minValue: string
  maxExclusive: string | null
  allowFraction: boolean
  autoNormalizeRemainder: boolean
}

export interface PosConversionProfileDto {
  id: string
  productId: string
  type: 'SIMPLE' | 'PACK' | 'LENGTH' | 'COMPOUND' | 'CUSTOM_FIXED_RATIO'
  version: number
  baseUnitId: string
  pricingUnitId: string
  pricingBaseFactorNumerator: string
  pricingBaseFactorDenominator: string
  displayPrecision: number
  components: PosConversionComponentDto[]
}

export type PosQuantityInputDto =
  | {
      kind: 'SIMPLE'
      baseQty: string
    }
  | {
      kind: 'COMPONENTS'
      profileId: string
      profileVersion: number
      components: Record<string, string>
    }

export interface PosNormalizedQuantityDto {
  baseQty: string
  pricingQty: string
  displayQty: string
  components: Record<string, string>
  snapshot: PosConversionProfileDto | null
}

export interface PosLineQuoteDto {
  variantId: string
  baseQty: string
  pricingQty: string
  displayQty: string
  availableOwnBaseQty: string
  shortfallBaseQty: string
  automaticSalesTotalPaisa: string
  effectiveUnitSellingPricePaisa: string
  sellingSegments: PosSellingSegmentDto[]
  configuredPurchasePricePaisa?: string
  conversion: PosNormalizedQuantityDto
}

export interface PosProductSearchDto {
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
  trackingMode: 'SIMPLE' | 'SERIAL' | 'BATCH_EXPIRY'
  allocationPolicy: 'FIFO' | 'FEFO'
  variantsEnabled: boolean
  configuredPurchasePricePaisa?: string
}

export interface PosBootstrapDto {
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
  financialAccounts: Array<{
    id: string
    type: 'BANK' | 'MOBILE_BANKING'
    name: string
    provider: string
    accountReference: string
    isActive: boolean
  }>
  activeCashSession: unknown | null
  recent: {
    drafts: []
    templates: []
  }
}

export interface PosVendorSearchDto {
  id: string
  vendorCode: string
  name: string
  phone: string
  address: string
  isActive: boolean
}

export type PosShortageResolutionDto =
  | { type: 'NEGATIVE_STOCK' }
  | {
      type: 'VENDOR'
      vendorId: string
      unitCostPaisa: string
    }

export interface PosCustomerSearchDto {
  id: string
  customerCode: string
  name: string
  phone: string
  guardianName: string
  address: string
  balancePaisa: string
}

export interface CommitSaleLinePayload {
  variantId: string
  baseQty: string
  manualUnitSellingPricePaisa?: string
  shortageResolution?: PosShortageResolutionDto
}

export interface CommitSalePayload {
  businessDate: string
  lines: CommitSaleLinePayload[]
}

export interface CommittedSaleDto {
  id: string
  businessDate: string
  totalSalesPaisa: string
  lines: Array<{
    id: string
    variantId: string
    baseQty: string
    pricingMode: 'LOT' | 'MANUAL'
    manualUnitSellingPricePaisa: string | null
    automaticSalesTotalPaisa: string
    finalSalesTotalPaisa: string
  }>
}
