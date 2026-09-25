import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { CustomerService } from '../../src/modules/customers/customer.service'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
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

async function createFixture(name: string) {
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
      deltaBaseQty: '10',
      note: 'Mature checkout fixture',
      unitCostPaisa: '500',
      sellingPricePaisa: '1000',
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
  expect(login.status).toBe(200)

  return {
    tenant,
    user,
    product,
    products,
    unit,
    inventory,
    customers: new CustomerService(tenant.id, getPool()),
    cookie: sessionCookie(login.headers.get('set-cookie')),
  }
}

async function postSale(
  cookie: string,
  body: Record<string, unknown>,
) {
  return app.request('http://localhost/api/private/sales', {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function salePayload(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  input: {
    name?: string
    phone?: string
    selectedCustomerId?: string
    payments?: Array<Record<string, unknown>>
  } = {},
) {
  return {
    operationId: randomUUID(),
    businessDate: '2026-09-25',
    customer: {
      ...(input.selectedCustomerId
        ? { selectedCustomerId: input.selectedCustomerId }
        : {}),
      name: input.name ?? 'Karim Buyer',
      phone: input.phone ?? '01711111111',
      guardianName: 'Rahim',
      address: 'Natore',
    },
    discountPaisa: '0',
    lines: [
      {
        variantId: fixture.product.defaultVariantId,
        baseQty: '1',
      },
    ],
    payments:
      input.payments ??
      [
        {
          clientLineId: 'cash-1',
          method: 'CASH',
          amountPaisa: '1000',
        },
      ],
  }
}

async function invoiceJson(tenantId: string) {
  const result = await getPool().query<{ invoice: Record<string, unknown> }>(
    `SELECT to_jsonb(i) AS invoice
     FROM sales_invoices i
     WHERE i.tenant_id = $1
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT 1`,
    [tenantId],
  )

  return result.rows[0]?.invoice ?? null
}

async function counts(tenantId: string) {
  const result = await getPool().query<{
    invoices: string
    customers: string
    ledger: string
  }>(
    `SELECT
       (SELECT COUNT(*) FROM sales_invoices WHERE tenant_id = $1)::text
         AS invoices,
       (SELECT COUNT(*) FROM customers WHERE tenant_id = $1)::text
         AS customers,
       (
         SELECT COUNT(*)
         FROM customer_ledger_entries
         WHERE tenant_id = $1
       )::text AS ledger`,
    [tenantId],
  )

  return result.rows[0]!
}

describe.skipIf(!hasDatabase)('mature sales checkout customer identity', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('requires a Customer name before any sale mutation', async () => {
    const fixture = await createFixture('Checkout Missing Name')
    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, { name: '   ' }),
    )

    expect(response.status).toBe(400)
    await expect(counts(fixture.tenant.id)).resolves.toEqual({
      invoices: '0',
      customers: '0',
      ledger: '0',
    })
  })

  it('requires a Customer phone before any sale mutation', async () => {
    const fixture = await createFixture('Checkout Missing Phone')
    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, { phone: '   ' }),
    )

    expect(response.status).toBe(400)
    await expect(counts(fixture.tenant.id)).resolves.toEqual({
      invoices: '0',
      customers: '0',
      ledger: '0',
    })
  })

  it('stores a fully paid walk-in snapshot without creating a Customer or receivable', async () => {
    const fixture = await createFixture('Checkout Paid Walk In')
    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, {
        name: 'Karim Mia',
        phone: '+8801711111111',
      }),
    )

    expect(response.status).toBe(201)
    expect(await invoiceJson(fixture.tenant.id)).toMatchObject({
      customer_id: null,
      customer_name_snapshot: 'Karim Mia',
      customer_phone_snapshot: '+8801711111111',
      customer_normalized_phone_snapshot: '01711111111',
      customer_guardian_name_snapshot: 'Rahim',
      customer_address_snapshot: 'Natore',
    })
    await expect(counts(fixture.tenant.id)).resolves.toEqual({
      invoices: '1',
      customers: '0',
      ledger: '0',
    })
  })

  it('keeps an explicitly selected Customer linked even when the sale is fully paid', async () => {
    const fixture = await createFixture('Checkout Paid Existing')
    const customer = await fixture.customers.create({
      name: 'Existing Buyer',
      phone: '01722222222',
      guardianName: 'Master Guardian',
      address: 'Master Address',
    })

    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, {
        selectedCustomerId: customer.id,
        name: 'Stale Draft Name',
        phone: '01999999999',
      }),
    )

    expect(response.status).toBe(201)
    expect(await invoiceJson(fixture.tenant.id)).toMatchObject({
      customer_id: customer.id,
      customer_name_snapshot: 'Existing Buyer',
      customer_phone_snapshot: '01722222222',
      customer_guardian_name_snapshot: 'Master Guardian',
      customer_address_snapshot: 'Master Address',
    })
    await expect(counts(fixture.tenant.id)).resolves.toEqual({
      invoices: '1',
      customers: '1',
      ledger: '0',
    })
  })

  it('posts a Due sale to the exact selected Customer even when the phone is ambiguous', async () => {
    const fixture = await createFixture('Checkout Due Selected')
    const first = await fixture.customers.create({
      name: 'First Duplicate',
      phone: '01733333333',
    })
    const selected = await fixture.customers.create({
      name: 'Selected Duplicate',
      phone: '+8801733333333',
    })

    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, {
        selectedCustomerId: selected.id,
        name: 'Typed Name',
        phone: '01733333333',
        payments: [],
      }),
    )

    expect(response.status).toBe(201)
    expect(await invoiceJson(fixture.tenant.id)).toMatchObject({
      customer_id: selected.id,
      customer_name_snapshot: 'Selected Duplicate',
      customer_phone_snapshot: '+8801733333333',
      settlement_status: 'DUE',
      due_paisa: 1000,
    })

    const ledger = await getPool().query<{
      customer_id: string
      amount_paisa: string
    }>(
      `SELECT customer_id, amount_paisa::text
       FROM customer_ledger_entries
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(ledger.rows).toEqual([
      {
        customer_id: selected.id,
        amount_paisa: '1000',
      },
    ])

    const firstBalance = await fixture.customers.balance(first.id)
    const selectedBalance = await fixture.customers.balance(selected.id)
    expect(firstBalance).toBe('0')
    expect(selectedBalance).toBe('1000')
  })

  it('resolves a Due sale to the unique normalized-phone Customer', async () => {
    const fixture = await createFixture('Checkout Due Unique Phone')
    const customer = await fixture.customers.create({
      name: 'Unique Existing',
      phone: '01744444444',
    })

    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, {
        name: 'Typed Snapshot',
        phone: '+8801744444444',
        payments: [],
      }),
    )

    expect(response.status).toBe(201)
    expect(await invoiceJson(fixture.tenant.id)).toMatchObject({
      customer_id: customer.id,
      settlement_status: 'DUE',
      due_paisa: 1000,
    })
    expect(await fixture.customers.balance(customer.id)).toBe('1000')
    expect((await counts(fixture.tenant.id)).customers).toBe('1')
  })

  it('creates a Customer for a Due sale when no phone match exists', async () => {
    const fixture = await createFixture('Checkout Due Create')
    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, {
        name: 'New Due Buyer',
        phone: '01755555555',
        payments: [],
      }),
    )

    expect(response.status).toBe(201)
    const invoice = await invoiceJson(fixture.tenant.id)
    expect(invoice).toMatchObject({
      customer_name_snapshot: 'New Due Buyer',
      customer_phone_snapshot: '01755555555',
      settlement_status: 'DUE',
      due_paisa: 1000,
    })
    expect(invoice?.customer_id).toEqual(expect.any(String))

    const created = await fixture.customers.resolveByPhone('01755555555')
    expect(created.kind).toBe('UNIQUE')
    if (created.kind !== 'UNIQUE') {
      throw new Error('Expected created Customer')
    }
    expect(created.customer.name).toBe('New Due Buyer')
    expect(await fixture.customers.balance(created.customer.id)).toBe(
      '1000',
    )
  })

  it('rejects an ambiguous normalized phone before writing invoice, ledger or stock', async () => {
    const fixture = await createFixture('Checkout Due Ambiguous')
    await fixture.customers.create({
      name: 'Duplicate One',
      phone: '01766666666',
    })
    await fixture.customers.create({
      name: 'Duplicate Two',
      phone: '+8801766666666',
    })

    const response = await postSale(
      fixture.cookie,
      salePayload(fixture, {
        name: 'Ambiguous Buyer',
        phone: '01766666666',
        payments: [],
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/select.*exact Customer/i),
    })
    await expect(counts(fixture.tenant.id)).resolves.toEqual({
      invoices: '0',
      customers: '2',
      ledger: '0',
    })

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('10')
  })

  it('allocates invoice discount proportionally with stable-order remainder and exact totals', async () => {
    const fixture = await createFixture('Checkout Discount Allocation')
    const secondProduct = await fixture.products.createProduct(
      {
        name: 'Discount Product Two',
        baseUnitId: fixture.unit.id,
        defaultPurchasePricePaisa: '900',
        defaultSellingPricePaisa: '2000',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      fixture.user.id,
    )
    await fixture.inventory.adjustStock(
      fixture.tenant.id,
      fixture.user.id,
      secondProduct.defaultVariantId,
      {
        deltaBaseQty: '10',
        note: 'Discount allocation fixture',
        unitCostPaisa: '900',
        sellingPricePaisa: '2000',
        businessDate: '2026-09-01',
      },
    )

    const response = await postSale(fixture.cookie, {
      operationId: randomUUID(),
      businessDate: '2026-09-25',
      customer: {
        name: 'Discount Buyer',
        phone: '01777777777',
      },
      discountPaisa: '100',
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
      payments: [
        {
          clientLineId: 'cash-discount',
          method: 'CASH',
          amountPaisa: '2900',
        },
      ],
    })

    expect(response.status).toBe(201)
    const sale = (await response.json()) as {
      subtotalPaisa?: string
      discountPaisa?: string
      grandTotalPaisa?: string
      lines?: Array<Record<string, unknown>>
    }

    expect(sale).toMatchObject({
      subtotalPaisa: '3000',
      discountPaisa: '100',
      grandTotalPaisa: '2900',
    })
    expect(sale.lines).toEqual([
      expect.objectContaining({
        grossAmountPaisa: '1000',
        allocatedDiscountPaisa: '34',
        netAmountPaisa: '966',
      }),
      expect.objectContaining({
        grossAmountPaisa: '2000',
        allocatedDiscountPaisa: '66',
        netAmountPaisa: '1934',
      }),
    ])

    const invoice = await invoiceJson(fixture.tenant.id)
    expect(invoice).toMatchObject({
      subtotal_paisa: 3000,
      discount_paisa: 100,
      grand_total_paisa: 2900,
    })

    const persistedLines = await getPool().query<{
      line: Record<string, unknown>
    }>(
      `SELECT to_jsonb(line) AS line
       FROM sales_lines line
       WHERE line.tenant_id = $1
       ORDER BY line.created_at, line.id`,
      [fixture.tenant.id],
    )
    expect(
      persistedLines.rows.reduce(
        (total, row) =>
          total +
          Number(row.line.allocated_discount_paisa ?? 0),
        0,
      ),
    ).toBe(100)
    expect(
      persistedLines.rows.reduce(
        (total, row) =>
          total + Number(row.line.net_amount_paisa ?? 0),
        0,
      ),
    ).toBe(2900)
  })

})
