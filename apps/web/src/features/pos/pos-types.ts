export interface SaleQuoteAllocationDto {
  lotId: string
  receivedOn: string
  baseQty: string
  unitCostPaisa: string
  lotSellingPricePaisa: string
  automaticSalesAmountPaisa: string
  cogsAmountPaisa: string
}

export interface SaleQuoteDto {
  variantId: string
  requestedBaseQty: string
  availableBaseQty: string
  allocations: SaleQuoteAllocationDto[]
  automaticSalesTotalPaisa: string
  effectiveUnitSellingPricePaisa: string
  cogsPaisa: string
  isSufficient: true
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
  totalCogsPaisa: string
  grossProfitPaisa: string
  lines: Array<{
    id: string
    variantId: string
    baseQty: string
    pricingMode: 'LOT' | 'MANUAL'
    manualUnitSellingPricePaisa: string | null
    automaticSalesTotalPaisa: string
    finalSalesTotalPaisa: string
    cogsPaisa: string
    grossProfitPaisa: string
    belowCost: boolean
    lossPaisa: string
    allocations: SaleQuoteAllocationDto[]
  }>
}
