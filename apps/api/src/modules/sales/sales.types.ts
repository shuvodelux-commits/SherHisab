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

export interface CommitSaleLineInput {
  variantId: string
  baseQty: string
  manualUnitSellingPricePaisa?: string
}

export interface CommitSaleInput {
  operationId?: string
  businessDate: string
  lines: CommitSaleLineInput[]
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
}

export interface CommittedSale {
  id: string
  invoiceNumber: string
  businessDate: string
  totalSalesPaisa: string
  totalCogsPaisa: string
  grossProfitPaisa: string
  lines: CommittedSaleLine[]
}
