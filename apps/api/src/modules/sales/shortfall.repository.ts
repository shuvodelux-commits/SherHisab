import type { DatabaseClient } from '../../db/request-database'

export interface InventoryShortfallRecord {
  id: string
  salesLineId: string
  variantId: string
  originalShortfallBaseQty: string
  outstandingBaseQty: string
  provisionalUnitCostPaisa: string
}

interface ShortfallRow {
  id: string
  sales_line_id: string
  variant_id: string
  original_shortfall_base_qty: string
  outstanding_base_qty: string
  provisional_unit_cost_paisa: string
}

export class ShortfallRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: {
    tenantId: string
    salesLineId: string
    variantId: string
    shortfallBaseQty: string
    provisionalUnitCostPaisa: string
  }): Promise<InventoryShortfallRecord> {
    const result = await this.db.query<ShortfallRow>(
      `INSERT INTO inventory_shortfalls
       (
         tenant_id,
         sales_line_id,
         variant_id,
         original_shortfall_base_qty,
         outstanding_base_qty,
         provisional_unit_cost_paisa
       )
       VALUES ($1,$2,$3,$4,$4,$5)
       RETURNING
         id,
         sales_line_id,
         variant_id,
         trim_scale(original_shortfall_base_qty)::text
           AS original_shortfall_base_qty,
         trim_scale(outstanding_base_qty)::text
           AS outstanding_base_qty,
         provisional_unit_cost_paisa::text`,
      [
        input.tenantId,
        input.salesLineId,
        input.variantId,
        input.shortfallBaseQty,
        input.provisionalUnitCostPaisa,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create inventory shortfall')
    }
    return {
      id: row.id,
      salesLineId: row.sales_line_id,
      variantId: row.variant_id,
      originalShortfallBaseQty:
        row.original_shortfall_base_qty,
      outstandingBaseQty: row.outstanding_base_qty,
      provisionalUnitCostPaisa:
        row.provisional_unit_cost_paisa,
    }
  }

  async listOutstandingForUpdate(
    tenantId: string,
    variantId: string,
  ): Promise<InventoryShortfallRecord[]> {
    const result = await this.db.query<ShortfallRow>(
      `SELECT
         id,
         sales_line_id,
         variant_id,
         trim_scale(original_shortfall_base_qty)::text
           AS original_shortfall_base_qty,
         trim_scale(outstanding_base_qty)::text
           AS outstanding_base_qty,
         provisional_unit_cost_paisa::text
       FROM inventory_shortfalls
       WHERE tenant_id = $1
         AND variant_id = $2
         AND outstanding_base_qty > 0
       ORDER BY created_at, id
       FOR UPDATE`,
      [tenantId, variantId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      salesLineId: row.sales_line_id,
      variantId: row.variant_id,
      originalShortfallBaseQty:
        row.original_shortfall_base_qty,
      outstandingBaseQty: row.outstanding_base_qty,
      provisionalUnitCostPaisa:
        row.provisional_unit_cost_paisa,
    }))
  }

  async updateOutstanding(input: {
    tenantId: string
    shortfallId: string
    outstandingBaseQty: string
  }): Promise<void> {
    await this.db.query(
      `UPDATE inventory_shortfalls
       SET outstanding_base_qty = $3,
           reconciled_at = CASE
             WHEN $3::numeric = 0 THEN NOW()
             ELSE NULL
           END
       WHERE tenant_id = $1 AND id = $2`,
      [
        input.tenantId,
        input.shortfallId,
        input.outstandingBaseQty,
      ],
    )
  }

  async createReconciliation(input: {
    tenantId: string
    shortfallId: string
    purchaseLotId: string
    reconciledBaseQty: string
    provisionalUnitCostPaisa: string
    actualUnitCostPaisa: string
    cogsAdjustmentPaisa: string
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO inventory_shortfall_reconciliations
       (
         tenant_id,
         shortfall_id,
         purchase_lot_id,
         reconciled_base_qty,
         provisional_unit_cost_paisa,
         actual_unit_cost_paisa,
         cogs_adjustment_paisa
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.tenantId,
        input.shortfallId,
        input.purchaseLotId,
        input.reconciledBaseQty,
        input.provisionalUnitCostPaisa,
        input.actualUnitCostPaisa,
        input.cogsAdjustmentPaisa,
      ],
    )
  }

}
