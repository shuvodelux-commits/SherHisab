export type SalesDraftStatus = 'ACTIVE' | 'ARCHIVED' | 'POSTED'
export type SalesDraftPricingMode = 'AUTO' | 'MANUAL'
export type SalesDraftPaymentMethod =
  | 'CASH'
  | 'BANK'
  | 'MOBILE_BANKING'
  | 'CUSTOMER_CREDIT'

export interface SalesDraftCustomerState {
  selectedCustomerId: string | null
  name: string
  phone: string
  guardianName: string
  address: string
}

export interface SalesDraftPaymentState {
  clientLineId: string
  method: SalesDraftPaymentMethod
  accountId: string | null
  amountPaisa: string
  reference: string
  note: string
}

export type SalesDraftQuantityInput =
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

export interface SalesDraftNormalizedQuantitySnapshot {
  baseQty: string
  pricingQty: string
  displayQty: string
  components: Record<string, string>
  snapshot: unknown | null
  fixedUnitSnapshot?: unknown | null
}

export type SalesDraftShortageResolution =
  | {
      type: 'VENDOR'
      vendorId: string
      unitCostPaisa: string
    }
  | {
      type: 'NEGATIVE_STOCK'
    }
  | null

export interface SalesDraftBatchSelection {
  lotId: string
  batchCode: string
  expiresOn: string
}

export interface SalesDraftLineInput {
  variantId: string
  quantityInput: SalesDraftQuantityInput
  normalizedQuantitySnapshot: SalesDraftNormalizedQuantitySnapshot
  pricingMode: SalesDraftPricingMode
  manualUnitSellingPricePaisa: string | null
  shortageResolution: SalesDraftShortageResolution
  serialIds: string[]
  batchSelection: SalesDraftBatchSelection | null
  warrantySnapshot: unknown | null
  captureValues: Record<string, string>
}

export interface SalesDraftInput {
  customer: SalesDraftCustomerState
  discountPaisa: string
  payments: SalesDraftPaymentState[]
  note: string
  lines: SalesDraftLineInput[]
}

export interface SalesDraftRecord extends SalesDraftInput {
  id: string
  tenantId: string
  draftNumber: string
  version: number
  status: SalesDraftStatus
  ownerUserId: string
  postedSaleId: string | null
  postedOperationId: string | null
  createdAt: Date
  updatedAt: Date
}


export interface SalesDraftPostInput {
  operationId: string
  businessDate: string
  canOverrideSellingPrice: boolean
}
