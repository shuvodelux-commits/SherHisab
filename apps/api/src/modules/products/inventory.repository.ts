import type { DatabaseClient } from '../../db/request-database'

export interface CreateInventoryLotInput {
  tenantId: string
  variantId: string
  sourceType: 'OPENING' | 'ADJUSTMENT' | 'PURCHASE'
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
  movementType:
    | 'OPENING'
    | 'ADJUSTMENT_IN'
    | 'ADJUSTMENT_OUT'
    | 'SALE'
    | 'PURCHASE'
    | 'RETURN'
  businessDate: string
  baseQtyDelta: string
  balanceAfterBaseQty: string
  referenceType: string
  note?: string
  createdByUserId?: string | null
}

export interface LockedVariantInventoryDefaults {
  id: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
}

export interface FifoInventoryLot {
  id: string
  receivedOn: string
  remainingBaseQty: string
  unitCostPaisa: string
  defaultSellingPricePaisa: string
  status: 'ACTIVE' | 'DEPLETED'
}

export interface InventoryLotRecord extends FifoInventoryLot {
  sourceType: 'OPENING' | 'ADJUSTMENT' | 'PURCHASE'
  originalBaseQty: string
  lotCode: string | null
  batchCode: string | null
  expiresOn: string | null
}

export class InventoryRepository {
  constructor(private readonly db: DatabaseClient) {}

  async lockActiveVariant(
    tenantId: string,
    variantId: string,
  ): Promise<LockedVariantInventoryDefaults | null> {
    const result = await this.db.query<{
      id: string
      default_purchase_price_paisa: string
      default_selling_price_paisa: string
    }>(
      `SELECT id,
              default_purchase_price_paisa::text,
              default_selling_price_paisa::text
       FROM product_variants
       WHERE tenant_id = $1
         AND id = $2
         AND is_active
       FOR UPDATE`,
      [tenantId, variantId],
    )

    const row = result.rows[0]
    return row
      ? {
          id: row.id,
          defaultPurchasePricePaisa: row.default_purchase_price_paisa,
          defaultSellingPricePaisa: row.default_selling_price_paisa,
        }
      : null
  }

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

  async listFifoLotsForUpdate(
    tenantId: string,
    variantId: string,
  ): Promise<FifoInventoryLot[]> {
    const result = await this.db.query<{
      id: string
      received_on: string
      remaining_base_qty: string
      unit_cost_paisa: string
      default_sell_price_paisa: string
      status: 'ACTIVE' | 'DEPLETED'
    }>(
      `SELECT id,
              received_on::text,
              trim_scale(remaining_base_qty)::text AS remaining_base_qty,
              unit_cost_paisa::text,
              default_sell_price_paisa::text,
              status
       FROM inventory_lots
       WHERE tenant_id = $1
         AND variant_id = $2
         AND remaining_base_qty > 0
         AND status = 'ACTIVE'
       ORDER BY received_on ASC, id ASC
       FOR UPDATE`,
      [tenantId, variantId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      receivedOn: row.received_on,
      remainingBaseQty: row.remaining_base_qty,
      unitCostPaisa: row.unit_cost_paisa,
      defaultSellingPricePaisa: row.default_sell_price_paisa,
      status: row.status,
    }))
  }

  async setLotRemainingQuantity(input: {
    tenantId: string
    lotId: string
    remainingBaseQty: string
  }): Promise<void> {
    await this.db.query(
      `UPDATE inventory_lots
       SET remaining_base_qty = $3,
           status = CASE
             WHEN $3::numeric = 0 THEN 'DEPLETED'
             ELSE 'ACTIVE'
           END,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2`,
      [input.tenantId, input.lotId, input.remainingBaseQty],
    )
  }

  async lockLotForSellingPriceUpdate(
    tenantId: string,
    productId: string,
    lotId: string,
  ): Promise<InventoryLotRecord | null> {
    const result = await this.db.query<{
      id: string
      received_on: string
      source_type: 'OPENING' | 'ADJUSTMENT' | 'PURCHASE'
      original_base_qty: string
      remaining_base_qty: string
      unit_cost_paisa: string
      default_sell_price_paisa: string
      status: 'ACTIVE' | 'DEPLETED'
      lot_code: string | null
      batch_code: string | null
      expires_on: string | null
    }>(
      `SELECT
         l.id,
         l.received_on::text,
         l.source_type,
         trim_scale(l.original_base_qty)::text AS original_base_qty,
         trim_scale(l.remaining_base_qty)::text AS remaining_base_qty,
         l.unit_cost_paisa::text,
         l.default_sell_price_paisa::text,
         l.status,
         l.lot_code,
         l.batch_code,
         l.expires_on::text
       FROM inventory_lots l
       JOIN product_variants v
         ON v.tenant_id = l.tenant_id
        AND v.id = l.variant_id
       WHERE l.tenant_id = $1
         AND l.id = $2
         AND v.product_id = $3
       FOR UPDATE OF l`,
      [tenantId, lotId, productId],
    )

    const row = result.rows[0]

    return row
      ? {
          id: row.id,
          receivedOn: row.received_on,
          sourceType: row.source_type,
          originalBaseQty: row.original_base_qty,
          remainingBaseQty: row.remaining_base_qty,
          unitCostPaisa: row.unit_cost_paisa,
          defaultSellingPricePaisa: row.default_sell_price_paisa,
          status: row.status,
          lotCode: row.lot_code,
          batchCode: row.batch_code,
          expiresOn: row.expires_on,
        }
      : null
  }

  async updateLotSellingPrice(input: {
    tenantId: string
    lotId: string
    sellingPricePaisa: string
  }): Promise<void> {
    await this.db.query(
      `UPDATE inventory_lots
       SET default_sell_price_paisa = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2`,
      [input.tenantId, input.lotId, input.sellingPricePaisa],
    )
  }

  async createLotSellingPriceAudit(input: {
    tenantId: string
    lotId: string
    oldSellingPricePaisa: string
    newSellingPricePaisa: string
    changedByUserId: string
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO inventory_lot_selling_price_audit
       (
         tenant_id,
         lot_id,
         old_selling_price_paisa,
         new_selling_price_paisa,
         changed_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.tenantId,
        input.lotId,
        input.oldSellingPricePaisa,
        input.newSellingPricePaisa,
        input.changedByUserId,
      ],
    )
  }

  async listLots(
    tenantId: string,
    variantId: string,
  ): Promise<InventoryLotRecord[]> {
    const result = await this.db.query<{
      id: string
      received_on: string
      source_type: 'OPENING' | 'ADJUSTMENT' | 'PURCHASE'
      original_base_qty: string
      remaining_base_qty: string
      unit_cost_paisa: string
      default_sell_price_paisa: string
      status: 'ACTIVE' | 'DEPLETED'
      lot_code: string | null
      batch_code: string | null
      expires_on: string | null
    }>(
      `SELECT id,
              received_on::text,
              source_type,
              trim_scale(original_base_qty)::text AS original_base_qty,
              trim_scale(remaining_base_qty)::text AS remaining_base_qty,
              unit_cost_paisa::text,
              default_sell_price_paisa::text,
              status,
              lot_code,
              batch_code,
              expires_on::text
       FROM inventory_lots
       WHERE tenant_id = $1
         AND variant_id = $2
       ORDER BY received_on ASC, id ASC`,
      [tenantId, variantId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      receivedOn: row.received_on,
      sourceType: row.source_type,
      originalBaseQty: row.original_base_qty,
      remainingBaseQty: row.remaining_base_qty,
      unitCostPaisa: row.unit_cost_paisa,
      defaultSellingPricePaisa: row.default_sell_price_paisa,
      status: row.status,
      lotCode: row.lot_code,
      batchCode: row.batch_code,
      expiresOn: row.expires_on,
    }))
  }
}
