import type { DatabaseClient } from '../../db/request-database'
import type { AvailableSalesLot } from './sales.types'

export class SalesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async listAvailableFifoLots(
    tenantId: string,
    variantId: string,
  ): Promise<AvailableSalesLot[]> {
    const result = await this.db.query<{
      id: string
      received_on: string
      remaining_base_qty: string
      unit_cost_paisa: string
      default_sell_price_paisa: string
    }>(
      `SELECT
         l.id,
         l.received_on::text,
         trim_scale(l.remaining_base_qty)::text AS remaining_base_qty,
         l.unit_cost_paisa::text,
         l.default_sell_price_paisa::text
       FROM inventory_lots l
       JOIN product_variants v
         ON v.tenant_id = l.tenant_id
        AND v.id = l.variant_id
       WHERE l.tenant_id = $1
         AND l.variant_id = $2
         AND v.is_active
         AND l.status = 'ACTIVE'
         AND l.remaining_base_qty > 0
       ORDER BY l.received_on ASC, l.id ASC`,
      [tenantId, variantId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      receivedOn: row.received_on,
      remainingBaseQty: row.remaining_base_qty,
      unitCostPaisa: row.unit_cost_paisa,
      sellingPricePaisa: row.default_sell_price_paisa,
    }))
  }
}
