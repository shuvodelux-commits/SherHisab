import Decimal from 'decimal.js'
import type {
  InternalLotAllocation,
  ShortageResolution,
  StockSourceDecision,
  StockSourcePlan,
  StockSourcePlanInput,
} from './stock-source.types'

export type { InternalLotAllocation } from './stock-source.types'

function positiveQuantity(value: string, label: string): Decimal {
  let quantity: Decimal
  try {
    quantity = new Decimal(value)
  } catch {
    throw new Error(`${label} must be a valid quantity`)
  }

  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new Error(`${label} must be greater than zero`)
  }
  return quantity
}

function nonNegativeQuantity(value: string, label: string): Decimal {
  let quantity: Decimal
  try {
    quantity = new Decimal(value)
  } catch {
    throw new Error(`${label} must be a valid quantity`)
  }

  if (!quantity.isFinite() || quantity.lt(0)) {
    throw new Error(`${label} must not be negative`)
  }
  return quantity
}

function assertResolutionShape(
  value: ShortageResolution | null,
): void {
  if (value === null) {
    return
  }

  const raw = value as unknown as Record<string, unknown>
  const keys = Object.keys(raw).sort()

  if (value.type === 'OWN_STOCK' || value.type === 'NEGATIVE_STOCK') {
    if (keys.length !== 1 || keys[0] !== 'type') {
      throw new Error('One shortage must use one resolution; mixed resolution data is invalid')
    }
    return
  }

  if (value.type === 'VENDOR') {
    if (
      keys.length !== 3 ||
      !keys.includes('type') ||
      !keys.includes('vendorId') ||
      !keys.includes('unitCostPaisa') ||
      !value.vendorId.trim() ||
      !/^\d+$/.test(value.unitCostPaisa.trim())
    ) {
      throw new Error('One shortage must use one resolution; Vendor sourcing requires one Vendor and unit cost')
    }
    return
  }

  throw new Error('One shortage must use one resolution')
}

function buildPlan(
  requested: Decimal,
  own: Decimal,
  ownAllocations: InternalLotAllocation[],
  shortageResolution: StockSourcePlan['shortageResolution'],
): StockSourcePlan {
  const shortfall = Decimal.max(requested.minus(own), 0)
  return {
    requestedBaseQty: requested.toFixed(),
    ownBaseQty: Decimal.min(own, requested).toFixed(),
    shortfallBaseQty: shortfall.toFixed(),
    ownAllocations,
    shortageResolution:
      shortfall.isZero() ? null : shortageResolution,
  }
}

export class StockSourceService {
  plan(input: StockSourcePlanInput): StockSourceDecision {
    const requested = positiveQuantity(
      input.requestedBaseQty,
      'Requested quantity',
    )
    assertResolutionShape(input.shortageResolution)

    let own = new Decimal(0)
    for (const allocation of input.ownAllocations) {
      own = own.plus(
        nonNegativeQuantity(
          allocation.baseQty,
          'Own allocation quantity',
        ),
      )
    }

    if (own.gt(requested)) {
      throw new Error('Own allocations cannot exceed requested quantity')
    }

    if (input.shortageResolution?.type === 'OWN_STOCK') {
      if (own.isZero()) {
        return {
          type: 'REMOVE_LINE',
          reason: 'NO_OWN_STOCK',
          plan: buildPlan(
            new Decimal(0),
            new Decimal(0),
            [],
            null,
          ),
        }
      }

      return {
        type: 'PLAN',
        plan: buildPlan(
          own,
          own,
          input.ownAllocations,
          null,
        ),
      }
    }

    const resolution =
      input.shortageResolution === null
        ? null
        : input.shortageResolution

    return {
      type: 'PLAN',
      plan: buildPlan(
        requested,
        own,
        input.ownAllocations,
        resolution,
      ),
    }
  }
}
