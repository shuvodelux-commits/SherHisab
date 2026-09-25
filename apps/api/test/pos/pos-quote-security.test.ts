import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { PosSettingsService } from '../../src/modules/settings/pos-settings.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

function sessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error('Session cookie was not set')
  }

  const cookie = setCookieHeader.split(';')[0]
  if (!cookie?.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Unexpected session cookie')
  }

  return cookie
}

function keysDeep(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      keysDeep(item, keys)
    }
    return keys
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      keys.add(key)
      keysDeep(nested, keys)
    }
  }

  return keys
}

function expectNoKeys(
  values: unknown[],
  forbidden: string[],
): void {
  const keys = new Set<string>()

  for (const value of values) {
    keysDeep(value, keys)
  }

  for (const key of forbidden) {
    expect(keys.has(key), `unexpected sensitive key: ${key}`).toBe(
      false,
    )
  }
}

async function createSecurityFixture(name: string) {
  const tenant = await createProductTestTenant(name)
  const password = 'strong-password-123'
  const auth = new AuthService()
  const owner = await auth.createUser({
    tenantId: tenant.id,
    name: 'Owner',
    email: `owner-${randomUUID()}@example.com`,
    password,
    role: 'OWNER',
  })
  const staff = await auth.createUser({
    tenantId: tenant.id,
    name: 'Cashier',
    email: `staff-${randomUUID()}@example.com`,
    password,
    role: 'STAFF',
  })

  await auth.grantPermission({
    tenantId: tenant.id,
    userId: staff.id,
    permission: 'POS_VIEW',
    grantedByUserId: owner.id,
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
      name: 'Secure POS Product',
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '5000',
      defaultSellingPricePaisa: '7000',
      openingStockBaseQty: '2',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    owner.id,
  )

  async function login(
    email: string,
  ): Promise<string> {
    const response = await app.request(
      'http://localhost/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: tenant.slug,
          email,
          password,
        }),
      },
    )

    expect(response.status).toBe(200)
    return sessionCookie(response.headers.get('set-cookie'))
  }

  return {
    tenant,
    product,
    ownerCookie: await login(owner.email),
    staffCookie: await login(staff.email),
    settings: new PosSettingsService(tenant.id, getPool()),
  }
}

async function readPosPayloads(
  cookie: string,
  variantId: string,
): Promise<{
  bootstrap: unknown
  products: unknown
  quote: unknown
  legacyQuote: unknown
}> {
  const bootstrapResponse = await app.request(
    'http://localhost/api/private/pos/bootstrap',
    { headers: { cookie } },
  )
  const productsResponse = await app.request(
    'http://localhost/api/private/pos/products?search=Secure&limit=10',
    { headers: { cookie } },
  )
  const quoteResponse = await app.request(
    'http://localhost/api/private/pos/quote-line',
    {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        variantId,
        baseQty: '1',
        businessDate: '2026-09-25',
      }),
    },
  )

  const legacyQuoteResponse = await app.request(
    'http://localhost/api/private/sales/quote-line',
    {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        variantId,
        baseQty: '1',
        businessDate: '2026-09-25',
      }),
    },
  )

  expect(bootstrapResponse.status).toBe(200)
  expect(productsResponse.status).toBe(200)
  expect(quoteResponse.status).toBe(200)
  expect(legacyQuoteResponse.status).toBe(200)

  return {
    bootstrap: await bootstrapResponse.json(),
    products: await productsResponse.json(),
    quote: await quoteResponse.json(),
    legacyQuote: await legacyQuoteResponse.json(),
  }
}

describe.skipIf(!hasDatabase)('POS cost privacy', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('omits every cost field when both cost-reveal gates are absent', async () => {
    const fixture = await createSecurityFixture('POS Cost Neither')
    const payloads = await readPosPayloads(
      fixture.staffCookie,
      fixture.product.defaultVariantId,
    )

    expectNoKeys(Object.values(payloads), [
      'unitCostPaisa',
      'cogsPaisa',
      'defaultPurchasePricePaisa',
      'configuredPurchasePricePaisa',
    ])
  })

  it('omits configured purchase price when setting is true but permission is absent', async () => {
    const fixture = await createSecurityFixture('POS Cost Setting Only')
    await fixture.settings.update({
      showPurchasePrice: true,
      requireCashSession: false,
      invoiceShareEnabled: false,
    })

    const payloads = await readPosPayloads(
      fixture.staffCookie,
      fixture.product.defaultVariantId,
    )

    expectNoKeys(Object.values(payloads), [
      'unitCostPaisa',
      'cogsPaisa',
      'defaultPurchasePricePaisa',
      'configuredPurchasePricePaisa',
    ])
  })

  it('omits configured purchase price when permission exists but setting is false', async () => {
    const fixture = await createSecurityFixture('POS Cost Permission Only')
    const payloads = await readPosPayloads(
      fixture.ownerCookie,
      fixture.product.defaultVariantId,
    )

    expectNoKeys(Object.values(payloads), [
      'unitCostPaisa',
      'cogsPaisa',
      'defaultPurchasePricePaisa',
      'configuredPurchasePricePaisa',
    ])
  })

  it('with both gates exposes only configured purchase price and never FIFO cost or COGS', async () => {
    const fixture = await createSecurityFixture('POS Cost Both')
    await fixture.settings.update({
      showPurchasePrice: true,
      requireCashSession: false,
      invoiceShareEnabled: false,
    })

    const payloads = await readPosPayloads(
      fixture.ownerCookie,
      fixture.product.defaultVariantId,
    )

    expectNoKeys(Object.values(payloads), [
      'unitCostPaisa',
      'cogsPaisa',
      'defaultPurchasePricePaisa',
    ])

    const products = payloads.products as Array<
      Record<string, unknown>
    >
    const quote = payloads.quote as Record<string, unknown>

    expect(products[0]?.configuredPurchasePricePaisa).toBe('5000')
    expect(quote.configuredPurchasePricePaisa).toBe('5000')
  })

  it('loads a POS-safe Product by Variant id for Draft restoration without leaking cost', async () => {
    const fixture = await createSecurityFixture('POS Draft Variant Lookup')

    const response = await app.request(
      `http://localhost/api/private/pos/products/${fixture.product.defaultVariantId}`,
      { headers: { cookie: fixture.staffCookie } },
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      productId: fixture.product.id,
      variantId: fixture.product.defaultVariantId,
      productName: 'Secure POS Product',
      currentSellingPricePaisa: '7000',
    })
    expectNoKeys([body], [
      'unitCostPaisa',
      'cogsPaisa',
      'defaultPurchasePricePaisa',
      'configuredPurchasePricePaisa',
    ])
  })

})
