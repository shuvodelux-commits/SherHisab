import Decimal from 'decimal.js'
import type { DatabaseClient } from '../../db/request-database'
import { InventoryRepository } from './inventory.repository'

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
}
