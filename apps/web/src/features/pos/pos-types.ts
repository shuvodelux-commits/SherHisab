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
      kind: 'FIXED_UNIT'
      unitId: string
      quantity: string
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
  fixedUnitSnapshot?: {
    productId: string
    unitId: string
    unitName: string
    unitSymbol: string | null
    quantity: string
    conversionToBase: string
  } | null
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
  fixedUnitOptions?: Array<{
    unitId: string
    unitName: string
    unitSymbol: string | null
    conversionToBase: string
  }>
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
  quantityInput?: PosQuantityInputDto
}

export type PosPaymentMethod =
  | 'CASH'
  | 'BANK'
  | 'MOBILE_BANKING'
  | 'CUSTOMER_CREDIT'

export interface PosPaymentLineDraft {
  clientLineId: string
  method: PosPaymentMethod
  accountId: string | null
  amountInput: string
  reference?: string
  note?: string
}

export interface CommitSalePaymentPayload {
  clientLineId: string
  method: PosPaymentMethod
  accountId?: string
  amountPaisa: string
}

export interface CommitSalePayload {
  operationId?: string
  businessDate: string
  lines: CommitSaleLinePayload[]
  customer?: {
    selectedCustomerId?: string
    name: string
    phone: string
    guardianName?: string
    address?: string
  }
  payments?: CommitSalePaymentPayload[]
  discountPaisa?: string
  note?: string
}

export interface SalesDraftLineDto {
  variantId: string
  quantityInput: PosQuantityInputDto
  normalizedQuantitySnapshot: PosNormalizedQuantityDto
  pricingMode: 'AUTO' | 'MANUAL'
  manualUnitSellingPricePaisa: string | null
  shortageResolution: PosShortageResolutionDto | null
  serialIds: string[]
  batchSelection: { lotId: string; batchCode: string; expiresOn: string } | null
  warrantySnapshot: unknown | null
  captureValues: Record<string, string>
}

export interface SalesDraftDto {
  id: string
  tenantId: string
  draftNumber: string
  version: number
  status: 'ACTIVE' | 'ARCHIVED' | 'POSTED'
  ownerUserId: string
  postedSaleId: string | null
  postedOperationId: string | null
  customer: {
    selectedCustomerId: string | null
    name: string
    phone: string
    guardianName: string
    address: string
  }
  discountPaisa: string
  payments: Array<{
    clientLineId: string
    method: PosPaymentMethod
    accountId: string | null
    amountPaisa: string
    reference: string
    note: string
  }>
  note: string
  lines: SalesDraftLineDto[]
  createdAt: string
  updatedAt: string
}

export interface CommittedSaleDto {
  id: string
  invoiceNumber: string
  businessDate: string
  totalSalesPaisa: string
  grandTotalPaisa?: string
  settlementStatus?: 'DUE' | 'PARTIAL' | 'PAID'
  paidAmountPaisa?: string
  duePaisa?: string
  changePaisa?: string
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

export type SalesTemplatePriceStrategy = 'CURRENT_AUTO' | 'FIXED_MANUAL'

export interface SalesTemplateLineInputDto {
  variantId: string
  quantityInput: PosQuantityInputDto
  pricingStrategy?: SalesTemplatePriceStrategy
  manualUnitSellingPricePaisa?: string | null
}

export interface SalesTemplateStoredLineDto {
  variantId: string
  quantityInput: PosQuantityInputDto
  normalizedQuantitySnapshot: PosNormalizedQuantityDto
  pricingStrategy: SalesTemplatePriceStrategy
  manualUnitSellingPricePaisa: string | null
}

export interface SalesTemplateSummaryDto {
  id: string
  name: string
  version: number
  lineCount: number
  createdAt: string
  updatedAt: string
}

export interface SalesTemplateRecordDto {
  id: string
  name: string
  version: number
  createdAt: string
  updatedAt: string
  status: 'ACTIVE' | 'ARCHIVED'
  createdByUserId: string
  lines: SalesTemplateStoredLineDto[]
}

export interface SalesTemplateLoadedDto {
  id: string
  name: string
  version: number
  lines: Array<SalesTemplateStoredLineDto & {
    product: PosProductSearchDto
    quote: PosLineQuoteDto
  }>
}
