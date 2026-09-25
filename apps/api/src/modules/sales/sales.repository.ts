import type { DatabaseClient } from '../../db/request-database'
import type {
  AvailableSalesLot,
  CommittedSale,
  CommittedSaleLine,
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

  private async listConfiguredSaleLots(
    tenantId: string,
    variantId: string,
    businessDate: string,
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
       JOIN products p
         ON p.tenant_id = v.tenant_id
        AND p.id = v.product_id
       WHERE l.tenant_id = $1
         AND l.variant_id = $2
         AND v.is_active
         AND p.is_active
         AND l.status = 'ACTIVE'
         AND l.remaining_base_qty > 0
         AND (
           p.tracking_mode <> 'BATCH_EXPIRY'
           OR (
             l.batch_code IS NOT NULL
             AND btrim(l.batch_code) <> ''
             AND l.expires_on IS NOT NULL
             AND l.expires_on >= $3::date
           )
         )
       ORDER BY
         CASE
           WHEN p.tracking_mode = 'BATCH_EXPIRY'
             AND p.allocation_policy = 'FEFO'
           THEN l.expires_on
           ELSE NULL
         END ASC NULLS LAST,
         l.received_on ASC,
         l.id ASC
       ${forUpdate ? 'FOR UPDATE OF l' : ''}`,
      [tenantId, variantId, businessDate],
    )

    return result.rows.map((row) => ({
      id: row.id,
      receivedOn: row.received_on,
      remainingBaseQty: row.remaining_base_qty,
      unitCostPaisa: row.unit_cost_paisa,
      sellingPricePaisa: row.default_sell_price_paisa,
    }))
  }

  listAvailableLotsForSale(
    tenantId: string,
    variantId: string,
    businessDate: string,
  ): Promise<AvailableSalesLot[]> {
    return this.listConfiguredSaleLots(
      tenantId,
      variantId,
      businessDate,
      false,
    )
  }

  listAvailableLotsForSaleForUpdate(
    tenantId: string,
    variantId: string,
    businessDate: string,
  ): Promise<AvailableSalesLot[]> {
    return this.listConfiguredSaleLots(
      tenantId,
      variantId,
      businessDate,
      true,
    )
  }

  async createInvoice(input: {
    tenantId: string
    invoiceNumber: string
    operationId: string | null
    businessDate: string
    createdByUserId: string
  }): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO sales_invoices
       (
         tenant_id,
         invoice_number,
         operation_id,
         business_date,
         created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.tenantId,
        input.invoiceNumber,
        input.operationId,
        input.businessDate,
        input.createdByUserId,
      ],
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

  async findCommittedSaleByOperationId(
    tenantId: string,
    operationId: string,
  ): Promise<CommittedSale | null> {
    const invoiceResult = await this.db.query<{
      id: string
      invoice_number: string | null
      business_date: string
      total_sales_paisa: string
      total_cogs_paisa: string
    }>(
      `SELECT
         id,
         invoice_number,
         business_date::text,
         total_sales_paisa::text,
         total_cogs_paisa::text
       FROM sales_invoices
       WHERE tenant_id = $1
         AND operation_id = $2
       LIMIT 1`,
      [tenantId, operationId],
    )
    const invoice = invoiceResult.rows[0]
    if (!invoice) {
      return null
    }
    if (!invoice.invoice_number) {
      throw new Error('Committed Invoice is missing its Invoice Number')
    }

    const lineResult = await this.db.query<{
      id: string
      variant_id: string
      base_qty: string
      pricing_mode: SalesPricingMode
      manual_unit_selling_price_paisa: string | null
      automatic_sales_total_paisa: string
      final_sales_total_paisa: string
      cogs_paisa: string
    }>(
      `SELECT
         id,
         variant_id,
         trim_scale(base_qty)::text AS base_qty,
         pricing_mode,
         manual_unit_selling_price_paisa::text,
         automatic_sales_total_paisa::text,
         final_sales_total_paisa::text,
         cogs_paisa::text
       FROM sales_lines
       WHERE tenant_id = $1
         AND sale_id = $2
       ORDER BY created_at, id`,
      [tenantId, invoice.id],
    )

    const allocationResult = await this.db.query<{
      sales_line_id: string
      lot_id: string
      received_on: string
      base_qty: string
      unit_cost_paisa: string
      lot_selling_price_paisa: string
      automatic_sales_amount_paisa: string
      cogs_amount_paisa: string
    }>(
      `SELECT
         allocation.sales_line_id,
         allocation.lot_id,
         lot.received_on::text,
         trim_scale(allocation.base_qty)::text AS base_qty,
         allocation.unit_cost_paisa::text,
         allocation.lot_selling_price_paisa::text,
         allocation.automatic_sales_amount_paisa::text,
         allocation.cogs_amount_paisa::text
       FROM sales_line_lot_allocations allocation
       JOIN sales_lines line
         ON line.tenant_id = allocation.tenant_id
        AND line.id = allocation.sales_line_id
       JOIN inventory_lots lot
         ON lot.tenant_id = allocation.tenant_id
        AND lot.id = allocation.lot_id
       WHERE allocation.tenant_id = $1
         AND line.sale_id = $2
       ORDER BY line.created_at, line.id, allocation.created_at, allocation.lot_id`,
      [tenantId, invoice.id],
    )

    const allocationsByLine = new Map<string, SalesFifoAllocation[]>()
    for (const row of allocationResult.rows) {
      const allocations = allocationsByLine.get(row.sales_line_id) ?? []
      allocations.push({
        lotId: row.lot_id,
        receivedOn: row.received_on,
        baseQty: row.base_qty,
        unitCostPaisa: row.unit_cost_paisa,
        lotSellingPricePaisa: row.lot_selling_price_paisa,
        automaticSalesAmountPaisa: row.automatic_sales_amount_paisa,
        cogsAmountPaisa: row.cogs_amount_paisa,
      })
      allocationsByLine.set(row.sales_line_id, allocations)
    }

    const lines: CommittedSaleLine[] = lineResult.rows.map((row) => {
      const grossProfit =
        BigInt(row.final_sales_total_paisa) - BigInt(row.cogs_paisa)
      const belowCost = grossProfit < 0n

      return {
        id: row.id,
        variantId: row.variant_id,
        baseQty: row.base_qty,
        pricingMode: row.pricing_mode,
        manualUnitSellingPricePaisa:
          row.manual_unit_selling_price_paisa,
        automaticSalesTotalPaisa:
          row.automatic_sales_total_paisa,
        finalSalesTotalPaisa: row.final_sales_total_paisa,
        cogsPaisa: row.cogs_paisa,
        grossProfitPaisa: grossProfit.toString(),
        belowCost,
        lossPaisa: belowCost ? (-grossProfit).toString() : '0',
        allocations: allocationsByLine.get(row.id) ?? [],
      }
    })
    const grossProfit =
      BigInt(invoice.total_sales_paisa) -
      BigInt(invoice.total_cogs_paisa)

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      businessDate: invoice.business_date,
      totalSalesPaisa: invoice.total_sales_paisa,
      totalCogsPaisa: invoice.total_cogs_paisa,
      grossProfitPaisa: grossProfit.toString(),
      lines,
    }
  }

}
