import type { DatabaseClient } from '../../db/request-database'

export class VendorSourceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async lockActiveVendor(
    tenantId: string,
    vendorId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id
       FROM vendors
       WHERE tenant_id = $1
         AND id = $2
         AND is_active
       FOR SHARE`,
      [tenantId, vendorId],
    )
    return Boolean(result.rows[0])
  }

  async createSourcing(input: {
    tenantId: string
    salesLineId: string
    vendorId: string
    variantId: string
    businessDate: string
    baseQty: string
    unitCostPaisa: string
    totalCostPaisa: string
  }): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO vendor_sourcing
       (
         tenant_id,
         sales_line_id,
         vendor_id,
         variant_id,
         business_date,
         base_qty,
         unit_cost_paisa,
         total_cost_paisa
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        input.tenantId,
        input.salesLineId,
        input.vendorId,
        input.variantId,
        input.businessDate,
        input.baseQty,
        input.unitCostPaisa,
        input.totalCostPaisa,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create Vendor sourcing')
    }
    return row
  }

  async createLineAllocation(input: {
    tenantId: string
    salesLineId: string
    vendorSourcingId: string
    vendorId: string
    baseQty: string
    unitCostPaisa: string
    totalCostPaisa: string
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO sales_line_vendor_allocations
       (
         tenant_id,
         sales_line_id,
         vendor_sourcing_id,
         vendor_id,
         base_qty,
         unit_cost_paisa,
         total_cost_paisa
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.tenantId,
        input.salesLineId,
        input.vendorSourcingId,
        input.vendorId,
        input.baseQty,
        input.unitCostPaisa,
        input.totalCostPaisa,
      ],
    )
  }

  async createPayable(input: {
    tenantId: string
    vendorId: string
    businessDate: string
    amountPaisa: string
    vendorSourcingId: string
  }): Promise<void> {
    if (BigInt(input.amountPaisa) === 0n) {
      return
    }

    await this.db.query(
      `INSERT INTO vendor_ledger_entries
       (
         tenant_id,
         vendor_id,
         business_date,
         entry_type,
         amount_paisa,
         source_type,
         source_id,
         notes
       )
       VALUES ($1,$2,$3,'VENDOR_DUE',$4,'SALE',$5,'')`,
      [
        input.tenantId,
        input.vendorId,
        input.businessDate,
        input.amountPaisa,
        input.vendorSourcingId,
      ],
    )
  }
}
