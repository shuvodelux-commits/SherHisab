import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import type { UserRole } from '../../src/modules/auth/permissions'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import type { CreateProductInput } from '../../src/modules/products/product.types'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

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

async function createAuthenticatedFixture(
  name: string,
  role: UserRole = 'STAFF',
) {
  const tenant = await createProductTestTenant(name)
  const password = 'strong-password-123'
  const authService = new AuthService()
  const user = await authService.createUser({
    tenantId: tenant.id,
    name: `${name} Owner`,
    email: `owner-${randomUUID()}@example.com`,
    password,
    role,
  })
  const login = await app.request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantSlug: tenant.slug,
      email: user.email,
      password,
    }),
  })

  expect(login.status).toBe(200)

  return {
    tenant,
    user,
    cookie: readSessionCookie(login.headers.get('set-cookie')),
    service: new ProductMasterService(tenant.id, getPool()),
  }
}

async function pieceUnitId(service: ProductMasterService): Promise<string> {
  const unit = (await service.listUnits()).find((item) => item.symbol === 'pcs')

  if (!unit) {
    throw new Error('Default Piece unit not found')
  }

  return unit.id
}

function createPayload(
  baseUnitId: string,
  name = 'Hammer',
): CreateProductInput {
  return {
    name,
    brand: 'RFL',
    categoryId: null,
    baseUnitId,
    barcode: '',
    defaultPurchasePricePaisa: '1000',
    defaultSellingPricePaisa: '1500',
    openingStockBaseQty: '0',
    minimumStockBaseQty: '0',
    trackingMode: 'SIMPLE',
  }
}

async function privateRequest(
  cookie: string,
  path: string,
  init: {
    method?: string
    body?: unknown
  } = {},
) {
  return app.request(`http://localhost/api/private${path}`, {
    method: init.method ?? 'GET',
    headers: {
      cookie,
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

describe.skipIf(!hasDatabase)('product master routes', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('rejects unauthenticated Product routes', async () => {
    const response = await app.request(
      'http://localhost/api/private/products',
    )

    expect(response.status).toBe(401)
  })

  it('uses the authenticated tenant and ignores a spoofed tenantId in Product create', async () => {
    const a = await createAuthenticatedFixture('Route Tenant A')
    const b = await createAuthenticatedFixture('Route Tenant B')
    const unitA = await pieceUnitId(a.service)
    const unitB = await pieceUnitId(b.service)

    await b.service.createProduct(createPayload(unitB, 'Tenant B Product'), null)

    const create = await privateRequest(a.cookie, '/products', {
      method: 'POST',
      body: {
        ...createPayload(unitA, 'Tenant A Product'),
        tenantId: b.tenant.id,
      },
    })

    expect(create.status).toBe(201)
    const created = (await create.json()) as { id: string; name: string }
    expect(created.name).toBe('Tenant A Product')

    const stored = await getPool().query<{ tenant_id: string }>(
      'SELECT tenant_id FROM products WHERE id = $1',
      [created.id],
    )
    expect(stored.rows[0]?.tenant_id).toBe(a.tenant.id)

    const list = await privateRequest(a.cookie, '/products')
    expect(list.status).toBe(200)
    const body = (await list.json()) as {
      items: Array<{ name: string }>
    }
    expect(body.items.map((item) => item.name)).toContain('Tenant A Product')
    expect(body.items.map((item) => item.name)).not.toContain(
      'Tenant B Product',
    )
  })

  it('rejects cross-tenant category and unit references without leaking data', async () => {
    const a = await createAuthenticatedFixture('Cross Ref Tenant A')
    const b = await createAuthenticatedFixture('Cross Ref Tenant B')
    const unitA = await pieceUnitId(a.service)
    const unitB = await pieceUnitId(b.service)
    const categoryB = await b.service.createCategory('Foreign Category')

    const badCategory = await privateRequest(a.cookie, '/products', {
      method: 'POST',
      body: {
        ...createPayload(unitA, 'Foreign Category Product'),
        categoryId: categoryB.id,
      },
    })
    expect([400, 404]).toContain(badCategory.status)

    const badUnit = await privateRequest(a.cookie, '/products', {
      method: 'POST',
      body: createPayload(unitB, 'Foreign Unit Product'),
    })
    expect([400, 404]).toContain(badUnit.status)
  })

  it('maps Product conflicts to 409 and validation errors to 400', async () => {
    const fixture = await createAuthenticatedFixture('Route Error Tenant')
    const unitId = await pieceUnitId(fixture.service)

    const first = await privateRequest(fixture.cookie, '/products', {
      method: 'POST',
      body: createPayload(unitId, 'Duplicate Product'),
    })
    expect(first.status).toBe(201)

    const duplicate = await privateRequest(fixture.cookie, '/products', {
      method: 'POST',
      body: createPayload(unitId, ' duplicate product '),
    })
    expect(duplicate.status).toBe(409)

    const invalidMoney = await privateRequest(fixture.cookie, '/products', {
      method: 'POST',
      body: {
        ...createPayload(unitId, 'Invalid Money Product'),
        defaultPurchasePricePaisa: '10.50',
      },
    })
    expect(invalidMoney.status).toBe(400)

    const product = await fixture.service.createProduct(
      createPayload(unitId, 'Unit Validation Product'),
      null,
    )
    const box = await fixture.service.createUnit({ name: 'Box' })
    const invalidConversion = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/units`,
      {
        method: 'PUT',
        body: {
          units: [
            {
              unitId: box.id,
              conversionMode: 'FIXED',
              conversionToBase: '0',
            },
          ],
        },
      },
    )
    expect(invalidConversion.status).toBe(400)
  })

  it('returns 404 for a missing Product', async () => {
    const fixture = await createAuthenticatedFixture('Missing Route Tenant')

    const response = await privateRequest(
      fixture.cookie,
      `/products/${randomUUID()}`,
    )

    expect(response.status).toBe(404)
  })

  it('creates, updates, deactivates and adjusts stock through authenticated routes', async () => {
    const fixture = await createAuthenticatedFixture('Lifecycle Route Tenant')
    const unitId = await pieceUnitId(fixture.service)

    const create = await privateRequest(fixture.cookie, '/products', {
      method: 'POST',
      body: {
        ...createPayload(unitId, 'Route Pipe'),
        openingStockBaseQty: '2.5',
      },
    })
    expect(create.status).toBe(201)
    const created = (await create.json()) as {
      id: string
      defaultVariantId: string
      stockBaseQty: string
    }
    expect(created.stockBaseQty).toBe('2.5')

    const update = await privateRequest(
      fixture.cookie,
      `/products/${created.id}`,
      {
        method: 'PATCH',
        body: {
          ...createPayload(unitId, 'Route Pipe'),
          brand: 'Updated Brand',
          minimumStockBaseQty: '1',
          trackingMode: 'SIMPLE',
        },
      },
    )
    expect(update.status).toBe(200)
    expect(await update.json()).toMatchObject({ brand: 'Updated Brand' })

    const adjustment = await privateRequest(
      fixture.cookie,
      `/products/${created.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          deltaBaseQty: '0.5',
          note: 'Route recount',
          unitCostPaisa: '1000',
        },
      },
    )
    expect(adjustment.status).toBe(200)

    const afterAdjustment = await privateRequest(
      fixture.cookie,
      `/products/${created.id}`,
    )
    expect(afterAdjustment.status).toBe(200)
    expect(await afterAdjustment.json()).toMatchObject({
      stockBaseQty: '3',
    })

    const deactivate = await privateRequest(
      fixture.cookie,
      `/products/${created.id}/status`,
      {
        method: 'POST',
        body: { isActive: false },
      },
    )
    expect(deactivate.status).toBe(200)
    expect(await deactivate.json()).toMatchObject({ isActive: false })
  })

  it('honors Product filters, status and server-side pagination', async () => {
    const fixture = await createAuthenticatedFixture('Filter Route Tenant')
    const unitId = await pieceUnitId(fixture.service)
    const category = await fixture.service.createCategory('Electrical')

    const first = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'LED Bulb'),
        categoryId: category.id,
        brand: 'Bright',
      },
      null,
    )
    await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'LED Tube'),
        categoryId: category.id,
        brand: 'Bright',
      },
      null,
    )
    const inactive = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Old LED'),
        categoryId: category.id,
        brand: 'Bright',
      },
      null,
    )
    await fixture.service.setProductActive(inactive.id, false)

    const response = await privateRequest(
      fixture.cookie,
      `/products?search=LED&categoryId=${category.id}&brand=Bright&status=active&limit=1&offset=0`,
    )
    expect(response.status).toBe(200)
    const page = (await response.json()) as {
      total: number
      limit: number
      offset: number
      items: Array<{ id: string }>
    }
    expect(page).toMatchObject({ total: 2, limit: 1, offset: 0 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe(first.id)

    const inactiveResponse = await privateRequest(
      fixture.cookie,
      '/products?status=inactive',
    )
    const inactivePage = (await inactiveResponse.json()) as {
      items: Array<{ id: string }>
    }
    expect(inactivePage.items.map((item) => item.id)).toContain(inactive.id)
  })

  it('sorts the complete Product dataset before server pagination', async () => {
    const fixture = await createAuthenticatedFixture('Sorted Route Tenant')
    const unitId = await pieceUnitId(fixture.service)

    await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Cheap Product'),
        defaultSellingPricePaisa: '1000',
      },
      null,
    )
    const expensive = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Expensive Product'),
        defaultSellingPricePaisa: '9000',
      },
      null,
    )

    const response = await privateRequest(
      fixture.cookie,
      '/products?sortBy=sellingPrice&sortDir=desc&limit=1&offset=0',
    )
    expect(response.status).toBe(200)
    const page = (await response.json()) as {
      items: Array<{ id: string }>
    }
    expect(page.items[0]?.id).toBe(expensive.id)
  })

  it('returns remaining FIFO inventory value and sorts by Stock Value', async () => {
    const fixture = await createAuthenticatedFixture('Stock Value Route Tenant')
    const unitId = await pieceUnitId(fixture.service)

    const valued = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Valued Product'),
        defaultPurchasePricePaisa: '1000',
        openingStockBaseQty: '2',
      },
      null,
    )

    const restock = await privateRequest(
      fixture.cookie,
      `/products/${valued.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          deltaBaseQty: '1',
          note: 'Higher-cost restock',
          unitCostPaisa: '2000',
          businessDate: '2099-01-02',
        },
      },
    )
    expect(restock.status).toBe(200)

    const consume = await privateRequest(
      fixture.cookie,
      `/products/${valued.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          deltaBaseQty: '-1.5',
          note: 'FIFO consumption',
        },
      },
    )
    expect(consume.status).toBe(200)

    await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Lower Value Product'),
        defaultPurchasePricePaisa: '500',
        openingStockBaseQty: '1',
      },
      null,
    )

    const response = await privateRequest(
      fixture.cookie,
      '/products?sortBy=stockValue&sortDir=desc',
    )
    expect(response.status).toBe(200)

    const page = (await response.json()) as {
      items: Array<{
        id: string
        stockBaseQty: string
        stockValuePaisa: string
      }>
    }

    expect(page.items[0]).toMatchObject({
      id: valued.id,
      stockBaseQty: '1.5',
      stockValuePaisa: '2500',
    })
  })

  it('lists and audits Owner edits to an active lot selling price', async () => {
    const fixture = await createAuthenticatedFixture(
      'Lot Selling Price Owner Tenant',
      'OWNER',
    )
    const unitId = await pieceUnitId(fixture.service)
    const product = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Owner Priced Product'),
        openingStockBaseQty: '2',
      },
      fixture.user.id,
    )

    const listed = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots`,
    )
    expect(listed.status).toBe(200)
    const lots = (await listed.json()) as Array<{
      id: string
      unitCostPaisa: string
      defaultSellingPricePaisa: string
      remainingBaseQty: string
    }>
    expect(lots).toHaveLength(1)
    expect(lots[0]).toMatchObject({
      unitCostPaisa: '1000',
      defaultSellingPricePaisa: '1500',
      remainingBaseQty: '2',
    })

    const lotId = lots[0]!.id
    const update = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots/${lotId}/selling-price`,
      {
        method: 'PATCH',
        body: { sellingPricePaisa: '1750' },
      },
    )
    expect(update.status).toBe(200)
    expect(await update.json()).toMatchObject({
      id: lotId,
      unitCostPaisa: '1000',
      defaultSellingPricePaisa: '1750',
      remainingBaseQty: '2',
    })

    const audit = await getPool().query<{
      old_selling_price_paisa: string
      new_selling_price_paisa: string
      changed_by_user_id: string
    }>(
      `SELECT
         old_selling_price_paisa::text,
         new_selling_price_paisa::text,
         changed_by_user_id
       FROM inventory_lot_selling_price_audit
       WHERE tenant_id = $1 AND lot_id = $2`,
      [fixture.tenant.id, lotId],
    )
    expect(audit.rows).toEqual([
      {
        old_selling_price_paisa: '1500',
        new_selling_price_paisa: '1750',
        changed_by_user_id: fixture.user.id,
      },
    ])
  })

  it('forbids Staff from editing a lot selling price without permission', async () => {
    const fixture = await createAuthenticatedFixture(
      'Lot Price Staff Tenant',
      'STAFF',
    )
    const unitId = await pieceUnitId(fixture.service)
    const product = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Staff Priced Product'),
        openingStockBaseQty: '1',
      },
      fixture.user.id,
    )
    const listed = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots`,
    )
    const lots = (await listed.json()) as Array<{ id: string }>

    const response = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots/${lots[0]!.id}/selling-price`,
      {
        method: 'PATCH',
        body: { sellingPricePaisa: '1800' },
      },
    )

    expect(response.status).toBe(403)
  })

  it('allows explicitly granted Staff to edit a lot selling price', async () => {
    const fixture = await createAuthenticatedFixture(
      'Granted Lot Price Staff Tenant',
      'STAFF',
    )
    const authService = new AuthService()
    const owner = await authService.createUser({
      tenantId: fixture.tenant.id,
      name: 'Granting Owner',
      email: `granting-owner-${randomUUID()}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })
    await authService.grantPermission({
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      permission: 'INVENTORY_EDIT_LOT_SELLING_PRICE',
      grantedByUserId: owner.id,
    })

    const unitId = await pieceUnitId(fixture.service)
    const product = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Granted Staff Product'),
        openingStockBaseQty: '1',
      },
      fixture.user.id,
    )
    const listed = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots`,
    )
    const lots = (await listed.json()) as Array<{ id: string }>

    const response = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots/${lots[0]!.id}/selling-price`,
      {
        method: 'PATCH',
        body: { sellingPricePaisa: '1850' },
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      defaultSellingPricePaisa: '1850',
    })
  })

  it('rejects selling-price edits for depleted lots', async () => {
    const fixture = await createAuthenticatedFixture(
      'Depleted Lot Price Tenant',
      'OWNER',
    )
    const unitId = await pieceUnitId(fixture.service)
    const product = await fixture.service.createProduct(
      {
        ...createPayload(unitId, 'Depleted Lot Product'),
        openingStockBaseQty: '1',
      },
      fixture.user.id,
    )
    const listed = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots`,
    )
    const lots = (await listed.json()) as Array<{ id: string }>
    const lotId = lots[0]!.id

    const consume = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          deltaBaseQty: '-1',
          note: 'Deplete lot',
        },
      },
    )
    expect(consume.status).toBe(200)

    const response = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots/${lotId}/selling-price`,
      {
        method: 'PATCH',
        body: { sellingPricePaisa: '1900' },
      },
    )

    expect(response.status).toBe(409)
  })

  it('does not edit a lot that belongs to another tenant', async () => {
    const tenantA = await createAuthenticatedFixture(
      'Lot Price Tenant A',
      'OWNER',
    )
    const tenantB = await createAuthenticatedFixture(
      'Lot Price Tenant B',
      'OWNER',
    )
    const unitB = await pieceUnitId(tenantB.service)
    const productB = await tenantB.service.createProduct(
      {
        ...createPayload(unitB, 'Tenant B Product'),
        openingStockBaseQty: '1',
      },
      tenantB.user.id,
    )
    const listedB = await privateRequest(
      tenantB.cookie,
      `/products/${productB.id}/lots`,
    )
    const lotsB = (await listedB.json()) as Array<{ id: string }>

    const response = await privateRequest(
      tenantA.cookie,
      `/products/${productB.id}/lots/${lotsB[0]!.id}/selling-price`,
      {
        method: 'PATCH',
        body: { sellingPricePaisa: '1950' },
      },
    )

    expect(response.status).toBe(404)
  })

  it('edits masters and only deletes masters that are not referenced', async () => {
    const fixture = await createAuthenticatedFixture('Master Edit Delete Tenant')
    const baseUnitId = await pieceUnitId(fixture.service)
    const category = await fixture.service.createCategory('Hardware')
    const spareCategory = await fixture.service.createCategory('Temporary')
    const spareUnit = await fixture.service.createUnit({
      name: 'Bundle',
      symbol: 'bdl',
    })

    const renameCategory = await privateRequest(
      fixture.cookie,
      `/product-categories/${category.id}`,
      {
        method: 'PATCH',
        body: { name: 'Tools' },
      },
    )
    expect(renameCategory.status).toBe(200)
    expect(await renameCategory.json()).toMatchObject({ name: 'Tools' })

    const renameUnit = await privateRequest(
      fixture.cookie,
      `/units/${spareUnit.id}`,
      {
        method: 'PATCH',
        body: { name: 'Bundle Pack', symbol: 'bp' },
      },
    )
    expect(renameUnit.status).toBe(200)
    expect(await renameUnit.json()).toMatchObject({
      name: 'Bundle Pack',
      symbol: 'bp',
    })

    const deleteCategory = await privateRequest(
      fixture.cookie,
      `/product-categories/${spareCategory.id}`,
      { method: 'DELETE' },
    )
    expect(deleteCategory.status).toBe(204)

    const deleteUnit = await privateRequest(
      fixture.cookie,
      `/units/${spareUnit.id}`,
      { method: 'DELETE' },
    )
    expect(deleteUnit.status).toBe(204)

    const referencedCategory = await fixture.service.createCategory('Electrical')
    const referencedUnit = await fixture.service.createUnit({
      name: 'Meter',
      symbol: 'm',
    })
    await fixture.service.createProduct(
      {
        ...createPayload(referencedUnit.id, 'Wire'),
        categoryId: referencedCategory.id,
      },
      null,
    )

    const blockedCategory = await privateRequest(
      fixture.cookie,
      `/product-categories/${referencedCategory.id}`,
      { method: 'DELETE' },
    )
    expect(blockedCategory.status).toBe(409)

    const blockedUnit = await privateRequest(
      fixture.cookie,
      `/units/${referencedUnit.id}`,
      { method: 'DELETE' },
    )
    expect(blockedUnit.status).toBe(409)

    const defaultPieceDelete = await privateRequest(
      fixture.cookie,
      `/units/${baseUnitId}`,
      { method: 'DELETE' },
    )
    expect(defaultPieceDelete.status).toBe(409)
  })

  it('lists archived masters only when includeInactive=true', async () => {
    const fixture = await createAuthenticatedFixture('Master Route Tenant')
    const category = await fixture.service.createCategory('Archived Category')
    const unit = await fixture.service.createUnit({ name: 'Archived Unit' })
    await fixture.service.setCategoryActive(category.id, false)
    await fixture.service.setUnitActive(unit.id, false)

    const activeCategories = await privateRequest(
      fixture.cookie,
      '/product-categories',
    )
    const allCategories = await privateRequest(
      fixture.cookie,
      '/product-categories?includeInactive=true',
    )
    const activeUnits = await privateRequest(fixture.cookie, '/units')
    const allUnits = await privateRequest(
      fixture.cookie,
      '/units?includeInactive=true',
    )

    expect(
      ((await activeCategories.json()) as Array<{ id: string }>).some(
        (item) => item.id === category.id,
      ),
    ).toBe(false)
    expect(
      ((await allCategories.json()) as Array<{ id: string }>).some(
        (item) => item.id === category.id,
      ),
    ).toBe(true)
    expect(
      ((await activeUnits.json()) as Array<{ id: string }>).some(
        (item) => item.id === unit.id,
      ),
    ).toBe(false)
    expect(
      ((await allUnits.json()) as Array<{ id: string }>).some(
        (item) => item.id === unit.id,
      ),
    ).toBe(true)
  })

  it('requires an explicit Variant for stock and lot routes when Variants are enabled', async () => {
    const fixture = await createAuthenticatedFixture('Required Variant Route Tenant')
    const unitId = await pieceUnitId(fixture.service)
    const product = await fixture.service.createProduct(
      createPayload(unitId, 'Variant Product'),
      null,
    )

    await fixture.service.replaceVariantConfiguration(product.id, {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'VARIANT-RED',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    })

    const adjustment = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          deltaBaseQty: '1',
          note: 'Missing Variant',
          unitCostPaisa: '1000',
        },
      },
    )
    expect(adjustment.status).toBe(400)
    expect(await adjustment.json()).toEqual({
      error: 'Variant is required when Product Variants are enabled.',
    })

    const lots = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots`,
    )
    expect(lots.status).toBe(400)
    expect(await lots.json()).toEqual({
      error: 'Variant is required when Product Variants are enabled.',
    })

    const current = await fixture.service.getProduct(product.id)
    expect(current.stockBaseQty).toBe('0')
  })

  it('keeps preserved default-Variant stock operable after enabling Variants', async () => {
    const fixture = await createAuthenticatedFixture(
      'Preserved Default Stock Route Tenant',
    )
    const unitId = await pieceUnitId(fixture.service)
    const payload = createPayload(unitId, 'Migrated Variant Product')
    payload.openingStockBaseQty = '2.5'
    const product = await fixture.service.createProduct(payload, null)

    await fixture.service.replaceVariantConfiguration(product.id, {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'MIGRATED-RED',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    })

    const adjustment = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          variantId: product.defaultVariantId,
          deltaBaseQty: '-0.5',
          note: 'Correct preserved pre-Variant stock',
        },
      },
    )
    expect(adjustment.status).toBe(200)

    const lots = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots?variantId=${product.defaultVariantId}`,
    )
    expect(lots.status).toBe(200)
    expect(await lots.json()).toEqual([
      expect.objectContaining({
        sourceType: 'OPENING',
        originalBaseQty: '2.5',
        remainingBaseQty: '2',
      }),
    ])

    const current = await fixture.service.getProduct(product.id)
    expect(current.variantsEnabled).toBe(true)
    expect(current.stockBaseQty).toBe('2')
  })

  it('rejects the hidden default Variant when Product Variants are enabled', async () => {
    const fixture = await createAuthenticatedFixture('Hidden Variant Route Tenant')
    const unitId = await pieceUnitId(fixture.service)
    const product = await fixture.service.createProduct(
      createPayload(unitId, 'Hidden Variant Product'),
      null,
    )

    await fixture.service.replaceVariantConfiguration(product.id, {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'HIDDEN-RED',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    })

    const adjustment = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          variantId: product.defaultVariantId,
          deltaBaseQty: '1',
          note: 'Hidden Variant',
          unitCostPaisa: '1000',
        },
      },
    )
    expect(adjustment.status).toBe(400)
    expect(await adjustment.json()).toEqual({
      error: 'Select an enabled Product Variant.',
    })

    const lots = await privateRequest(
      fixture.cookie,
      `/products/${product.id}/lots?variantId=${product.defaultVariantId}`,
    )
    expect(lots.status).toBe(400)
    expect(await lots.json()).toEqual({
      error: 'Select an enabled Product Variant.',
    })
  })

  it('rejects a Variant that belongs to a different Product in stock and lot routes', async () => {
    const fixture = await createAuthenticatedFixture('Variant Route Tenant')
    const unitId = await pieceUnitId(fixture.service)
    const first = await fixture.service.createProduct(
      createPayload(unitId, 'First Product'),
      null,
    )
    const second = await fixture.service.createProduct(
      createPayload(unitId, 'Second Product'),
      null,
    )

    await fixture.service.replaceVariantConfiguration(second.id, {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'SECOND-RED',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    })
    const advanced = await fixture.service.getAdvancedConfiguration(second.id)
    const foreignVariantId = advanced.variants.find((item) => item.isActive)?.id

    if (!foreignVariantId) {
      throw new Error('Expected active Variant')
    }

    const adjust = await privateRequest(
      fixture.cookie,
      `/products/${first.id}/stock-adjustments`,
      {
        method: 'POST',
        body: {
          variantId: foreignVariantId,
          deltaBaseQty: '1',
          note: 'Wrong Product',
          unitCostPaisa: '1000',
        },
      },
    )
    expect([400, 404]).toContain(adjust.status)

    const lots = await privateRequest(
      fixture.cookie,
      `/products/${first.id}/lots?variantId=${foreignVariantId}`,
    )
    expect([400, 404]).toContain(lots.status)
  })
})
