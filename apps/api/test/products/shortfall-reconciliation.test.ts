import { randomUUID } from 'node:crypto'
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { InventoryReceiptService } from '../../src/modules/products/inventory-receipt.service'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

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


async function createOutstandingShortfallFixture(
  provisionalPurchasePricePaisa = '80',
) {
  const tenant = await createProductTestTenant(
    'Purchase Reconciliation',
  )
  const auth = new AuthService()
  const password = 'strong-password-123'
  const user = await auth.createUser({
    tenantId: tenant.id,
    name: 'Purchase Reconciliation Owner',
    email: `receipt-${randomUUID()}@example.com`,
    password,
    role: 'OWNER',
  })
  const products = new ProductMasterService(tenant.id, getPool())
  const unit = (await products.listUnits()).find(
    (candidate) => candidate.symbol === 'pcs',
  )
  if (!unit) {
    throw new Error('Default Piece unit not found')
  }
  const product = await products.createProduct(
    {
      name: 'Purchase Reconciliation Product',
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: provisionalPurchasePricePaisa,
      defaultSellingPricePaisa: '100',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    user.id,
  )
  const inventory = new InventoryService(getPool())
  await inventory.adjustStock(
    tenant.id,
    user.id,
    product.defaultVariantId,
    {
      deltaBaseQty: '5',
      note: 'Shortfall fixture stock',
      unitCostPaisa: '50',
      sellingPricePaisa: '100',
      businessDate: '2026-09-01',
    },
  )

  const login = await app.request(
    'http://localhost/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: tenant.slug,
        email: user.email,
        password,
      }),
    },
  )
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  if (
    login.status !== 200 ||
    !cookie?.startsWith(`${SESSION_COOKIE_NAME}=`)
  ) {
    throw new Error('Purchase reconciliation login failed')
  }

  const sale = await app.request(
    'http://localhost/api/private/sales',
    {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        operationId: randomUUID(),
        businessDate: '2026-09-25',
        customer: {
          name: 'Shortfall Buyer',
          phone: '01712345678',
        },
        discountPaisa: '0',
        lines: [
          {
            variantId: product.defaultVariantId,
            baseQty: '10',
            shortageResolution: { type: 'NEGATIVE_STOCK' },
          },
        ],
        payments: [
          {
            clientLineId: 'cash',
            method: 'CASH',
            amountPaisa: '1000',
          },
        ],
      }),
    },
  )
  if (sale.status !== 201) {
    throw new Error(
      `Shortfall fixture sale failed: ${await sale.text()}`,
    )
  }

  return { tenant, user, product, inventory }
}

describe.skipIf(!hasDatabase)(
  'Purchase receipt shortfall reconciliation',
  () => {
    afterEach(async () => {
      await cleanupProductTestTenants()
    })

    it('keeps the full Purchase lot provenance while oldest shortfall consumption leaves only the unreconciled receipt physically available', async () => {
      const fixture =
        await createOutstandingShortfallFixture('80')

      const result = await new InventoryReceiptService(
        getPool(),
      ).receivePurchase({
        tenantId: fixture.tenant.id,
        actorUserId: fixture.user.id,
        variantId: fixture.product.defaultVariantId,
        businessDate: '2026-09-26',
        sourceReference: 'PUR-000001',
        receivedBaseQty: '20',
        unitCostPaisa: '80',
        sellingPricePaisa: '110',
      })

      expect(result).toMatchObject({
        receivedBaseQty: '20',
        reconciledBaseQty: '5',
        remainingPhysicalBaseQty: '15',
      })

      const lots = await getPool().query<{
        source_type: string
        original_base_qty: string
        remaining_base_qty: string
        unit_cost_paisa: string
      }>(
        `SELECT
           source_type,
           trim_scale(original_base_qty)::text AS original_base_qty,
           trim_scale(remaining_base_qty)::text AS remaining_base_qty,
           unit_cost_paisa::text
         FROM inventory_lots
         WHERE tenant_id = $1
           AND variant_id = $2
           AND source_type = 'PURCHASE'`,
        [
          fixture.tenant.id,
          fixture.product.defaultVariantId,
        ],
      )
      expect(lots.rows).toEqual([
        {
          source_type: 'PURCHASE',
          original_base_qty: '20',
          remaining_base_qty: '15',
          unit_cost_paisa: '80',
        },
      ])

      const shortfall = await getPool().query<{
        outstanding_base_qty: string
        reconciled_at: Date | null
      }>(
        `SELECT
           trim_scale(outstanding_base_qty)::text
             AS outstanding_base_qty,
           reconciled_at
         FROM inventory_shortfalls
         WHERE tenant_id = $1
           AND variant_id = $2`,
        [
          fixture.tenant.id,
          fixture.product.defaultVariantId,
        ],
      )
      expect(shortfall.rows).toEqual([
        {
          outstanding_base_qty: '0',
          reconciled_at: expect.any(Date),
        },
      ])

      const reconciliations = await getPool().query<{
        reconciled_base_qty: string
        provisional_unit_cost_paisa: string
        actual_unit_cost_paisa: string
        cogs_adjustment_paisa: string
      }>(
        `SELECT
           trim_scale(reconciled_base_qty)::text
             AS reconciled_base_qty,
           provisional_unit_cost_paisa::text,
           actual_unit_cost_paisa::text,
           cogs_adjustment_paisa::text
         FROM inventory_shortfall_reconciliations
         WHERE tenant_id = $1`,
        [fixture.tenant.id],
      )
      expect(reconciliations.rows).toEqual([
        {
          reconciled_base_qty: '5',
          provisional_unit_cost_paisa: '80',
          actual_unit_cost_paisa: '80',
          cogs_adjustment_paisa: '0',
        },
      ])

      const balance = await getPool().query<{ balance: string }>(
        `SELECT trim_scale(
           COALESCE(SUM(base_qty_delta), 0)
         )::text AS balance
         FROM inventory_movements
         WHERE tenant_id = $1
           AND variant_id = $2`,
        [
          fixture.tenant.id,
          fixture.product.defaultVariantId,
        ],
      )
      expect(balance.rows[0]?.balance).toBe('15')
    })
  },
)
