import Decimal from 'decimal.js'
import {
  InsufficientStockError,
  SalesValidationError,
} from './sales.errors'
import type {
  AvailableSalesLot,
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

export function roundPaisa(value: Decimal): string {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)
}

export function normalizeMoneyPaisa(
  value: string,
  label: string,
): string {
  const normalized = value.trim()

  if (!/^\d+$/.test(normalized)) {
    throw new SalesValidationError(
      `${label} must be a non-negative whole number of paisa.`,
    )
  }

  return BigInt(normalized).toString()
}

export function buildPartialFifoLineQuote(
  variantId: string,
  baseQty: string,
  lots: AvailableSalesLot[],
): Omit<FifoLineQuote, 'isSufficient'> & {
  shortfallBaseQty: string
  isSufficient: boolean
} {
  const requested = positiveQuantity(baseQty)
  const available = lots.reduce(
    (total, lot) => total.plus(lot.remainingBaseQty),
    new Decimal(0),
  )
  let remaining = Decimal.min(requested, available)
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

  const ownBaseQty = Decimal.min(requested, available)
  const shortfall = requested.minus(ownBaseQty)
  return {
    variantId,
    requestedBaseQty: requested.toFixed(),
    availableBaseQty: available.toFixed(),
    allocations,
    automaticSalesTotalPaisa: automaticSalesTotal.toFixed(0),
    effectiveUnitSellingPricePaisa: ownBaseQty.isZero()
      ? '0'
      : roundPaisa(automaticSalesTotal.div(ownBaseQty)),
    cogsPaisa: cogsTotal.toFixed(0),
    shortfallBaseQty: shortfall.toFixed(),
    isSufficient: shortfall.isZero(),
  }
}

export function buildFifoLineQuote(
  variantId: string,
  baseQty: string,
  lots: AvailableSalesLot[],
): FifoLineQuote {
  const partial = buildPartialFifoLineQuote(
    variantId,
    baseQty,
    lots,
  )
  const requested = new Decimal(partial.requestedBaseQty)
  const available = new Decimal(partial.availableBaseQty)

  if (!partial.isSufficient) {
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

  return {
    variantId,
    requestedBaseQty: requested.toFixed(),
    availableBaseQty: available.toFixed(),
    allocations,
    automaticSalesTotalPaisa: automaticSalesTotal.toFixed(0),
    effectiveUnitSellingPricePaisa: roundPaisa(
      automaticSalesTotal.div(requested),
    ),
    cogsPaisa: cogsTotal.toFixed(0),
    isSufficient: true,
  }
}
