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
    const quote = (await quoteResponse.json()) as Record<string, unknown>
    expect(quote).toMatchObject({
      automaticSalesTotalPaisa: '4800',
      effectiveUnitSellingPricePaisa: '1600',
    })
    expect(quote).not.toHaveProperty('cogsPaisa')

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
      permission: 'POS_SELL',
      grantedByUserId: owner.id,
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

  it('quotes BATCH_EXPIRY stock against the requested business date', async () => {
    const fixture = await createFixture('FEFO Quote Business Date')

    await getPool().query(
      `UPDATE products
       SET tracking_mode = 'BATCH_EXPIRY',
           allocation_policy = 'FEFO'
       WHERE tenant_id = $1 AND id = $2`,
      [fixture.tenant.id, fixture.product.id],
    )

    await addLot(fixture, {
      qty: '1',
      cost: '700',
      selling: '1100',
      date: '2026-01-01',
    })

    await getPool().query(
      `UPDATE inventory_lots
       SET batch_code = 'BACKDATED-VALID',
           expires_on = '2026-02-01'
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [fixture.tenant.id, fixture.product.defaultVariantId],
    )

    const response = await privatePost(
      fixture.cookie,
      '/sales/quote-line',
      {
        variantId: fixture.product.defaultVariantId,
        baseQty: '1',
        businessDate: '2026-01-15',
      },
    )

    expect(response.status).toBe(200)
    const quote = (await response.json()) as Record<string, unknown>
    expect(quote).toMatchObject({
      automaticSalesTotalPaisa: '1100',
    })
    expect(quote).not.toHaveProperty('cogsPaisa')
  })

  it('commits BATCH_EXPIRY FEFO sales from the earliest unexpired batch and leaves expired stock untouched', async () => {
    const fixture = await createFixture('FEFO Commit')

    await getPool().query(
      `UPDATE products
       SET tracking_mode = 'BATCH_EXPIRY',
           allocation_policy = 'FEFO'
       WHERE tenant_id = $1 AND id = $2`,
      [fixture.tenant.id, fixture.product.id],
    )

    await addLot(fixture, {
      qty: '5',
      cost: '500',
      selling: '900',
      date: '2025-12-01',
    })
    await addLot(fixture, {
      qty: '5',
      cost: '700',
      selling: '1100',
      date: '2026-01-01',
    })
    await addLot(fixture, {
      qty: '5',
      cost: '1300',
      selling: '2000',
      date: '2026-06-01',
    })

    await getPool().query(
      `UPDATE inventory_lots
       SET batch_code = CASE received_on
             WHEN '2025-12-01'::date THEN 'EXPIRED'
             WHEN '2026-01-01'::date THEN 'LATER-EXPIRY'
             WHEN '2026-06-01'::date THEN 'EARLIER-EXPIRY'
           END,
           expires_on = CASE received_on
             WHEN '2025-12-01'::date THEN '2026-09-20'::date
             WHEN '2026-01-01'::date THEN '2027-01-01'::date
             WHEN '2026-06-01'::date THEN '2026-10-15'::date
           END
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [fixture.tenant.id, fixture.product.defaultVariantId],
    )

    const before = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    const earliestValid = before.find(
      (lot) => lot.batchCode === 'EARLIER-EXPIRY',
    )
    if (!earliestValid) {
      throw new Error('Expected FEFO batch fixture')
    }

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
        ],
      },
    )
    expect(response.status).toBe(201)

    const sale = (await response.json()) as {
      totalSalesPaisa: string
      totalCogsPaisa: string
      lines: Array<{
        allocations: Array<{
          lotId: string
          baseQty: string
          unitCostPaisa: string
          lotSellingPricePaisa: string
        }>
      }>
    }

    expect(sale).toMatchObject({
      totalSalesPaisa: '2000',
      totalCogsPaisa: '1300',
    })
    expect(sale.lines[0]?.allocations).toEqual([
      expect.objectContaining({
        lotId: earliestValid.id,
        baseQty: '1',
        unitCostPaisa: '1300',
        lotSellingPricePaisa: '2000',
      }),
    ])

    const after = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(
      Object.fromEntries(
        after.map((lot) => [lot.batchCode, lot.remainingBaseQty]),
      ),
    ).toEqual({
      EXPIRED: '5',
      'LATER-EXPIRY': '5',
      'EARLIER-EXPIRY': '4',
    })
  })


  it('requires POS_SELL before any sale mutation', async () => {
    const fixture = await createFixture(
      'POS Sell Permission',
      'STAFF',
    )
    await addLot(fixture, {
      qty: '1',
      cost: '700',
      selling: '1100',
      date: '2026-09-01',
    })

    const response = await privatePost(
      fixture.cookie,
      '/sales',
      {
        operationId: randomUUID(),
        businessDate: '2026-09-25',
        customer: {
          name: 'Permission Buyer',
          phone: '01710000000',
        },
        discountPaisa: '0',
        lines: [
          {
            variantId: fixture.product.defaultVariantId,
            baseQty: '1',
          },
        ],
        payments: [
          {
            clientLineId: 'cash-1',
            method: 'CASH',
            amountPaisa: '1100',
          },
        ],
      },
    )

    expect(response.status).toBe(403)

    const invoices = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM sales_invoices
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(invoices.rows[0]?.count).toBe('0')

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('1')
  })


  it('exposes versioned Draft create, recent list, load, update and archive routes', async () => {
    const fixture = await createFixture('Draft Route Workflow')
    const draftState = {
      customer: {
        selectedCustomerId: null,
        name: 'Route Draft Buyer',
        phone: '01712345678',
        guardianName: '',
        address: 'Belkuchi',
      },
      discountPaisa: '0',
      payments: [],
      note: 'Route Draft',
      lines: [
        {
          variantId: fixture.product.defaultVariantId,
          quantityInput: {
            kind: 'SIMPLE',
            baseQty: '1',
          },
          normalizedQuantitySnapshot: {
            baseQty: '1',
            pricingQty: '1',
            displayQty: '1',
            components: {},
            snapshot: null,
          },
          pricingMode: 'AUTO',
          manualUnitSellingPricePaisa: null,
          shortageResolution: null,
          serialIds: [],
          batchSelection: null,
          warrantySnapshot: null,
          captureValues: {},
        },
      ],
    }

    const create = await privatePost(
      fixture.cookie,
      '/sales/drafts',
      draftState,
    )
    expect(create.status).toBe(201)
    const created = (await create.json()) as {
      id: string
      draftNumber: string
      version: number
      status: string
    }
    expect(created).toMatchObject({
      draftNumber: 'DRAFT-000001',
      version: 1,
      status: 'ACTIVE',
    })

    const recent = await app.request(
      'http://localhost/api/private/sales/drafts?limit=5',
      { headers: { cookie: fixture.cookie } },
    )
    expect(recent.status).toBe(200)
    expect(await recent.json()).toEqual([
      expect.objectContaining({
        id: created.id,
        customer: expect.objectContaining({
          name: 'Route Draft Buyer',
        }),
      }),
    ])

    const load = await app.request(
      `http://localhost/api/private/sales/drafts/${created.id}`,
      { headers: { cookie: fixture.cookie } },
    )
    expect(load.status).toBe(200)
    expect(await load.json()).toMatchObject({
      id: created.id,
      version: 1,
      note: 'Route Draft',
      lines: [
        expect.objectContaining({
          variantId: fixture.product.defaultVariantId,
        }),
      ],
    })

    const update = await app.request(
      `http://localhost/api/private/sales/drafts/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: fixture.cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          ...draftState,
          note: 'Updated Route Draft',
        }),
      },
    )
    expect(update.status).toBe(200)
    expect(await update.json()).toMatchObject({
      id: created.id,
      version: 2,
      note: 'Updated Route Draft',
    })

    const staleArchive = await privatePost(
      fixture.cookie,
      `/sales/drafts/${created.id}/archive`,
      { expectedVersion: 1 },
    )
    expect(staleArchive.status).toBe(409)
    expect(await staleArchive.json()).toMatchObject({
      currentVersion: 2,
    })

    const archive = await privatePost(
      fixture.cookie,
      `/sales/drafts/${created.id}/archive`,
      { expectedVersion: 2 },
    )
    expect(archive.status).toBe(200)
    expect(await archive.json()).toMatchObject({
      id: created.id,
      version: 3,
      status: 'ARCHIVED',
    })

    const emptyRecent = await app.request(
      'http://localhost/api/private/sales/drafts?limit=5',
      { headers: { cookie: fixture.cookie } },
    )
    expect(emptyRecent.status).toBe(200)
    expect(await emptyRecent.json()).toEqual([])
  })

  it('restricts active Draft routes to their owner or SALES_EDIT manager', async () => {
    const fixture = await createFixture('Draft Route Ownership')
    const password = 'strong-password-123'
    const makeStaff = async (name: string, manager = false) => {
      const user = await fixture.authService.createUser({
        tenantId: fixture.tenant.id,
        name,
        email: `draft-${randomUUID()}@example.com`,
        password,
        role: 'STAFF',
      })
      for (const permission of manager
        ? (['POS_VIEW', 'POS_SELL', 'SALES_EDIT'] as const)
        : (['POS_VIEW', 'POS_SELL'] as const)) {
        await fixture.authService.grantPermission({
          tenantId: fixture.tenant.id,
          userId: user.id,
          permission,
          grantedByUserId: fixture.user.id,
        })
      }
      const login = await app.request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: fixture.tenant.slug,
          email: user.email,
          password,
        }),
      })
      expect(login.status).toBe(200)
      return { user, cookie: readSessionCookie(login.headers.get('set-cookie')) }
    }
    const owner = await makeStaff('Draft owner')
    const other = await makeStaff('Other seller')
    const manager = await makeStaff('Sales manager', true)
    const draftState = {
      customer: {
        selectedCustomerId: null,
        name: 'Draft Buyer',
        phone: '01712345678',
        guardianName: '',
        address: '',
      },
      discountPaisa: '0',
      payments: [],
      note: 'Private draft',
      lines: [],
    }
    const create = await privatePost(owner.cookie, '/sales/drafts', draftState)
    expect(create.status).toBe(201)
    const draft = (await create.json()) as { id: string; version: number; ownerUserId: string }
    expect(draft.ownerUserId).toBe(owner.user.id)
    const path = `/sales/drafts/${draft.id}`
    const recent = async (cookie: string) => app.request(
      'http://localhost/api/private/sales/drafts',
      { headers: { cookie } },
    )
    const load = async (cookie: string) => app.request(
      `http://localhost/api/private${path}`,
      { headers: { cookie } },
    )
    const update = async (cookie: string) => app.request(
      `http://localhost/api/private${path}`,
      {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 1, ...draftState, note: 'Changed' }),
      },
    )
    expect((await recent(owner.cookie)).status).toBe(200)
    expect((await load(owner.cookie)).status).toBe(200)

    expect(await (await recent(other.cookie)).json()).toEqual([])
    expect((await load(other.cookie)).status).toBe(403)
    expect((await update(other.cookie)).status).toBe(403)
    expect((await privatePost(other.cookie, `${path}/archive`, { expectedVersion: 1 })).status).toBe(403)
    expect((await privatePost(other.cookie, `${path}/post`, {
      expectedVersion: 1,
      operationId: randomUUID(),
      businessDate: '2026-09-25',
    })).status).toBe(403)

    expect(await (await recent(manager.cookie)).json()).toEqual([
      expect.objectContaining({ id: draft.id }),
    ])
    expect((await load(manager.cookie)).status).toBe(200)
    const managed = await update(manager.cookie)
    expect(managed.status).toBe(200)
    expect(await managed.json()).toMatchObject({ version: 2, note: 'Changed' })
    expect((await privatePost(manager.cookie, `${path}/archive`, { expectedVersion: 2 })).status).toBe(200)

    await addLot(fixture, {
      qty: '1',
      cost: '900',
      selling: '1400',
      date: '2026-09-25',
    })
    const postable = await privatePost(owner.cookie, '/sales/drafts', {
      ...draftState,
      lines: [{
        variantId: fixture.product.defaultVariantId,
        quantityInput: { kind: 'SIMPLE', baseQty: '1' },
        normalizedQuantitySnapshot: {
          baseQty: '1', pricingQty: '1', displayQty: '1',
          components: {}, snapshot: null,
        },
        pricingMode: 'AUTO',
        manualUnitSellingPricePaisa: null,
        shortageResolution: null,
        serialIds: [],
        batchSelection: null,
        warrantySnapshot: null,
        captureValues: {},
      }],
    })
    expect(postable.status).toBe(201)
    const postableDraft = (await postable.json()) as { id: string }
    const managedPost = await privatePost(
      manager.cookie,
      `/sales/drafts/${postableDraft.id}/post`,
      { expectedVersion: 1, operationId: randomUUID(), businessDate: '2026-09-25' },
    )
    expect(managedPost.status).toBe(201)
    const audit = await getPool().query<{
      action: string
      draft_version: number
      actor_user_id: string
    }>(
      `SELECT action, draft_version, actor_user_id::text
       FROM sales_draft_audit
       WHERE tenant_id = $1 AND draft_id = $2
       ORDER BY created_at, id`,
      [fixture.tenant.id, postableDraft.id],
    )
    expect(audit.rows).toEqual([
      { action: 'CREATED', draft_version: 1, actor_user_id: owner.user.id },
      { action: 'POSTED', draft_version: 1, actor_user_id: manager.user.id },
    ])
  })

  it('posts a Draft through the route once, returns stale version metadata, and replays the same sale', async () => {
    const fixture = await createFixture('Draft Route Post')
    await addLot(fixture, {
      qty: '2',
      cost: '900',
      selling: '1400',
      date: '2026-09-25',
    })
    const draftState = {
      customer: {
        selectedCustomerId: null,
        name: 'Route Post Buyer',
        phone: '01712345678',
        guardianName: '',
        address: '',
      },
      discountPaisa: '0',
      payments: [],
      note: 'Post via route',
      lines: [{
        variantId: fixture.product.defaultVariantId,
        quantityInput: { kind: 'SIMPLE', baseQty: '1' },
        normalizedQuantitySnapshot: {
          baseQty: '1',
          pricingQty: '1',
          displayQty: '1',
          components: {},
          snapshot: null,
        },
        pricingMode: 'AUTO',
        manualUnitSellingPricePaisa: null,
        shortageResolution: null,
        serialIds: [],
        batchSelection: null,
        warrantySnapshot: null,
        captureValues: {},
      }],
    }
    const create = await privatePost(fixture.cookie, '/sales/drafts', draftState)
    expect(create.status).toBe(201)
    const draft = (await create.json()) as { id: string }
    const update = await app.request(
      `http://localhost/api/private/sales/drafts/${draft.id}`,
      {
        method: 'PATCH',
        headers: { cookie: fixture.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 1, ...draftState, note: 'Ready' }),
      },
    )
    expect(update.status).toBe(200)
    const operationId = randomUUID()
    const post = (expectedVersion: number) => privatePost(
      fixture.cookie,
      `/sales/drafts/${draft.id}/post`,
      { expectedVersion, operationId, businessDate: '2026-09-25' },
    )
    const stale = await post(1)
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ currentVersion: 2 })
    const first = await post(2)
    expect(first.status).toBe(201)
    const sale = (await first.json()) as { id: string; invoiceNumber: string }
    const retry = await post(2)
    expect(retry.status).toBe(201)
    expect(await retry.json()).toMatchObject({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
    })
    const invoices = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sales_invoices WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(invoices.rows[0]?.count).toBe('1')
    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('1')
  })

})
