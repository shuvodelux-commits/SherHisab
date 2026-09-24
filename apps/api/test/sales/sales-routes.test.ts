import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import type { UserRole } from '../../src/modules/auth/permissions'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

function readSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error('Session cookie was not set')
  }

  const cookie = setCookieHeader.split(';')[0]

  if (!cookie?.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Unexpected session cookie')
  }

  return cookie
}

async function createFixture(
  name: string,
  role: UserRole = 'OWNER',
) {
  const tenant = await createProductTestTenant(name)
  const password = 'strong-password-123'
  const authService = new AuthService()
  const user = await authService.createUser({
    tenantId: tenant.id,
    name: `${name} User`,
    email: `user-${randomUUID()}@example.com`,
    password,
    role,
  })
  const productService = new ProductMasterService(
    tenant.id,
    getPool(),
  )
  const unit = (await productService.listUnits()).find(
    (item) => item.symbol === 'pcs',
  )

  if (!unit) {
    throw new Error('Default Piece unit not found')
  }

  const product = await productService.createProduct(
    {
      name: `${name} Product`,
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '900',
      defaultSellingPricePaisa: '1400',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    user.id,
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
  expect(login.status).toBe(200)

  return {
    tenant,
    user,
    product,
    productService,
    inventory: new InventoryService(getPool()),
    authService,
    cookie: readSessionCookie(login.headers.get('set-cookie')),
  }
}

async function addLot(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  input: {
    qty: string
    cost: string
    selling: string
    date: string
  },
) {
  await fixture.inventory.adjustStock(
    fixture.tenant.id,
    fixture.user.id,
    fixture.product.defaultVariantId,
    {
      deltaBaseQty: input.qty,
      note: 'Sales route fixture',
      unitCostPaisa: input.cost,
      sellingPricePaisa: input.selling,
      businessDate: input.date,
    },
  )
}

async function privatePost(
  cookie: string,
  path: string,
  body: unknown,
) {
  return app.request(`http://localhost/api/private${path}`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe.skipIf(!hasDatabase)('sales routes', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('quotes and commits automatic FIFO pricing across multiple lots', async () => {
    const fixture = await createFixture('Automatic FIFO Sale')
    await addLot(fixture, {
      qty: '2',
      cost: '1000',
      selling: '1500',
      date: '2026-01-01',
    })
    await addLot(fixture, {
      qty: '2',
      cost: '1200',
      selling: '1800',
      date: '2026-02-01',
    })

    const quoteResponse = await privatePost(
      fixture.cookie,
      '/sales/quote-line',
      {
        variantId: fixture.product.defaultVariantId,
        baseQty: '3',
      },
    )
    expect(quoteResponse.status).toBe(200)
    expect(await quoteResponse.json()).toMatchObject({
      automaticSalesTotalPaisa: '4800',
      effectiveUnitSellingPricePaisa: '1600',
      cogsPaisa: '3200',
    })

    const saleResponse = await privatePost(
      fixture.cookie,
      '/sales',
      {
        businessDate: '2026-09-24',
        lines: [
          {
            variantId: fixture.product.defaultVariantId,
            baseQty: '3',
          },
        ],
      },
    )
    expect(saleResponse.status).toBe(201)

    const sale = (await saleResponse.json()) as {
      id: string
      totalSalesPaisa: string
      totalCogsPaisa: string
      lines: Array<{
        pricingMode: string
        automaticSalesTotalPaisa: string
        finalSalesTotalPaisa: string
        cogsPaisa: string
        belowCost: boolean
        allocations: Array<{ baseQty: string }>
      }>
    }

    expect(sale).toMatchObject({
      totalSalesPaisa: '4800',
      totalCogsPaisa: '3200',
    })
    expect(sale.lines[0]).toMatchObject({
      pricingMode: 'LOT',
      automaticSalesTotalPaisa: '4800',
      finalSalesTotalPaisa: '4800',
      cogsPaisa: '3200',
      belowCost: false,
    })
    expect(
      sale.lines[0]?.allocations.map((item) => item.baseQty),
    ).toEqual(['2', '1'])

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots.map((lot) => lot.remainingBaseQty)).toEqual([
      '0',
      '1',
    ])

    const movement = await getPool().query<{
      movement_type: string
      qty: string
      allocated: string
    }>(
      `SELECT
         im.movement_type,
         trim_scale(im.base_qty_delta)::text AS qty,
         trim_scale(COALESCE(SUM(a.base_qty), 0))::text AS allocated
       FROM inventory_movements im
       LEFT JOIN inventory_movement_lot_allocations a
         ON a.tenant_id = im.tenant_id
        AND a.movement_id = im.id
       WHERE im.tenant_id = $1
         AND im.movement_type = 'SALE'
       GROUP BY im.id, im.movement_type, im.base_qty_delta`,
      [fixture.tenant.id],
    )
    expect(movement.rows).toEqual([
      {
        movement_type: 'SALE',
        qty: '-3',
        allocated: '3',
      },
    ])
  })

  it('rejects an unauthorized manual price without changing stock', async () => {
    const fixture = await createFixture(
      'Unauthorized Manual Sale',
      'STAFF',
    )
    await addLot(fixture, {
      qty: '2',
      cost: '1000',
      selling: '1500',
      date: '2026-01-01',
    })

    const response = await privatePost(
      fixture.cookie,
      '/sales',
      {
        businessDate: '2026-09-24',
        lines: [
          {
            variantId: fixture.product.defaultVariantId,
            baseQty: '1',
            manualUnitSellingPricePaisa: '1300',
          },
        ],
      },
    )

    expect(response.status).toBe(403)
    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('2')
  })

  it('allows granted Staff to override price, warns below cost, and keeps lot price unchanged', async () => {
    const fixture = await createFixture(
      'Granted Manual Sale',
      'STAFF',
    )
    const owner = await fixture.authService.createUser({
      tenantId: fixture.tenant.id,
      name: 'Granting Owner',
      email: `owner-${randomUUID()}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })
    await fixture.authService.grantPermission({
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      permission: 'SALES_OVERRIDE_SELLING_PRICE',
      grantedByUserId: owner.id,
    })
    await addLot(fixture, {
      qty: '2',
      cost: '1000',
      selling: '1500',
      date: '2026-01-01',
    })

    const response = await privatePost(
      fixture.cookie,
      '/sales',
      {
        businessDate: '2026-09-24',
        lines: [
          {
            variantId: fixture.product.defaultVariantId,
            baseQty: '2',
            manualUnitSellingPricePaisa: '900',
          },
        ],
      },
    )
    expect(response.status).toBe(201)

    const sale = (await response.json()) as {
      lines: Array<{
        pricingMode: string
        manualUnitSellingPricePaisa: string | null
        automaticSalesTotalPaisa: string
        finalSalesTotalPaisa: string
        cogsPaisa: string
        belowCost: boolean
        lossPaisa: string
      }>
    }
    expect(sale.lines[0]).toMatchObject({
      pricingMode: 'MANUAL',
      manualUnitSellingPricePaisa: '900',
      automaticSalesTotalPaisa: '3000',
      finalSalesTotalPaisa: '1800',
      cogsPaisa: '2000',
      belowCost: true,
      lossPaisa: '200',
    })

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.defaultSellingPricePaisa).toBe('1500')

    const persisted = await getPool().query<{
      pricing_mode: string
      manual_unit_selling_price_paisa: string
      automatic_sales_total_paisa: string
      final_sales_total_paisa: string
      cogs_paisa: string
    }>(
      `SELECT
         pricing_mode,
         manual_unit_selling_price_paisa::text,
         automatic_sales_total_paisa::text,
         final_sales_total_paisa::text,
         cogs_paisa::text
       FROM sales_lines
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(persisted.rows[0]).toEqual({
      pricing_mode: 'MANUAL',
      manual_unit_selling_price_paisa: '900',
      automatic_sales_total_paisa: '3000',
      final_sales_total_paisa: '1800',
      cogs_paisa: '2000',
    })
  })

  it('rolls back earlier line changes when a later sale line has insufficient stock', async () => {
    const fixture = await createFixture('Sale Rollback')
    await addLot(fixture, {
      qty: '2',
      cost: '1000',
      selling: '1500',
      date: '2026-01-01',
    })

    const unit = (await fixture.productService.listUnits()).find(
      (item) => item.symbol === 'pcs',
    )
    if (!unit) {
      throw new Error('Default Piece unit not found')
    }
    const secondProduct = await fixture.productService.createProduct(
      {
        name: 'Insufficient Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '800',
        defaultSellingPricePaisa: '1200',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      fixture.user.id,
    )

    const response = await privatePost(
      fixture.cookie,
      '/sales',
      {
        businessDate: '2026-09-24',
        lines: [
          {
            variantId: fixture.product.defaultVariantId,
            baseQty: '1',
          },
          {
            variantId: secondProduct.defaultVariantId,
            baseQty: '1',
          },
        ],
      },
    )
    expect(response.status).toBe(400)

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('2')

    const invoices = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM sales_invoices
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(invoices.rows[0]?.count).toBe('0')
  })
})
