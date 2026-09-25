import type { ShortageResolution } from './stock-source.types'

export interface SalesFifoAllocation {
  lotId: string
  receivedOn: string
  baseQty: string
  unitCostPaisa: string
  lotSellingPricePaisa: string
  automaticSalesAmountPaisa: string
  cogsAmountPaisa: string
}

export interface FifoLineQuote {
  variantId: string
  requestedBaseQty: string
  availableBaseQty: string
  allocations: SalesFifoAllocation[]
  automaticSalesTotalPaisa: string
  effectiveUnitSellingPricePaisa: string
  cogsPaisa: string
  isSufficient: true
}

export interface AvailableSalesLot {
  id: string
  receivedOn: string
  remainingBaseQty: string
  unitCostPaisa: string
  sellingPricePaisa: string
}

export type SalesPricingMode = 'LOT' | 'MANUAL'
export type SalesSettlementStatus = 'DUE' | 'PARTIAL' | 'PAID'
export type SalesPaymentMethod =
  | 'CASH'
  | 'BANK'
  | 'MOBILE_BANKING'
  | 'CUSTOMER_CREDIT'

export interface CommitSaleLineInput {
  variantId: string
  baseQty: string
  manualUnitSellingPricePaisa?: string
  shortageResolution?: ShortageResolution
}

export interface SaleCustomerInput {
  selectedCustomerId?: string
  name: string
  phone: string
  guardianName?: string
  address?: string
}

export interface SalesPaymentInput {
  clientLineId: string
  method: SalesPaymentMethod
  accountId?: string
  amountPaisa: string
  reference?: string
  note?: string
}

export interface CommitSaleInput {
  operationId?: string
  businessDate: string
  customer?: SaleCustomerInput
  discountPaisa?: string
  lines: CommitSaleLineInput[]
  payments?: SalesPaymentInput[]
  sourceDraft?: { id: string; version: number }
}

export interface CommittedSaleLine {
  id: string
  variantId: string
  baseQty: string
  pricingMode: SalesPricingMode
  manualUnitSellingPricePaisa: string | null
  automaticSalesTotalPaisa: string
  finalSalesTotalPaisa: string
  cogsPaisa: string
  grossProfitPaisa: string
  belowCost: boolean
  lossPaisa: string
  allocations: SalesFifoAllocation[]
  grossAmountPaisa?: string
  allocatedDiscountPaisa?: string
  netAmountPaisa?: string
}

export interface CommittedSale {
  id: string
  invoiceNumber: string
  businessDate: string
  totalSalesPaisa: string
  totalCogsPaisa: string
  grossProfitPaisa: string
  lines: CommittedSaleLine[]
  customerId?: string | null
  subtotalPaisa?: string
  discountPaisa?: string
  grandTotalPaisa?: string
  settlementStatus?: SalesSettlementStatus
  paidAmountPaisa?: string
  duePaisa?: string
  changePaisa?: string
}
