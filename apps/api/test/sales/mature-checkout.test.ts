import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { CustomerService } from '../../src/modules/customers/customer.service'
import { FinanceRepository } from '../../src/modules/finance/finance.repository'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { ConversionService } from '../../src/modules/products/conversion.service'
import { SalesService } from '../../src/modules/sales/sales.service'
import type { CommitSaleInput } from '../../src/modules/sales/sales.types'
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


async function paymentRows(tenantId: string) {
  const result = await getPool().query<{
    method: string
    financial_account_id: string | null
    tendered_amount_paisa: string
    applied_amount_paisa: string
  }>(
    `SELECT
       method,
       financial_account_id,
       tendered_amount_paisa::text,
       applied_amount_paisa::text
     FROM sales_payments
     WHERE tenant_id = $1
     ORDER BY created_at, id`,
    [tenantId],
  )

  return result.rows
}

async function createPaymentAccounts(tenantId: string) {
  const finance = new FinanceRepository(getPool())
  const bankOne = await finance.createAccount({
    tenantId,
    type: 'BANK',
    name: 'DBBL Main',
    provider: 'DBBL',
    accountReference: '001',
  })
  const bankTwo = await finance.createAccount({
    tenantId,
    type: 'BANK',
    name: 'City Bank',
    provider: 'City Bank',
    accountReference: '002',
  })
  const mobile = await finance.createAccount({
    tenantId,
    type: 'MOBILE_BANKING',
    name: 'Shop bKash',
    provider: 'bKash',
    accountReference: '01700000000',
  })

  return { bankOne, bankTwo, mobile }
}

describe.skipIf(!hasDatabase)('mature sales checkout customer identity', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('posts mixed units with exact pricing quantity and invoice history', async () => {
    const fixture = await createFixture('Mixed Sale')
    const gira = await fixture.products.createUnit({ name: 'Gira', symbol: 'gira' })
    const gauge = await fixture.products.createUnit({ name: 'Gauge', symbol: 'gauge' })
    const fabric = await fixture.products.createProduct({
      name: 'Mixed Fabric', baseUnitId: gira.id,
      defaultPurchasePricePaisa: '500', defaultSellingPricePaisa: '30000',
      openingStockBaseQty: '0', minimumStockBaseQty: '0', trackingMode: 'SIMPLE',
    }, fixture.user.id)
    await fixture.inventory.adjustStock(fixture.tenant.id, fixture.user.id, fabric.defaultVariantId, {
      deltaBaseQty: '40', note: 'Mixed sale stock', unitCostPaisa: '500',
      sellingPricePaisa: '30000', businessDate: '2026-09-01',
    })
    const profile = await new ConversionService(fixture.tenant.id, getPool()).replaceActiveProfile(fabric.id, {
      type: 'COMPOUND', baseUnitId: gira.id, pricingUnitId: gauge.id,
      pricingBaseFactorNumerator: '16', pricingBaseFactorDenominator: '1', displayPrecision: 2,
      components: [
        { key: 'gauge', label: 'Gauge', unitId: gauge.id, baseFactorNumerator: '16', baseFactorDenominator: '1', sortOrder: 0, minValue: '0', maxExclusive: null, allowFraction: false, autoNormalizeRemainder: false },
        { key: 'gira', label: 'Gira', unitId: gira.id, baseFactorNumerator: '1', baseFactorDenominator: '1', sortOrder: 1, minValue: '0', maxExclusive: '16', allowFraction: false, autoNormalizeRemainder: false },
      ],
    })
    const sale = await new SalesService(getPool()).commitSale(fixture.tenant.id, fixture.user.id, false, {
      operationId: randomUUID(), businessDate: '2026-09-25',
      customer: { name: 'Buyer', phone: '01711111111' }, discountPaisa: '0',
      lines: [{ variantId: fabric.defaultVariantId, baseQty: '35', quantityInput: {
        kind: 'COMPONENTS', profileId: profile.id, profileVersion: profile.version,
        components: { gauge: '2', gira: '3' },
      } }],
      payments: [{ clientLineId: 'cash', method: 'CASH', amountPaisa: '65625' }],
    })
    expect(sale.grandTotalPaisa).toBe('65625')
    expect(sale.lines[0]?.baseQty).toBe('35')
    const line = await getPool().query<{
      pricing_qty: string; display_components_snapshot: Record<string, string>;
      conversion_snapshot: Record<string, unknown> | null
    }>(`SELECT trim_scale(pricing_qty)::text AS pricing_qty, display_components_snapshot, conversion_snapshot
       FROM sales_lines WHERE tenant_id = $1 AND sale_id = $2`, [fixture.tenant.id, sale.id])
    expect(line.rows[0]).toMatchObject({
      pricing_qty: '2.1875', display_components_snapshot: { gauge: '2', gira: '3' },
      conversion_snapshot: { id: profile.id, version: profile.version },
    })
    const forged = await postSale(fixture.cookie, {
      operationId: randomUUID(), businessDate: '2026-09-25',
      customer: { name: 'Buyer', phone: '01711111111' }, discountPaisa: '0',
      lines: [{ variantId: fabric.defaultVariantId, baseQty: '5', quantityInput: {
        kind: 'COMPONENTS', profileId: profile.id, profileVersion: profile.version,
        components: { gauge: '2', gira: '3' },
      } }],
      payments: [{ clientLineId: 'cash', method: 'CASH', amountPaisa: '65625' }],
    })
    expect(forged.status).toBe(400)
  })

  it('uses the same authoritative conversion when no payment is entered', async () => {
    const fixture = await createFixture('Unpaid Fixed Sale')
    const carton = await fixture.products.createUnit({ name: 'Carton', symbol: 'ctn' })
    await fixture.products.replaceAlternativeUnits(fixture.product.id, [
      { unitId: carton.id, conversionMode: 'FIXED', conversionToBase: '2' },
    ])
    const sale = await new SalesService(getPool()).commitSale(fixture.tenant.id, fixture.user.id, false, {
      operationId: randomUUID(), businessDate: '2026-09-25',
      lines: [{ variantId: fixture.product.defaultVariantId, baseQty: '2',
        quantityInput: { kind: 'FIXED_UNIT', unitId: carton.id, quantity: '1' } }],
    })
    const line = await getPool().query<{ conversion_snapshot: Record<string, unknown> | null }>(
      'SELECT conversion_snapshot FROM sales_lines WHERE tenant_id = $1 AND sale_id = $2',
      [fixture.tenant.id, sale.id],
    )
    expect(line.rows[0]?.conversion_snapshot).toMatchObject({ unitId: carton.id, conversionToBase: '2' })
    expect(sale.lines[0]?.baseQty).toBe('2')
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


  it('accepts Cash 500 + Bank 300 + bKash 200 as one paid Invoice', async () => {
    const fixture = await createFixture('Checkout Split Payment')
    const accounts = await createPaymentAccounts(fixture.tenant.id)
    const payload = salePayload(fixture, {
      payments: [
        {
          clientLineId: 'cash',
          method: 'CASH',
          amountPaisa: '500',
        },
        {
          clientLineId: 'bank',
          method: 'BANK',
          accountId: accounts.bankOne.id,
          amountPaisa: '300',
        },
        {
          clientLineId: 'bkash',
          method: 'MOBILE_BANKING',
          accountId: accounts.mobile.id,
          amountPaisa: '200',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      settlementStatus: 'PAID',
      paidAmountPaisa: '1000',
      duePaisa: '0',
      changePaisa: '0',
    })
    expect(await paymentRows(fixture.tenant.id)).toEqual([
      {
        method: 'CASH',
        financial_account_id: null,
        tendered_amount_paisa: '500',
        applied_amount_paisa: '500',
      },
      {
        method: 'BANK',
        financial_account_id: accounts.bankOne.id,
        tendered_amount_paisa: '300',
        applied_amount_paisa: '300',
      },
      {
        method: 'MOBILE_BANKING',
        financial_account_id: accounts.mobile.id,
        tendered_amount_paisa: '200',
        applied_amount_paisa: '200',
      },
    ])
  })

  it('allows the same Bank method across two different accounts', async () => {
    const fixture = await createFixture('Checkout Two Banks')
    const accounts = await createPaymentAccounts(fixture.tenant.id)
    const payload = salePayload(fixture, {
      payments: [
        {
          clientLineId: 'bank-a',
          method: 'BANK',
          accountId: accounts.bankOne.id,
          amountPaisa: '400',
        },
        {
          clientLineId: 'bank-b',
          method: 'BANK',
          accountId: accounts.bankTwo.id,
          amountPaisa: '600',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      settlementStatus: 'PAID',
      paidAmountPaisa: '1000',
      duePaisa: '0',
    })
    expect(await paymentRows(fixture.tenant.id)).toEqual([
      expect.objectContaining({
        method: 'BANK',
        financial_account_id: accounts.bankOne.id,
        applied_amount_paisa: '400',
      }),
      expect.objectContaining({
        method: 'BANK',
        financial_account_id: accounts.bankTwo.id,
        applied_amount_paisa: '600',
      }),
    ])
  })

  it.each(['BANK', 'MOBILE_BANKING'] as const)(
    'rejects %s without an exact financial account before mutation',
    async (method) => {
      const fixture = await createFixture(`Checkout Missing ${method}`)
      const payload = salePayload(fixture, {
        payments: [
          {
            clientLineId: 'missing-account',
            method,
            amountPaisa: '1000',
          },
        ],
      })

      const response = await postSale(fixture.cookie, payload)

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: expect.stringMatching(/account.*required/i),
      })
      expect((await counts(fixture.tenant.id)).invoices).toBe('0')
      const lots = await fixture.inventory.listLots(
        fixture.tenant.id,
        fixture.product.defaultVariantId,
      )
      expect(lots[0]?.remainingBaseQty).toBe('10')
    },
  )

  it('derives DUE from zero payments and stores no payment rows', async () => {
    const fixture = await createFixture('Checkout Zero Payments')
    const payload = salePayload(fixture, { payments: [] })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      settlementStatus: 'DUE',
      paidAmountPaisa: '0',
      duePaisa: '1000',
      changePaisa: '0',
    })
    expect(await paymentRows(fixture.tenant.id)).toEqual([])
  })

  it('derives PARTIAL from an underpayment', async () => {
    const fixture = await createFixture('Checkout Partial Payment')
    const payload = salePayload(fixture, {
      payments: [
        {
          clientLineId: 'cash-partial',
          method: 'CASH',
          amountPaisa: '400',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      settlementStatus: 'PARTIAL',
      paidAmountPaisa: '400',
      duePaisa: '600',
      changePaisa: '0',
    })
    expect(await paymentRows(fixture.tenant.id)).toEqual([
      expect.objectContaining({
        method: 'CASH',
        tendered_amount_paisa: '400',
        applied_amount_paisa: '400',
      }),
    ])
  })

  it('caps Cash over-tender at Grand Total and returns physical Change without creating Customer Credit', async () => {
    const fixture = await createFixture('Checkout Cash Change')
    const payload = salePayload(fixture, {
      payments: [
        {
          clientLineId: 'cash-change',
          method: 'CASH',
          amountPaisa: '1200',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      settlementStatus: 'PAID',
      paidAmountPaisa: '1000',
      duePaisa: '0',
      changePaisa: '200',
    })
    expect(await paymentRows(fixture.tenant.id)).toEqual([
      expect.objectContaining({
        method: 'CASH',
        tendered_amount_paisa: '1200',
        applied_amount_paisa: '1000',
      }),
    ])
    expect((await counts(fixture.tenant.id)).customers).toBe('0')
    expect(await fixture.customers.resolveByPhone('01711111111')).toMatchObject({
      kind: 'NONE',
    })
  })

  it('rejects Bank and Mobile Banking overpayment when no Cash can absorb Change', async () => {
    const fixture = await createFixture('Checkout Non Cash Overpay')
    const accounts = await createPaymentAccounts(fixture.tenant.id)
    const payload = salePayload(fixture, {
      payments: [
        {
          clientLineId: 'bank-over',
          method: 'BANK',
          accountId: accounts.bankOne.id,
          amountPaisa: '700',
        },
        {
          clientLineId: 'mobile-over',
          method: 'MOBILE_BANKING',
          accountId: accounts.mobile.id,
          amountPaisa: '400',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/overpayment|change.*cash/i),
    })
    expect((await counts(fixture.tenant.id)).invoices).toBe('0')
  })

  it('uses Cash as the Change source when Cash 600 + Bank 300 + bKash 200 tenders 1100 on a 1000 Invoice', async () => {
    const fixture = await createFixture('Checkout Mixed Change')
    const accounts = await createPaymentAccounts(fixture.tenant.id)
    const payload = salePayload(fixture, {
      payments: [
        {
          clientLineId: 'cash-mixed',
          method: 'CASH',
          amountPaisa: '600',
        },
        {
          clientLineId: 'bank-mixed',
          method: 'BANK',
          accountId: accounts.bankOne.id,
          amountPaisa: '300',
        },
        {
          clientLineId: 'mobile-mixed',
          method: 'MOBILE_BANKING',
          accountId: accounts.mobile.id,
          amountPaisa: '200',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      settlementStatus: 'PAID',
      paidAmountPaisa: '1000',
      duePaisa: '0',
      changePaisa: '100',
    })
    expect(await paymentRows(fixture.tenant.id)).toEqual([
      expect.objectContaining({
        method: 'CASH',
        tendered_amount_paisa: '600',
        applied_amount_paisa: '500',
      }),
      expect.objectContaining({
        method: 'BANK',
        financial_account_id: accounts.bankOne.id,
        applied_amount_paisa: '300',
      }),
      expect.objectContaining({
        method: 'MOBILE_BANKING',
        financial_account_id: accounts.mobile.id,
        applied_amount_paisa: '200',
      }),
    ])
  })

  it('allows CUSTOMER_CREDIT only for a resolved Customer with enough available credit', async () => {
    const fixture = await createFixture('Checkout Customer Credit')
    const customer = await fixture.customers.create({
      name: 'Credit Buyer',
      phone: '01777777777',
    })
    await getPool().query(
      `INSERT INTO customer_ledger_entries
       (
         tenant_id,
         customer_id,
         business_date,
         entry_type,
         amount_paisa,
         source_type,
         notes
       )
       VALUES ($1,$2,'2026-09-24','ADVANCE',-1500,'OPENING','Credit fixture')`,
      [fixture.tenant.id, customer.id],
    )

    const payload = salePayload(fixture, {
      selectedCustomerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      payments: [
        {
          clientLineId: 'customer-credit',
          method: 'CUSTOMER_CREDIT',
          amountPaisa: '1000',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      customerId: customer.id,
      settlementStatus: 'PAID',
      paidAmountPaisa: '1000',
      duePaisa: '0',
      changePaisa: '0',
    })
    expect(await paymentRows(fixture.tenant.id)).toEqual([
      expect.objectContaining({
        method: 'CUSTOMER_CREDIT',
        financial_account_id: null,
        tendered_amount_paisa: '1000',
        applied_amount_paisa: '1000',
      }),
    ])
    expect(await fixture.customers.balance(customer.id)).toBe('-500')
  })

  it('rejects CUSTOMER_CREDIT when the resolved Customer does not have enough credit', async () => {
    const fixture = await createFixture('Checkout Insufficient Credit')
    const customer = await fixture.customers.create({
      name: 'Small Credit Buyer',
      phone: '01788888888',
    })
    await getPool().query(
      `INSERT INTO customer_ledger_entries
       (
         tenant_id,
         customer_id,
         business_date,
         entry_type,
         amount_paisa,
         source_type,
         notes
       )
       VALUES ($1,$2,'2026-09-24','ADVANCE',-500,'OPENING','Credit fixture')`,
      [fixture.tenant.id, customer.id],
    )

    const payload = salePayload(fixture, {
      selectedCustomerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      payments: [
        {
          clientLineId: 'customer-credit-too-large',
          method: 'CUSTOMER_CREDIT',
          amountPaisa: '1000',
        },
      ],
    })

    const response = await postSale(fixture.cookie, payload)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/customer credit.*insufficient|insufficient.*credit/i),
    })
    expect((await counts(fixture.tenant.id)).invoices).toBe('0')
    expect(await fixture.customers.balance(customer.id)).toBe('-500')
  })


  it('rolls back invoice, lines, stock, payments, financial movement and Customer ledger after an injected late failure', async () => {
    const fixture = await createFixture('Checkout Atomic Rollback')
    const triggerSuffix = randomUUID().replaceAll('-', '')
    const functionName = `test_fail_sale_due_${triggerSuffix}`
    const triggerName = `test_fail_sale_due_trigger_${triggerSuffix}`

    const before = await getPool().query<{
      invoices: string
      lines: string
      payments: string
      sale_movements: string
      financial_movements: string
      ledger: string
      customers: string
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
         )::text AS sale_movements,
         (
           SELECT COUNT(*)
           FROM financial_movements
           WHERE tenant_id = $1 AND source_type = 'SALE'
         )::text AS financial_movements,
         (
           SELECT COUNT(*)
           FROM customer_ledger_entries
           WHERE tenant_id = $1
         )::text AS ledger,
         (SELECT COUNT(*) FROM customers WHERE tenant_id = $1)::text
           AS customers`,
      [fixture.tenant.id],
    )

    await getPool().query(
      `CREATE FUNCTION ${functionName}()
       RETURNS trigger
       LANGUAGE plpgsql
       AS $$
       BEGIN
         IF NEW.tenant_id = '${fixture.tenant.id}'::uuid
            AND NEW.source_type = 'SALE'
            AND NEW.entry_type = 'SALE_DUE' THEN
           RAISE EXCEPTION 'Injected checkout failure';
         END IF;
         RETURN NEW;
       END;
       $$`,
    )
    await getPool().query(
      `CREATE TRIGGER ${triggerName}
       BEFORE INSERT ON customer_ledger_entries
       FOR EACH ROW
       EXECUTE FUNCTION ${functionName}()`,
    )

    const input: CommitSaleInput = {
      operationId: randomUUID(),
      businessDate: '2026-09-25',
      customer: {
        name: 'Rollback Buyer',
        phone: '01799990000',
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
          clientLineId: 'rollback-cash',
          method: 'CASH',
          amountPaisa: '400',
        },
      ],
    }

    try {
      await expect(
        new SalesService(getPool()).commitSale(
          fixture.tenant.id,
          fixture.user.id,
          true,
          input,
        ),
      ).rejects.toThrow('Injected checkout failure')
    } finally {
      await getPool().query(
        `DROP TRIGGER IF EXISTS ${triggerName}
         ON customer_ledger_entries`,
      )
      await getPool().query(
        `DROP FUNCTION IF EXISTS ${functionName}()`,
      )
    }

    const after = await getPool().query<{
      invoices: string
      lines: string
      payments: string
      sale_movements: string
      financial_movements: string
      ledger: string
      customers: string
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
         )::text AS sale_movements,
         (
           SELECT COUNT(*)
           FROM financial_movements
           WHERE tenant_id = $1 AND source_type = 'SALE'
         )::text AS financial_movements,
         (
           SELECT COUNT(*)
           FROM customer_ledger_entries
           WHERE tenant_id = $1
         )::text AS ledger,
         (SELECT COUNT(*) FROM customers WHERE tenant_id = $1)::text
           AS customers`,
      [fixture.tenant.id],
    )

    expect(after.rows[0]).toEqual(before.rows[0])

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('10')
  })

})
