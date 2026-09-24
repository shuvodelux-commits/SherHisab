import Decimal from 'decimal.js'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from './product.errors'
import {
  InventoryRepository,
  type InventoryLotRecord,
} from './inventory.repository'
import { parseMoneyPaisa } from './product.validation'

export interface AdjustStockInput {
  deltaBaseQty: string
  note: string
  unitCostPaisa?: string
  sellingPricePaisa?: string
  businessDate?: string
}

interface FifoPlanItem {
  lotId: string
  consumeBaseQty: string
  remainingBaseQty: string
  unitCostPaisa: string
}

function requireSignedNonZeroQuantity(value: string): Decimal {
  let quantity: Decimal

  try {
    quantity = new Decimal(value)
  } catch {
    throw new ProductValidationError('Stock adjustment quantity must be valid')
  }

  if (!quantity.isFinite() || quantity.isZero()) {
    throw new ProductValidationError(
      'Stock adjustment quantity must be non-zero',
    )
  }

  return quantity
}

function requireNote(value: string): string {
  const note = value.trim()

  if (!note) {
    throw new ProductValidationError('Stock adjustment reason is required')
  }

  return note
}

function resolveBusinessDate(value?: string): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ProductValidationError('Business date must use YYYY-MM-DD')
  }

  return value
}

export class InventoryService {
  private readonly repository: InventoryRepository

  constructor(private readonly database: DatabaseClient) {
    this.repository = new InventoryRepository(database)
  }

  async createOpeningInventoryInTransaction(input: {
    tenantId: string
    actorUserId: string | null
    variantId: string
    baseQty: string
    unitCostPaisa: string
    defaultSellPricePaisa: string
    businessDate?: string
  }): Promise<void> {
    const quantity = new Decimal(input.baseQty)

    if (quantity.lte(0)) {
      return
    }

    const businessDate =
      input.businessDate ?? new Date().toISOString().slice(0, 10)
    const currentBalance = new Decimal(
      await this.repository.getVariantBalance(input.tenantId, input.variantId),
    )
    const balanceAfter = currentBalance.plus(quantity).toFixed()

    const lot = await this.repository.createLot({
      tenantId: input.tenantId,
      variantId: input.variantId,
      sourceType: 'OPENING',
      receivedOn: businessDate,
      unitCostPaisa: input.unitCostPaisa,
      defaultSellPricePaisa: input.defaultSellPricePaisa,
      baseQty: quantity.toFixed(),
    })

    const movement = await this.repository.createMovement({
      tenantId: input.tenantId,
      variantId: input.variantId,
      movementType: 'OPENING',
      businessDate,
      baseQtyDelta: quantity.toFixed(),
      balanceAfterBaseQty: balanceAfter,
      referenceType: 'PRODUCT_OPENING',
      note: 'Initial stock on product creation',
      createdByUserId: input.actorUserId,
    })

    await this.repository.createMovementLotAllocation({
      tenantId: input.tenantId,
      movementId: movement.id,
      lotId: lot.id,
      baseQty: quantity.toFixed(),
      unitCostPaisa: input.unitCostPaisa,
    })
  }

  async adjustStock(
    tenantId: string,
    actorUserId: string | null,
    variantId: string,
    input: AdjustStockInput,
  ): Promise<void> {
    return withDatabaseTransaction(this.database, async (database) => {
      return new InventoryService(database).adjustStockInTransaction(
        tenantId,
        actorUserId,
        variantId,
        input,
      )
    })
  }

  async adjustStockInTransaction(
    tenantId: string,
    actorUserId: string | null,
    variantId: string,
    input: AdjustStockInput,
  ): Promise<void> {
    if (!tenantId) {
      throw new ProductValidationError('Trusted tenant id is required')
    }

    const quantity = requireSignedNonZeroQuantity(input.deltaBaseQty)
    const note = requireNote(input.note)
    const businessDate = resolveBusinessDate(input.businessDate)
    const variant = await this.repository.lockActiveVariant(tenantId, variantId)

    if (!variant) {
      throw new ProductNotFoundError('Product variant not found.')
    }

    const currentBalance = new Decimal(
      await this.repository.getVariantBalance(tenantId, variantId),
    )
    const balanceAfter = currentBalance.plus(quantity)

    if (quantity.gt(0)) {
      if (input.unitCostPaisa === undefined) {
        throw new ProductValidationError(
          'Purchase price is required when adding stock',
        )
      }

      if (input.sellingPricePaisa === undefined) {
        throw new ProductValidationError(
          'Selling price is required when adding stock',
        )
      }

      const unitCostPaisa = parseMoneyPaisa(
        input.unitCostPaisa,
        'Purchase price',
      )
      const sellingPricePaisa = parseMoneyPaisa(
        input.sellingPricePaisa,
        'Selling price',
      )

      if (BigInt(unitCostPaisa) <= 0n) {
        throw new ProductValidationError(
          'Purchase price must be greater than zero when adding stock',
        )
      }

      const lot = await this.repository.createLot({
        tenantId,
        variantId,
        sourceType: 'ADJUSTMENT',
        receivedOn: businessDate,
        unitCostPaisa,
        defaultSellPricePaisa: sellingPricePaisa,
        baseQty: quantity.toFixed(),
      })

      const movement = await this.repository.createMovement({
        tenantId,
        variantId,
        movementType: 'ADJUSTMENT_IN',
        businessDate,
        baseQtyDelta: quantity.toFixed(),
        balanceAfterBaseQty: balanceAfter.toFixed(),
        referenceType: 'STOCK_ADJUSTMENT',
        note,
        createdByUserId: actorUserId,
      })

      await this.repository.createMovementLotAllocation({
        tenantId,
        movementId: movement.id,
        lotId: lot.id,
        baseQty: quantity.toFixed(),
        unitCostPaisa,
      })

      return
    }

    const removalQuantity = quantity.abs()

    if (currentBalance.lt(removalQuantity)) {
      throw new ProductValidationError(
        'Cannot remove stock because available stock is insufficient',
      )
    }

    const lots = await this.repository.listFifoLotsForUpdate(tenantId, variantId)
    const plan: FifoPlanItem[] = []
    let remainingToConsume = removalQuantity

    for (const lot of lots) {
      if (remainingToConsume.lte(0)) {
        break
      }

      const available = new Decimal(lot.remainingBaseQty)
      const consume = Decimal.min(available, remainingToConsume)
      const remainingBaseQty = available.minus(consume)

      plan.push({
        lotId: lot.id,
        consumeBaseQty: consume.toFixed(),
        remainingBaseQty: remainingBaseQty.toFixed(),
        unitCostPaisa: lot.unitCostPaisa,
      })
      remainingToConsume = remainingToConsume.minus(consume)
    }

    if (remainingToConsume.gt(0)) {
      throw new ProductValidationError(
        'Cannot remove stock because FIFO lot stock is insufficient',
      )
    }

    const movement = await this.repository.createMovement({
      tenantId,
      variantId,
      movementType: 'ADJUSTMENT_OUT',
      businessDate,
      baseQtyDelta: quantity.toFixed(),
      balanceAfterBaseQty: balanceAfter.toFixed(),
      referenceType: 'STOCK_ADJUSTMENT',
      note,
      createdByUserId: actorUserId,
    })

    for (const item of plan) {
      await this.repository.setLotRemainingQuantity({
        tenantId,
        lotId: item.lotId,
        remainingBaseQty: item.remainingBaseQty,
      })
      await this.repository.createMovementLotAllocation({
        tenantId,
        movementId: movement.id,
        lotId: item.lotId,
        baseQty: item.consumeBaseQty,
        unitCostPaisa: item.unitCostPaisa,
      })
    }
  }

  async updateLotSellingPrice(
    tenantId: string,
    productId: string,
    lotId: string,
    sellingPricePaisa: string,
    actorUserId: string,
  ): Promise<InventoryLotRecord> {
    const normalizedSellingPrice = parseMoneyPaisa(
      sellingPricePaisa,
      'Selling price',
    )

    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new InventoryRepository(database)
        const lot = await repository.lockLotForSellingPriceUpdate(
          tenantId,
          productId,
          lotId,
        )

        if (!lot) {
          throw new ProductNotFoundError('Inventory lot not found')
        }

        if (lot.status !== 'ACTIVE') {
          throw new ProductConflictError(
            'Depleted lot selling price cannot be changed.',
          )
        }

        if (
          lot.defaultSellingPricePaisa === normalizedSellingPrice
        ) {
          return lot
        }

        await repository.updateLotSellingPrice({
          tenantId,
          lotId,
          sellingPricePaisa: normalizedSellingPrice,
        })
        await repository.createLotSellingPriceAudit({
          tenantId,
          lotId,
          oldSellingPricePaisa: lot.defaultSellingPricePaisa,
          newSellingPricePaisa: normalizedSellingPrice,
          changedByUserId: actorUserId,
        })

        return {
          ...lot,
          defaultSellingPricePaisa: normalizedSellingPrice,
        }
      },
    )
  }

  async listLots(
    tenantId: string,
    variantId: string,
  ): Promise<InventoryLotRecord[]> {
    return this.repository.listLots(tenantId, variantId)
  }
}
