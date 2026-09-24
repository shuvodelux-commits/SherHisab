import Decimal from 'decimal.js'
import type { DatabaseClient } from '../../db/request-database'
import {
  InsufficientStockError,
  SalesValidationError,
} from './sales.errors'
import { SalesRepository } from './sales.repository'
import type {
  FifoLineQuote,
  SalesFifoAllocation,
} from './sales.types'

function positiveQuantity(value: string): Decimal {
  let quantity: Decimal

  try {
    quantity = new Decimal(value)
  } catch {
    throw new SalesValidationError('Sale quantity must be valid.')
  }

  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new SalesValidationError(
      'Sale quantity must be greater than zero.',
    )
  }

  return quantity
}

function roundPaisa(value: Decimal): string {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)
}

export class SalesPricingService {
  private readonly repository: SalesRepository

  constructor(database: DatabaseClient) {
    this.repository = new SalesRepository(database)
  }

  async quoteFifoLine(
    tenantId: string,
    variantId: string,
    baseQty: string,
  ): Promise<FifoLineQuote> {
    const requested = positiveQuantity(baseQty)
    const lots = await this.repository.listAvailableFifoLots(
      tenantId,
      variantId,
    )
    const available = lots.reduce(
      (total, lot) => total.plus(lot.remainingBaseQty),
      new Decimal(0),
    )

    if (requested.gt(available)) {
      throw new InsufficientStockError(
        requested.toFixed(),
        available.toFixed(),
      )
    }

    let remaining = requested
    let automaticSalesTotal = new Decimal(0)
    let cogsTotal = new Decimal(0)
    const allocations: SalesFifoAllocation[] = []

    for (const lot of lots) {
      if (remaining.lte(0)) {
        break
      }

      const lotAvailable = new Decimal(lot.remainingBaseQty)
      const consume = Decimal.min(remaining, lotAvailable)
      const automaticSalesAmount = new Decimal(
        roundPaisa(consume.times(lot.sellingPricePaisa)),
      )
      const cogsAmount = new Decimal(
        roundPaisa(consume.times(lot.unitCostPaisa)),
      )

      allocations.push({
        lotId: lot.id,
        receivedOn: lot.receivedOn,
        baseQty: consume.toFixed(),
        unitCostPaisa: lot.unitCostPaisa,
        lotSellingPricePaisa: lot.sellingPricePaisa,
        automaticSalesAmountPaisa: automaticSalesAmount.toFixed(0),
        cogsAmountPaisa: cogsAmount.toFixed(0),
      })

      automaticSalesTotal = automaticSalesTotal.plus(
        automaticSalesAmount,
      )
      cogsTotal = cogsTotal.plus(cogsAmount)
      remaining = remaining.minus(consume)
    }

    const effectiveUnit = new Decimal(
      roundPaisa(automaticSalesTotal.div(requested)),
    )

    return {
      variantId,
      requestedBaseQty: requested.toFixed(),
      availableBaseQty: available.toFixed(),
      allocations,
      automaticSalesTotalPaisa: automaticSalesTotal.toFixed(0),
      effectiveUnitSellingPricePaisa: effectiveUnit.toFixed(0),
      cogsPaisa: cogsTotal.toFixed(0),
      isSufficient: true,
    }
  }
}
