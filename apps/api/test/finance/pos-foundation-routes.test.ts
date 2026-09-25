import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { FinanceRepository } from '../../src/modules/finance/finance.repository'
import { PosSettingsService } from '../../src/modules/settings/pos-settings.service'
import { VendorService } from '../../src/modules/vendors/vendor.service'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
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

async function createOwnerFixture(name: string) {
  const tenant = await createProductTestTenant(name)
  const password = 'strong-password-123'
  const auth = new AuthService()
  const user = await auth.createUser({
    tenantId: tenant.id,
    name: `${name} Owner`,
    email: `owner-${randomUUID()}@example.com`,
    password,
    role: 'OWNER',
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
  }
}

function privateRequest(
  cookie: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  return app.request(`http://localhost/api/private${path}`, {
    method: init.method ?? 'GET',
    headers: {
      cookie,
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    body:
      init.body === undefined
        ? undefined
        : JSON.stringify(init.body),
  })
}

describe.skipIf(!hasDatabase)('POS party finance foundation routes', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('creates and searches Customers only inside the authenticated tenant', async () => {
    const a = await createOwnerFixture('Customer Route A')
    const b = await createOwnerFixture('Customer Route B')

    const foreign = await privateRequest(b.cookie, '/customers', {
      method: 'POST',
      body: {
        name: 'Foreign Customer',
        phone: '+8801712345678',
      },
    })
    expect(foreign.status).toBe(201)

    const create = await privateRequest(a.cookie, '/customers', {
      method: 'POST',
      body: {
        tenantId: b.tenant.id,
        name: 'Local Customer',
        phone: '01712345678',
        guardianName: 'Guardian',
        address: 'Belkuchi',
      },
    })
    expect(create.status).toBe(201)
    const customer = (await create.json()) as {
      id: string
      customerCode: string
    }
    expect(customer.customerCode).toBe('CUS-00001')

    const stored = await getPool().query<{ tenant_id: string }>(
      'SELECT tenant_id FROM customers WHERE id = $1',
      [customer.id],
    )
    expect(stored.rows[0]?.tenant_id).toBe(a.tenant.id)

    const search = await privateRequest(
      a.cookie,
      '/customers?search=01712345678',
    )
    expect(search.status).toBe(200)
    const results = (await search.json()) as Array<{ name: string }>
    expect(results.map((item) => item.name)).toEqual(['Local Customer'])
  })

  it('does not expose another tenant Vendor or financial account', async () => {
    const a = await createOwnerFixture('Party Route A')
    const b = await createOwnerFixture('Party Route B')
    const foreignVendor = await new VendorService(
      b.tenant.id,
      getPool(),
    ).create({ name: 'Foreign Vendor' })
    const finance = new FinanceRepository(getPool())
    const foreignAccount = await finance.createAccount({
      tenantId: b.tenant.id,
      type: 'MOBILE_BANKING',
      name: 'Foreign bKash',
      provider: 'bKash',
    })

    const vendor = await privateRequest(
      a.cookie,
      `/vendors/${foreignVendor.id}`,
    )
    expect(vendor.status).toBe(404)

    const accountPatch = await privateRequest(
      a.cookie,
      `/financial-accounts/${foreignAccount.id}`,
      {
        method: 'PATCH',
        body: {
          name: 'Hijacked',
          provider: 'Wrong',
          accountReference: '',
          isActive: false,
        },
      },
    )
    expect(accountPatch.status).toBe(404)

    await expect(
      finance.findAccount(b.tenant.id, foreignAccount.id),
    ).resolves.toMatchObject({
      name: 'Foreign bKash',
      isActive: true,
    })
  })

  it('uses the session tenant and actor for POS settings and Cash Session routes', async () => {
    const a = await createOwnerFixture('Settings Route A')
    const b = await createOwnerFixture('Settings Route B')

    const settings = await privateRequest(a.cookie, '/pos-settings', {
      method: 'PATCH',
      body: {
        tenantId: b.tenant.id,
        showPurchasePrice: true,
        requireCashSession: true,
        invoiceShareEnabled: false,
      },
    })
    expect(settings.status).toBe(200)
    expect(await settings.json()).toEqual({
      showPurchasePrice: true,
      requireCashSession: true,
      invoiceShareEnabled: false,
    })

    await expect(
      new PosSettingsService(b.tenant.id, getPool()).get(),
    ).resolves.toEqual({
      showPurchasePrice: false,
      requireCashSession: false,
      invoiceShareEnabled: false,
    })

    const open = await privateRequest(a.cookie, '/cash-sessions/open', {
      method: 'POST',
      body: {
        tenantId: b.tenant.id,
        actorUserId: b.user.id,
        openingCashPaisa: '50000',
      },
    })
    expect(open.status).toBe(201)
    expect(await open.json()).toMatchObject({
      status: 'OPEN',
      openingCashPaisa: '50000',
      openedByUserId: a.user.id,
    })

    const stored = await getPool().query<{
      tenant_id: string
      opened_by_user_id: string
    }>(
      `SELECT tenant_id, opened_by_user_id
       FROM cash_sessions
       WHERE status = 'OPEN' AND tenant_id = $1`,
      [a.tenant.id],
    )
    expect(stored.rows[0]).toEqual({
      tenant_id: a.tenant.id,
      opened_by_user_id: a.user.id,
    })
  })

  it('searches active Vendors only inside the authenticated tenant', async () => {
    const a = await createOwnerFixture('Vendor Search A')
    const b = await createOwnerFixture('Vendor Search B')

    await new VendorService(a.tenant.id, getPool()).create({
      name: 'Rahman Local Vendor',
      phone: '01711111111',
    })
    await new VendorService(b.tenant.id, getPool()).create({
      name: 'Rahman Foreign Vendor',
      phone: '01722222222',
    })

    const response = await privateRequest(
      a.cookie,
      '/vendors?search=Rahman',
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        vendorCode: 'VEN-00001',
        name: 'Rahman Local Vendor',
      }),
    ])
  })

})
