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
