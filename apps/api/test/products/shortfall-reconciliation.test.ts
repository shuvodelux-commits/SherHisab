import { afterAll, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'

const hasDatabase = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabase)('sale stock source schema', () => {
  afterAll(async () => {
    await closePool()
  })

  it('creates explicit Vendor, shortfall and reconciliation tables', async () => {
    const result = await getPool().query<{
      sales_line_vendor_allocations: string | null
      inventory_shortfalls: string | null
      inventory_shortfall_reconciliations: string | null
      vendor_sourcing: string | null
    }>(
      `SELECT
         to_regclass('public.sales_line_vendor_allocations')::text
           AS sales_line_vendor_allocations,
         to_regclass('public.inventory_shortfalls')::text
           AS inventory_shortfalls,
         to_regclass('public.inventory_shortfall_reconciliations')::text
           AS inventory_shortfall_reconciliations,
         to_regclass('public.vendor_sourcing')::text
           AS vendor_sourcing`,
    )

    expect(result.rows[0]).toEqual({
      sales_line_vendor_allocations: 'sales_line_vendor_allocations',
      inventory_shortfalls: 'inventory_shortfalls',
      inventory_shortfall_reconciliations:
        'inventory_shortfall_reconciliations',
      vendor_sourcing: 'vendor_sourcing',
    })
  })

  it('indexes oldest outstanding shortfalls by tenant, Variant and creation order', async () => {
    const result = await getPool().query<{ indexdef: string }>(
      `SELECT indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'inventory_shortfalls'`,
    )

    expect(
      result.rows.some(
        (row) =>
          /tenant_id.*variant_id.*created_at.*id/i.test(row.indexdef) &&
          /outstanding_base_qty.*>.*0/i.test(row.indexdef),
      ),
    ).toBe(true)
  })

  it('allows PURCHASE lots and PURCHASE/RETURN inventory movements through additive constraint migration', async () => {
    const lotConstraints = await getPool().query<{ definition: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'inventory_lots'
         AND c.contype = 'c'`,
    )
    const movementConstraints = await getPool().query<{
      definition: string
    }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'inventory_movements'
         AND c.contype = 'c'`,
    )

    expect(
      lotConstraints.rows.some(
        (row) =>
          /source_type/i.test(row.definition) &&
          /PURCHASE/.test(row.definition),
      ),
    ).toBe(true)
    expect(
      movementConstraints.rows.some(
        (row) =>
          /movement_type/i.test(row.definition) &&
          /PURCHASE/.test(row.definition) &&
          /RETURN/.test(row.definition),
      ),
    ).toBe(true)
  })
})
