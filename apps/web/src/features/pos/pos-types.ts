export interface PosSellingSegmentDto {
  lotId: string
  baseQty: string
  unitSellingPricePaisa: string
  amountPaisa: string
}

export interface PosNormalizedQuantityDto {
  baseQty: string
  pricingQty: string
  displayQty: string
  components: Record<string, string>
  snapshot: unknown | null
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
