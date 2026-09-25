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
import {
  StockSourceService,
  type InternalLotAllocation,
} from '../../src/modules/sales/stock-source.service'

function ownAllocation(
  baseQty: string,
  unitCostPaisa = '100',
): InternalLotAllocation {
  return {
    lotId: 'lot-1',
    baseQty,
    unitCostPaisa,
    lotSellingPricePaisa: '150',
    automaticSalesAmountPaisa: (
      BigInt(baseQty) * 150n
    ).toString(),
    cogsAmountPaisa: (
      BigInt(baseQty) * BigInt(unitCostPaisa)
    ).toString(),
  }
}

describe('StockSourceService', () => {
  it('reports a 5-unit shortfall when own stock is 5 and requested quantity is 10', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [ownAllocation('5')],
      shortageResolution: null,
    })

    expect(result).toEqual({
      type: 'PLAN',
      plan: {
        requestedBaseQty: '10',
        ownBaseQty: '5',
        shortfallBaseQty: '5',
        ownAllocations: [ownAllocation('5')],
        shortageResolution: null,
      },
    })
  })

  it('clamps requested quantity to available own stock when OWN_STOCK is selected', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [ownAllocation('5')],
      shortageResolution: { type: 'OWN_STOCK' },
    })

    expect(result).toEqual({
      type: 'PLAN',
      plan: {
        requestedBaseQty: '5',
        ownBaseQty: '5',
        shortfallBaseQty: '0',
        ownAllocations: [ownAllocation('5')],
        shortageResolution: null,
      },
    })
  })

  it('returns an explicit line-removal decision when OWN_STOCK is selected with zero own stock', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [],
      shortageResolution: { type: 'OWN_STOCK' },
    })

    expect(result).toEqual({
      type: 'REMOVE_LINE',
      reason: 'NO_OWN_STOCK',
      plan: {
        requestedBaseQty: '0',
        ownBaseQty: '0',
        shortfallBaseQty: '0',
        ownAllocations: [],
        shortageResolution: null,
      },
    })
  })

  it('accepts exactly one Negative Stock resolution for the whole shortfall', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [ownAllocation('5')],
      shortageResolution: { type: 'NEGATIVE_STOCK' },
    })

    expect(result).toMatchObject({
      type: 'PLAN',
      plan: {
        requestedBaseQty: '10',
        ownBaseQty: '5',
        shortfallBaseQty: '5',
        shortageResolution: { type: 'NEGATIVE_STOCK' },
      },
    })
  })

  it('rejects a mixed Vendor and Negative Stock resolution', () => {
    const mixedResolution = {
      type: 'NEGATIVE_STOCK',
      vendorId: 'vendor-1',
      unitCostPaisa: '80',
    }

    expect(() =>
      new StockSourceService().plan({
        requestedBaseQty: '10',
        ownAllocations: [ownAllocation('5')],
        shortageResolution:
          mixedResolution as unknown as {
            type: 'NEGATIVE_STOCK'
          },
      }),
    ).toThrow(/one shortage.*one resolution|mixed.*resolution/i)
  })
})


const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createNegativeStockFixture() {
  const tenant = await createProductTestTenant(
    'Negative Stock Source',
  )
  const auth = new AuthService()
  const password = 'strong-password-123'
  const user = await auth.createUser({
    tenantId: tenant.id,
    name: 'Negative Stock Owner',
    email: `negative-${randomUUID()}@example.com`,
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
      name: 'Negative Stock Product',
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '80',
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
      note: 'Negative stock fixture',
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
  if (login.status !== 200) {
    throw new Error('Negative stock fixture login failed')
  }
  const setCookie = login.headers.get('set-cookie')
  const cookie = setCookie?.split(';')[0]
  if (!cookie?.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Negative stock session cookie missing')
  }

  return { tenant, user, product, inventory, cookie }
}

describe.skipIf(!hasDatabase)(
  'Negative Stock sale source',
  () => {
    afterEach(async () => {
      await cleanupProductTestTenants()
    })

    afterAll(async () => {
      await closePool()
    })

    it('consumes physical stock, records explicit shortfall and moves net stock negative without a negative lot', async () => {
      const fixture = await createNegativeStockFixture()

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
              name: 'Negative Buyer',
              phone: '01710000000',
            },
            discountPaisa: '0',
            lines: [
              {
                variantId: fixture.product.defaultVariantId,
                baseQty: '10',
                shortageResolution: {
                  type: 'NEGATIVE_STOCK',
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

      const lots = await getPool().query<{
        original_base_qty: string
        remaining_base_qty: string
        source_type: string
      }>(
        `SELECT
           trim_scale(original_base_qty)::text AS original_base_qty,
           trim_scale(remaining_base_qty)::text AS remaining_base_qty,
           source_type
         FROM inventory_lots
         WHERE tenant_id = $1 AND variant_id = $2
         ORDER BY received_on, id`,
        [fixture.tenant.id, fixture.product.defaultVariantId],
      )
      expect(lots.rows).toHaveLength(1)
      expect(lots.rows[0]).toMatchObject({
        original_base_qty: '5',
        remaining_base_qty: '0',
      })
      expect(
        lots.rows.every(
          (lot) => Number(lot.remaining_base_qty) >= 0,
        ),
      ).toBe(true)

      const shortfalls = await getPool().query<{
        original_shortfall_base_qty: string
        outstanding_base_qty: string
        provisional_unit_cost_paisa: string
      }>(
        `SELECT
           trim_scale(original_shortfall_base_qty)::text
             AS original_shortfall_base_qty,
           trim_scale(outstanding_base_qty)::text
             AS outstanding_base_qty,
           provisional_unit_cost_paisa::text
         FROM inventory_shortfalls
         WHERE tenant_id = $1 AND variant_id = $2`,
        [fixture.tenant.id, fixture.product.defaultVariantId],
      )
      expect(shortfalls.rows).toEqual([
        {
          original_shortfall_base_qty: '5',
          outstanding_base_qty: '5',
          provisional_unit_cost_paisa: '80',
        },
      ])

      await expect(
        fixture.inventory.listLots(
          fixture.tenant.id,
          fixture.product.defaultVariantId,
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          originalBaseQty: '5',
          remainingBaseQty: '0',
        }),
      ])

      const balance = await getPool().query<{ balance: string }>(
        `SELECT trim_scale(
           COALESCE(SUM(base_qty_delta), 0)
         )::text AS balance
         FROM inventory_movements
         WHERE tenant_id = $1 AND variant_id = $2`,
        [fixture.tenant.id, fixture.product.defaultVariantId],
      )
      expect(balance.rows[0]?.balance).toBe('-5')

      const saleMovement = await getPool().query<{
        base_qty_delta: string
        balance_after_base_qty: string
      }>(
        `SELECT
           trim_scale(base_qty_delta)::text AS base_qty_delta,
           trim_scale(balance_after_base_qty)::text
             AS balance_after_base_qty
         FROM inventory_movements
         WHERE tenant_id = $1
           AND variant_id = $2
           AND movement_type = 'SALE'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [fixture.tenant.id, fixture.product.defaultVariantId],
      )
      expect(saleMovement.rows[0]).toEqual({
        base_qty_delta: '-10',
        balance_after_base_qty: '-5',
      })
    })
  },
)


describe.skipIf(!hasDatabase)(
  'Vendor sale source',
  () => {
    afterEach(async () => {
      await cleanupProductTestTenants()
    })

    it('uses Vendor quantity without creating owned stock and records the exact payable', async () => {
      const fixture = await createNegativeStockFixture()
      const vendor = await new VendorService(
        fixture.tenant.id,
        getPool(),
      ).create({
        name: 'Vendor Source Partner',
        phone: '01790000000',
      })

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
              name: 'Vendor Source Buyer',
              phone: '01710000001',
            },
            discountPaisa: '0',
            lines: [
              {
                variantId: fixture.product.defaultVariantId,
                baseQty: '10',
                shortageResolution: {
                  type: 'VENDOR',
                  vendorId: vendor.id,
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

      const netStock = await getPool().query<{ balance: string }>(
        `SELECT trim_scale(
           COALESCE(SUM(base_qty_delta), 0)
         )::text AS balance
         FROM inventory_movements
         WHERE tenant_id = $1
           AND variant_id = $2`,
        [fixture.tenant.id, fixture.product.defaultVariantId],
      )
      expect(netStock.rows[0]?.balance).toBe('0')

      const sourcing = await getPool().query<{
        id: string
        sales_line_id: string
        vendor_id: string
        base_qty: string
        unit_cost_paisa: string
        total_cost_paisa: string
        status: string
      }>(
        `SELECT
           id,
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
        expect.objectContaining({
          vendor_id: vendor.id,
          base_qty: '5',
          unit_cost_paisa: '80',
          total_cost_paisa: '400',
          status: 'OPEN',
        }),
      ])

      const vendorAllocation = await getPool().query<{
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
      expect(vendorAllocation.rows).toEqual([
        {
          vendor_sourcing_id: sourcing.rows[0]!.id,
          vendor_id: vendor.id,
          base_qty: '5',
          unit_cost_paisa: '80',
          total_cost_paisa: '400',
        },
      ])

      const payable = await getPool().query<{
        amount_paisa: string
        source_id: string | null
      }>(
        `SELECT amount_paisa::text, source_id
         FROM vendor_ledger_entries
         WHERE tenant_id = $1 AND vendor_id = $2`,
        [fixture.tenant.id, vendor.id],
      )
      expect(payable.rows).toEqual([
        {
          amount_paisa: '400',
          source_id: sourcing.rows[0]!.id,
        },
      ])

      const shortfall = await getPool().query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM inventory_shortfalls
         WHERE tenant_id = $1
           AND variant_id = $2`,
        [fixture.tenant.id, fixture.product.defaultVariantId],
      )
      expect(shortfall.rows[0]?.count).toBe('0')
    })
  },
)
