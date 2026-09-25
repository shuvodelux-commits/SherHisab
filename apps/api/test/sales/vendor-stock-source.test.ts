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
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { VendorService } from '../../src/modules/vendors/vendor.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createFixture() {
  const tenant = await createProductTestTenant('Vendor Sale Source')
  const password = 'strong-password-123'
  const auth = new AuthService()
  const user = await auth.createUser({
    tenantId: tenant.id,
    name: 'Vendor Source Owner',
    email: `vendor-source-${randomUUID()}@example.com`,
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
      name: 'Vendor Source Product',
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '70',
      defaultSellingPricePaisa: '100',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    user.id,
  )
  await new InventoryService(getPool()).adjustStock(
    tenant.id,
    user.id,
    product.defaultVariantId,
    {
      deltaBaseQty: '5',
      note: 'Vendor source fixture',
      unitCostPaisa: '50',
      sellingPricePaisa: '100',
      businessDate: '2026-09-01',
    },
  )

  const vendor = await new VendorService(
    tenant.id,
    getPool(),
  ).create({
    name: 'Vendor Source Supplier',
    phone: '01770000000',
  })

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
    throw new Error('Vendor source login failed')
  }

  return { tenant, product, vendor, cookie }
}

describe.skipIf(!hasDatabase)('Vendor sale source', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('uses the Vendor only for the shortfall and posts the exact payable', async () => {
    const fixture = await createFixture()

    const response = await app.request(
      'http://localhost/api/private/sales',
      {
        method: 'POST',
        headers: {
          cookie: fixture.cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          operationId: randomUUID(),
          businessDate: '2026-09-25',
          customer: {
            name: 'Vendor Buyer',
            phone: '01710000001',
          },
          discountPaisa: '0',
          lines: [
            {
              variantId: fixture.product.defaultVariantId,
              baseQty: '10',
              shortageResolution: {
                type: 'VENDOR',
                vendorId: fixture.vendor.id,
                unitCostPaisa: '80',
              },
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

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      grandTotalPaisa: '1000',
      totalCogsPaisa: '650',
      lines: [
        expect.objectContaining({
          baseQty: '10',
          cogsPaisa: '650',
        }),
      ],
    })

    const sourcing = await getPool().query<{
      sales_line_id: string
      vendor_id: string
      base_qty: string
      unit_cost_paisa: string
      total_cost_paisa: string
      status: string
    }>(
      `SELECT
         sales_line_id,
         vendor_id,
         trim_scale(base_qty)::text AS base_qty,
         unit_cost_paisa::text,
         total_cost_paisa::text,
         status
       FROM vendor_sourcing
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(sourcing.rows).toEqual([
      {
        sales_line_id: expect.any(String),
        vendor_id: fixture.vendor.id,
        base_qty: '5',
        unit_cost_paisa: '80',
        total_cost_paisa: '400',
        status: 'OPEN',
      },
    ])

    const allocations = await getPool().query<{
      vendor_sourcing_id: string
      vendor_id: string
      base_qty: string
      unit_cost_paisa: string
      total_cost_paisa: string
    }>(
      `SELECT
         vendor_sourcing_id,
         vendor_id,
         trim_scale(base_qty)::text AS base_qty,
         unit_cost_paisa::text,
         total_cost_paisa::text
       FROM sales_line_vendor_allocations
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(allocations.rows).toEqual([
      {
        vendor_sourcing_id: expect.any(String),
        vendor_id: fixture.vendor.id,
        base_qty: '5',
        unit_cost_paisa: '80',
        total_cost_paisa: '400',
      },
    ])

    const ledger = await getPool().query<{
      amount_paisa: string
      entry_type: string
      source_type: string
    }>(
      `SELECT
         amount_paisa::text,
         entry_type,
         source_type
       FROM vendor_ledger_entries
       WHERE tenant_id = $1
         AND vendor_id = $2`,
      [fixture.tenant.id, fixture.vendor.id],
    )
    expect(ledger.rows).toEqual([
      {
        amount_paisa: '400',
        entry_type: 'VENDOR_DUE',
        source_type: 'SALE',
      },
    ])

    const lots = await getPool().query<{
      original_base_qty: string
      remaining_base_qty: string
    }>(
      `SELECT
         trim_scale(original_base_qty)::text AS original_base_qty,
         trim_scale(remaining_base_qty)::text AS remaining_base_qty
       FROM inventory_lots
       WHERE tenant_id = $1
         AND variant_id = $2
       ORDER BY received_on, id`,
      [fixture.tenant.id, fixture.product.defaultVariantId],
    )
    expect(lots.rows).toEqual([
      {
        original_base_qty: '5',
        remaining_base_qty: '0',
      },
    ])

    const balance = await getPool().query<{ balance: string }>(
      `SELECT trim_scale(
         COALESCE(SUM(base_qty_delta), 0)
       )::text AS balance
       FROM inventory_movements
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [fixture.tenant.id, fixture.product.defaultVariantId],
    )
    expect(balance.rows[0]?.balance).toBe('0')
  })
})
