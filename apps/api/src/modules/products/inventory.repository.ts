import type { DatabaseClient } from '../../db/request-database'

export interface CreateInventoryLotInput {
  tenantId: string
  variantId: string
  sourceType: 'OPENING' | 'ADJUSTMENT'
  receivedOn: string
  unitCostPaisa: string
  defaultSellPricePaisa: string
  baseQty: string
  lotCode?: string | null
  batchCode?: string | null
  expiresOn?: string | null
}

export interface CreateInventoryMovementInput {
  tenantId: string
  variantId: string
  movementType: 'OPENING' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'
  businessDate: string
  baseQtyDelta: string
  balanceAfterBaseQty: string
  referenceType: string
  note?: string
  createdByUserId?: string | null
}

export class InventoryRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createLot(input: CreateInventoryLotInput): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO inventory_lots
       (
         tenant_id,
         variant_id,
         source_type,
         received_on,
         unit_cost_paisa,
         default_sell_price_paisa,
         original_base_qty,
         remaining_base_qty,
         lot_code,
         batch_code,
         expires_on
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.tenantId,
        input.variantId,
        input.sourceType,
        input.receivedOn,
        input.unitCostPaisa,
        input.defaultSellPricePaisa,
        input.baseQty,
        input.lotCode ?? null,
        input.batchCode ?? null,
        input.expiresOn ?? null,
      ],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create inventory lot')
    }

    return row
  }

  async createMovement(
    input: CreateInventoryMovementInput,
  ): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO inventory_movements
       (
         tenant_id,
         variant_id,
         movement_type,
         business_date,
         base_qty_delta,
         balance_after_base_qty,
         reference_type,
         note,
         created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.tenantId,
        input.variantId,
        input.movementType,
        input.businessDate,
        input.baseQtyDelta,
        input.balanceAfterBaseQty,
        input.referenceType,
        input.note ?? '',
        input.createdByUserId ?? null,
      ],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create inventory movement')
    }

    return row
  }

  async createMovementLotAllocation(input: {
    tenantId: string
    movementId: string
    lotId: string
    baseQty: string
    unitCostPaisa: string
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO inventory_movement_lot_allocations
       (tenant_id, movement_id, lot_id, base_qty, unit_cost_paisa)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.tenantId,
        input.movementId,
        input.lotId,
        input.baseQty,
        input.unitCostPaisa,
      ],
    )
  }

  async getVariantBalance(
    tenantId: string,
    variantId: string,
  ): Promise<string> {
    const result = await this.db.query<{ balance: string }>(
      `SELECT trim_scale(COALESCE(SUM(base_qty_delta), 0))::text AS balance
       FROM inventory_movements
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenantId, variantId],
    )

    return result.rows[0]?.balance ?? '0'
  }
}
