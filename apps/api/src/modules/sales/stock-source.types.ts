export interface InternalLotAllocation {
  lotId: string
  baseQty: string
  unitCostPaisa: string
  lotSellingPricePaisa: string
  automaticSalesAmountPaisa: string
  cogsAmountPaisa: string
}

export type ShortageResolution =
  | { type: 'OWN_STOCK' }
  | { type: 'NEGATIVE_STOCK' }
  | { type: 'VENDOR'; vendorId: string; unitCostPaisa: string }

export interface StockSourcePlan {
  requestedBaseQty: string
  ownBaseQty: string
  shortfallBaseQty: string
  ownAllocations: InternalLotAllocation[]
  shortageResolution: Exclude<
    ShortageResolution,
    { type: 'OWN_STOCK' }
  > | null
}

export type StockSourceDecision =
  | { type: 'PLAN'; plan: StockSourcePlan }
  | {
      type: 'REMOVE_LINE'
      reason: 'NO_OWN_STOCK'
      plan: StockSourcePlan
    }

export interface StockSourcePlanInput {
  requestedBaseQty: string
  ownAllocations: InternalLotAllocation[]
  shortageResolution: ShortageResolution | null
}
