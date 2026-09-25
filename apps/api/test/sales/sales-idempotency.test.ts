import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { SalesDraftService } from '../../src/modules/sales/sales-draft.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie')
  if (!header) {
    throw new Error('Session cookie was not set')
  }

  const cookie = header.split(';')[0]
  if (!cookie?.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Unexpected session cookie')
  }

  return cookie
}

async function createFixture(name: string) {
  const tenant = await createProductTestTenant(name)
  const auth = new AuthService()
  const password = 'strong-password-123'
  const user = await auth.createUser({
    tenantId: tenant.id,
    name: `${name} Owner`,
    email: `owner-${randomUUID()}@example.com`,
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
      name: `${name} Product`,
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '500',
      defaultSellingPricePaisa: '1000',
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
      deltaBaseQty: '20',
      note: 'Idempotency fixture',
      unitCostPaisa: '500',
      sellingPricePaisa: '1000',
      businessDate: '2026-09-01',
    },
  )

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
    product,
    inventory,
    cookie: cookieFrom(login),
  }
}


async function ownStock(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<string> {
  const lots = await fixture.inventory.listLots(
    fixture.tenant.id,
    fixture.product.defaultVariantId,
  )

  return lots
    .reduce(
      (total, lot) => total + Number(lot.remainingBaseQty),
      0,
    )
    .toString()
}

function payload(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  operationId: string,
) {
  return {
    operationId,
    businessDate: '2026-09-25',
    customer: {
      name: 'Idempotent Buyer',
      phone: '01799999999',
      guardianName: '',
      address: '',
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
        amountPaisa: '1000',
      },
    ],
  }
}

async function postSale(cookie: string, body: unknown) {
  return app.request('http://localhost/api/private/sales', {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function countRows(
  tenantId: string,
): Promise<{
  invoices: string
  lines: string
  payments: string
  movements: string
  customerLedger: string
}> {
  const result = await getPool().query<{
    invoices: string
    lines: string
    payments: string
    movements: string
    customer_ledger: string
  }>(
    `SELECT
       (SELECT COUNT(*) FROM sales_invoices WHERE tenant_id = $1)::text
         AS invoices,
       (SELECT COUNT(*) FROM sales_lines WHERE tenant_id = $1)::text
         AS lines,
       (SELECT COUNT(*) FROM sales_payments WHERE tenant_id = $1)::text
         AS payments,
       (
         SELECT COUNT(*)
         FROM inventory_movements
         WHERE tenant_id = $1 AND movement_type = 'SALE'
       )::text AS movements,
       (
         SELECT COUNT(*)
         FROM customer_ledger_entries
         WHERE tenant_id = $1
       )::text AS customer_ledger`,
    [tenantId],
  )

  const row = result.rows[0]!
  return {
    invoices: row.invoices,
    lines: row.lines,
    payments: row.payments,
    movements: row.movements,
    customerLedger: row.customer_ledger,
  }
}

describe.skipIf(!hasDatabase)('mature sales numbering and idempotency', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('allocates tenant-local sequential Invoice Numbers', async () => {
    const tenantA = await createFixture('Invoice Number Tenant A')
    const tenantB = await createFixture('Invoice Number Tenant B')

    const firstA = await postSale(
      tenantA.cookie,
      payload(tenantA, randomUUID()),
    )
    const secondA = await postSale(
      tenantA.cookie,
      payload(tenantA, randomUUID()),
    )
    const firstB = await postSale(
      tenantB.cookie,
      payload(tenantB, randomUUID()),
    )

    expect(firstA.status).toBe(201)
    expect(secondA.status).toBe(201)
    expect(firstB.status).toBe(201)

    expect(await firstA.json()).toMatchObject({
      invoiceNumber: 'INV-000001',
    })
    expect(await secondA.json()).toMatchObject({
      invoiceNumber: 'INV-000002',
    })
    expect(await firstB.json()).toMatchObject({
      invoiceNumber: 'INV-000001',
    })
  })

  it('allocates unique consecutive Invoice Numbers under concurrent sale requests', async () => {
    const fixture = await createFixture('Concurrent Invoice Numbers')

    const [one, two] = await Promise.all([
      postSale(
        fixture.cookie,
        payload(fixture, randomUUID()),
      ),
      postSale(
        fixture.cookie,
        payload(fixture, randomUUID()),
      ),
    ])

    expect(one.status).toBe(201)
    expect(two.status).toBe(201)

    const bodies = await Promise.all([one.json(), two.json()]) as Array<{
      invoiceNumber: string
    }>
    expect(
      bodies.map((body) => body.invoiceNumber).sort(),
    ).toEqual(['INV-000001', 'INV-000002'])

    const persisted = await getPool().query<{
      invoice_number: string
    }>(
      `SELECT invoice_number
       FROM sales_invoices
       WHERE tenant_id = $1
       ORDER BY invoice_number`,
      [fixture.tenant.id],
    )
    expect(persisted.rows.map((row) => row.invoice_number)).toEqual([
      'INV-000001',
      'INV-000002',
    ])
  })

  it('returns the existing committed Invoice for the same operationId without repeating mutations', async () => {
    const fixture = await createFixture('Idempotent Sale Retry')
    const operationId = randomUUID()
    const request = payload(fixture, operationId)

    const first = await postSale(fixture.cookie, request)
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as {
      id: string
      invoiceNumber: string
    }
    const afterFirst = await countRows(fixture.tenant.id)
    const stockAfterFirst = await ownStock(fixture)

    const retry = await postSale(fixture.cookie, request)
    expect(retry.status).toBe(201)
    const retryBody = (await retry.json()) as {
      id: string
      invoiceNumber: string
    }

    expect(retryBody).toMatchObject({
      id: firstBody.id,
      invoiceNumber: firstBody.invoiceNumber,
    })
    expect(await countRows(fixture.tenant.id)).toEqual(afterFirst)
    expect(await ownStock(fixture)).toBe(stockAfterFirst)
    expect(afterFirst).toMatchObject({
      invoices: '1',
      lines: '1',
      payments: '1',
      movements: '1',
      customerLedger: '0',
    })
  })

  it('keeps direct and draft operation IDs bound to their original sale source', async () => {
    const fixture = await createFixture('Operation Source Binding')
    const drafts = new SalesDraftService(fixture.tenant.id, getPool())
    const makeDraft = () => drafts.create(fixture.user.id, {
      customer: { selectedCustomerId: null, name: 'Draft Buyer', phone: '01777777777', guardianName: '', address: '' },
      discountPaisa: '0', payments: [], note: '',
      lines: [{
        variantId: fixture.product.defaultVariantId,
        quantityInput: { kind: 'SIMPLE' as const, baseQty: '1' },
        normalizedQuantitySnapshot: { baseQty: '1', pricingQty: '1', displayQty: '1', components: {}, snapshot: null },
        pricingMode: 'AUTO' as const, manualUnitSellingPricePaisa: null,
        shortageResolution: null, serialIds: [], batchSelection: null,
        warrantySnapshot: null, captureValues: {},
      }],
    })

    const draftFirst = await makeDraft()
    const draftOperation = randomUUID()
    const draftSale = await drafts.post(fixture.user.id, draftFirst.id, draftFirst.version, {
      operationId: draftOperation, businessDate: '2026-09-25', canOverrideSellingPrice: true,
    })
    const directAgainstDraft = await postSale(fixture.cookie, payload(fixture, draftOperation))
    expect(directAgainstDraft.status).toBe(409)
    expect(await drafts.post(fixture.user.id, draftFirst.id, draftFirst.version, {
      operationId: draftOperation, businessDate: '2026-09-25', canOverrideSellingPrice: true,
    })).toMatchObject({ id: draftSale.id })

    const directOperation = randomUUID()
    const direct = await postSale(fixture.cookie, payload(fixture, directOperation))
    expect(direct.status).toBe(201)
    const directSale = await direct.json() as { id: string }
    const directRetry = await postSale(fixture.cookie, payload(fixture, directOperation))
    expect(directRetry.status).toBe(201)
    expect(await directRetry.json()).toMatchObject({ id: directSale.id })
    const draftSecond = await makeDraft()
    await expect(drafts.post(fixture.user.id, draftSecond.id, draftSecond.version, {
      operationId: directOperation, businessDate: '2026-09-25', canOverrideSellingPrice: true,
    })).rejects.toThrow(/operation|draft|conflict/i)
    expect(await drafts.get(draftSecond.id, fixture.user.id)).toMatchObject({ status: 'ACTIVE', postedSaleId: null })
    expect((await countRows(fixture.tenant.id)).invoices).toBe('2')
  })

  it('scopes operationId idempotency to the authenticated tenant', async () => {
    const tenantA = await createFixture('Operation Tenant A')
    const tenantB = await createFixture('Operation Tenant B')
    const operationId = randomUUID()

    const [responseA, responseB] = await Promise.all([
      postSale(tenantA.cookie, payload(tenantA, operationId)),
      postSale(tenantB.cookie, payload(tenantB, operationId)),
    ])

    expect(responseA.status).toBe(201)
    expect(responseB.status).toBe(201)
    expect(await responseA.json()).toMatchObject({
      invoiceNumber: 'INV-000001',
    })
    expect(await responseB.json()).toMatchObject({
      invoiceNumber: 'INV-000001',
    })
    expect((await countRows(tenantA.tenant.id)).invoices).toBe('1')
    expect((await countRows(tenantB.tenant.id)).invoices).toBe('1')
  })

  it('reconstructs the same discounted Cash-over-tender Invoice on idempotent retry', async () => {
    const fixture = await createFixture('Idempotent Mature Economics')
    const operationId = randomUUID()
    const request = payload(fixture, operationId)
    request.discountPaisa = '100'
    request.payments[0]!.amountPaisa = '1200'

    const first = await postSale(fixture.cookie, request)
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as Record<string, unknown>

    expect(firstBody).toMatchObject({
      subtotalPaisa: '1000',
      discountPaisa: '100',
      grandTotalPaisa: '900',
      paidAmountPaisa: '900',
      duePaisa: '0',
      changePaisa: '300',
      grossProfitPaisa: '400',
      lines: [
        expect.objectContaining({
          grossAmountPaisa: '1000',
          allocatedDiscountPaisa: '100',
          netAmountPaisa: '900',
          grossProfitPaisa: '400',
        }),
      ],
    })

    const retry = await postSale(fixture.cookie, request)
    expect(retry.status).toBe(201)
    expect(await retry.json()).toEqual(firstBody)
  })

})
