import type { DatabaseClient } from '../../db/request-database'
import type {
  AvailableSalesLot,
  SalesFifoAllocation,
  SalesPricingMode,
} from './sales.types'

export class SalesRepository {
  constructor(private readonly db: DatabaseClient) {}

  private async listLots(
    tenantId: string,
    variantId: string,
    forUpdate: boolean,
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
       ORDER BY l.received_on ASC, l.id ASC
       ${forUpdate ? 'FOR UPDATE OF l' : ''}`,
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

  listAvailableFifoLots(
    tenantId: string,
    variantId: string,
  ): Promise<AvailableSalesLot[]> {
    return this.listLots(tenantId, variantId, false)
  }

  listAvailableFifoLotsForUpdate(
    tenantId: string,
    variantId: string,
  ): Promise<AvailableSalesLot[]> {
    return this.listLots(tenantId, variantId, true)
  }

  async createInvoice(input: {
    tenantId: string
    businessDate: string
    createdByUserId: string
  }): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO sales_invoices
       (tenant_id, business_date, created_by_user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.tenantId, input.businessDate, input.createdByUserId],
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create sales invoice')
    }

    return row
  }

  async updateInvoiceTotals(input: {
    tenantId: string
    saleId: string
    totalSalesPaisa: string
    totalCogsPaisa: string
  }): Promise<void> {
    await this.db.query(
      `UPDATE sales_invoices
       SET total_sales_paisa = $3,
           total_cogs_paisa = $4
       WHERE tenant_id = $1 AND id = $2`,
      [
        input.tenantId,
        input.saleId,
        input.totalSalesPaisa,
        input.totalCogsPaisa,
      ],
    )
  }

  async createLine(input: {
    tenantId: string
    saleId: string
    variantId: string
    baseQty: string
    pricingMode: SalesPricingMode
    automaticSalesTotalPaisa: string
    manualUnitSellingPricePaisa: string | null
    finalSalesTotalPaisa: string
    cogsPaisa: string
  }): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO sales_lines
       (
         tenant_id,
         sale_id,
         variant_id,
         base_qty,
         pricing_mode,
         automatic_sales_total_paisa,
         manual_unit_selling_price_paisa,
         final_sales_total_paisa,
         cogs_paisa
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.tenantId,
        input.saleId,
        input.variantId,
        input.baseQty,
        input.pricingMode,
        input.automaticSalesTotalPaisa,
        input.manualUnitSellingPricePaisa,
        input.finalSalesTotalPaisa,
        input.cogsPaisa,
      ],
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create sales line')
    }

    return row
  }

  async createLineAllocation(input: {
    tenantId: string
    salesLineId: string
    allocation: SalesFifoAllocation
  }): Promise<void> {
    const allocation = input.allocation

    await this.db.query(
      `INSERT INTO sales_line_lot_allocations
       (
         tenant_id,
         sales_line_id,
         lot_id,
         base_qty,
         unit_cost_paisa,
         lot_selling_price_paisa,
         automatic_sales_amount_paisa,
         cogs_amount_paisa
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.tenantId,
        input.salesLineId,
        allocation.lotId,
        allocation.baseQty,
        allocation.unitCostPaisa,
        allocation.lotSellingPricePaisa,
        allocation.automaticSalesAmountPaisa,
        allocation.cogsAmountPaisa,
      ],
    )
  }
}
