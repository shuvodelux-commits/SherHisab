import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const createdTenantIds: string[] = []

async function fixture(name: string) {
  const tenant = await createProductTestTenant(name)
  createdTenantIds.push(tenant.id)
  const auth = new AuthService()
  const password = 'strong-password-123'
  const owner = await auth.createUser({
    tenantId: tenant.id, name: 'Template Owner',
    email: `template-owner-${randomUUID()}@example.com`,
    password, role: 'OWNER',
  })
  const products = new ProductMasterService(tenant.id, getPool())
  const unit = (await products.listUnits()).find((item) => item.symbol === 'pcs')
  if (!unit) throw new Error('Default Piece unit not found')
  const product = await products.createProduct({
    name: `${name} Product`, baseUnitId: unit.id,
    defaultPurchasePricePaisa: '900',
    defaultSellingPricePaisa: '1400',
    openingStockBaseQty: '0', minimumStockBaseQty: '0',
    trackingMode: 'SIMPLE',
  }, owner.id)
  const inventory = new InventoryService(getPool())
  await inventory.adjustStock(tenant.id, owner.id, product.defaultVariantId, {
    deltaBaseQty: '10', note: 'Template stock',
    unitCostPaisa: '900', sellingPricePaisa: '1400',
    businessDate: '2026-09-26',
  })
  async function login(email: string) {
    const response = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantSlug: tenant.slug, email, password }),
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('Session cookie missing')
    return cookie
  }
  const ownerCookie = await login(owner.email)
  function request(cookie: string, path: string, method = 'GET', body?: unknown) {
    return app.request(`http://localhost/api/private/sales/templates${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
  const line = {
    variantId: product.defaultVariantId,
    quantityInput: { kind: 'SIMPLE', baseQty: '2' },
  }
  return { tenant, auth, owner, product, inventory, login, request, ownerCookie, line }
}

describe.skipIf(!hasDatabase)('reusable sales templates', () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      await getPool().query(
        'DELETE FROM sales_templates WHERE tenant_id = ANY($1::uuid[])',
        [createdTenantIds],
      )
      createdTenantIds.length = 0
    }
    await cleanupProductTestTenants()
  })
  afterAll(async () => { await closePool() })

  it('separates view and manage permissions for Staff', async () => {
    const f = await fixture('Template Permissions')
    const savedResponse = await f.request(f.ownerCookie, '', 'POST', {
      name: 'Standard package', lines: [f.line],
    })
    expect(savedResponse.status).toBe(201)
    const saved = await savedResponse.json() as { id: string }
    const staff = await f.auth.createUser({
      tenantId: f.tenant.id, name: 'Template Viewer',
      email: `template-staff-${randomUUID()}@example.com`,
      password: 'strong-password-123', role: 'STAFF',
    })
    const staffCookie = await f.login(staff.email)
    expect((await f.request(staffCookie, '')).status).toBe(403)
    expect((await f.request(staffCookie, `/${saved.id}`)).status).toBe(403)
    expect((await f.request(staffCookie, '', 'POST', {
      name: 'Blocked', lines: [f.line],
    })).status).toBe(403)
    await f.auth.grantPermission({
      tenantId: f.tenant.id, userId: staff.id,
      permission: 'SALES_TEMPLATE_VIEW', grantedByUserId: f.owner.id,
    })
    expect((await f.request(staffCookie, '')).status).toBe(200)
    expect((await f.request(staffCookie, `/${saved.id}`)).status).toBe(200)
    expect((await f.request(staffCookie, '', 'POST', {
      name: 'Blocked', lines: [f.line],
    })).status).toBe(403)
    expect((await f.request(staffCookie, `/${saved.id}`, 'PATCH', {
      expectedVersion: 1, name: 'Blocked',
    })).status).toBe(403)
    await f.auth.grantPermission({
      tenantId: f.tenant.id, userId: staff.id,
      permission: 'SALES_TEMPLATE_MANAGE', grantedByUserId: f.owner.id,
    })
    expect((await f.request(staffCookie, '', 'POST', {
      name: 'Allowed', lines: [f.line],
    })).status).toBe(201)
  })

  it('loads current stock and automatic lot price without checkout state', async () => {
    const f = await fixture('Template Requote')
    const createdResponse = await f.request(f.ownerCookie, '', 'POST', {
      name: 'Bathroom package',
      customer: { name: 'Must not persist' },
      payments: [{ method: 'CASH', amountPaisa: '5000' }],
      lines: [{ ...f.line, shortageResolution: { type: 'NEGATIVE_STOCK' } }],
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: string }
    const oldLot = await getPool().query<{ id: string }>(
      `SELECT id FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2
       ORDER BY received_on, id LIMIT 1`,
      [f.tenant.id, f.product.defaultVariantId],
    )
    if (!oldLot.rows[0]) throw new Error('Fixture lot missing')
    await f.inventory.updateLotSellingPrice(
      f.tenant.id, f.product.id, oldLot.rows[0].id, '2200', f.owner.id,
    )
    await f.inventory.adjustStock(f.tenant.id, f.owner.id, f.product.defaultVariantId, {
      deltaBaseQty: '5', note: 'New current-price lot',
      unitCostPaisa: '1000', sellingPricePaisa: '2200',
      businessDate: '2026-09-27',
    })
    const loadedResponse = await f.request(f.ownerCookie, `/${created.id}`)
    expect(loadedResponse.status).toBe(200)
    const loaded = await loadedResponse.json() as Record<string, unknown> & {
      lines: Array<{ quote: { availableOwnBaseQty: string; effectiveUnitSellingPricePaisa: string }; shortageResolution?: unknown }>
    }
    expect(loaded.name).toBe('Bathroom package')
    expect(loaded.lines).toHaveLength(1)
    expect(loaded.lines[0]?.quote.availableOwnBaseQty).toBe('15')
    expect(loaded.lines[0]?.quote.effectiveUnitSellingPricePaisa).toBe('2200')
    expect(loaded.lines[0]?.shortageResolution).toBeUndefined()
    expect(loaded).not.toHaveProperty('customer')
    expect(loaded).not.toHaveProperty('payments')
    expect(loaded).not.toHaveProperty('draftId')
    const counts = await getPool().query<{ sales: string; drafts: string }>(
      `SELECT
        (SELECT count(*)::text FROM sales_invoices WHERE tenant_id = $1) sales,
        (SELECT count(*)::text FROM sales_drafts WHERE tenant_id = $1) drafts`,
      [f.tenant.id],
    )
    expect(counts.rows[0]).toEqual({ sales: '0', drafts: '0' })
  })

  it('allows management of a saved template after its Product becomes inactive', async () => {
    const f = await fixture('Template Inactive Management')
    const createdResponse = await f.request(f.ownerCookie, '', 'POST', {
      name: 'Old package', lines: [f.line],
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: string; version: number }
    await getPool().query(
      'UPDATE products SET is_active = FALSE WHERE tenant_id = $1 AND id = $2',
      [f.tenant.id, f.product.id],
    )
    expect((await f.request(f.ownerCookie, `/${created.id}`)).status).toBe(400)
    const editResponse = await f.request(f.ownerCookie, `/${created.id}/edit`)
    expect(editResponse.status).toBe(200)
    const edit = await editResponse.json() as { lines: unknown[] }
    expect(edit.lines).toHaveLength(1)
    const renamed = await f.request(f.ownerCookie, `/${created.id}`, 'PATCH', {
      expectedVersion: created.version, name: 'Renamed package',
    })
    expect(renamed.status).toBe(200)
    const updated = await renamed.json() as { version: number; name: string }
    expect(updated.name).toBe('Renamed package')
    expect((await f.request(f.ownerCookie, `/${created.id}/archive`, 'POST', {
      expectedVersion: updated.version,
    })).status).toBe(200)
  })

  it('keeps duplicates independent and archives templates with version checks', async () => {
    const f = await fixture('Template Lifecycle')
    const create = await f.request(f.ownerCookie, '', 'POST', {
      name: 'Original', lines: [f.line],
    })
    expect(create.status).toBe(201)
    const first = await create.json() as { id: string; version: number }
    const duplicate = await f.request(f.ownerCookie, `/${first.id}/duplicate`, 'POST', {
      name: 'Copy',
    })
    expect(duplicate.status).toBe(201)
    const copy = await duplicate.json() as { id: string; name: string }
    expect(copy.id).not.toBe(first.id)
    expect(copy.name).toBe('Copy')
    const archived = await f.request(f.ownerCookie, `/${first.id}/archive`, 'POST', {
      expectedVersion: first.version,
    })
    expect(archived.status).toBe(200)
    expect((await f.request(f.ownerCookie, `/${first.id}`)).status).toBe(404)
    expect((await f.request(f.ownerCookie, `/${copy.id}`)).status).toBe(200)
  })
})
