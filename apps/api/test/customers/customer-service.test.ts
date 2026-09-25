import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import {
  CustomerService,
  normalizePhone,
} from '../../src/modules/customers/customer.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabase)('Customer foundation', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('normalizes Bangladesh mobile prefixes conservatively', () => {
    expect(normalizePhone('01711-223344')).toBe('01711223344')
    expect(normalizePhone('+880 1711 223344')).toBe('01711223344')
    expect(normalizePhone('8801711223344')).toBe('01711223344')
    expect(normalizePhone('02-123 456')).toBe('02123456')
    expect(normalizePhone('')).toBe('')
  })

  it('creates tenant-scoped Customer codes and searches by code, name and normalized phone', async () => {
    const tenant = await createProductTestTenant('Customer Search')
    const customers = new CustomerService(tenant.id, getPool())

    const first = await customers.create({
      name: 'Karim Hardware',
      phone: '+880 1711 223344',
      guardianName: 'Abdul Karim',
      address: 'Natore',
    })
    const second = await customers.create({
      name: 'Rahim Traders',
      phone: '01811-445566',
      guardianName: '',
      address: 'Rajshahi',
    })

    expect(first).toMatchObject({
      customerCode: 'CUS-00001',
      normalizedPhone: '01711223344',
    })
    expect(second.customerCode).toBe('CUS-00002')

    await expect(customers.search('CUS-00001')).resolves.toEqual([
      expect.objectContaining({ id: first.id }),
    ])
    await expect(customers.search('karim')).resolves.toEqual([
      expect.objectContaining({ id: first.id }),
    ])
    await expect(customers.search('8801711223344')).resolves.toEqual([
      expect.objectContaining({ id: first.id }),
    ])
  })

  it('returns an ambiguity result when more than one active Customer has the same normalized phone', async () => {
    const tenant = await createProductTestTenant('Customer Ambiguity')
    const customers = new CustomerService(tenant.id, getPool())

    const first = await customers.create({
      name: 'Karim One',
      phone: '01711 223344',
    })

    expect(
      await customers.resolveByPhone('+8801711223344'),
    ).toEqual({
      kind: 'UNIQUE',
      normalizedPhone: '01711223344',
      customer: expect.objectContaining({ id: first.id }),
      matches: [expect.objectContaining({ id: first.id })],
    })

    const second = await customers.create({
      name: 'Karim Two',
      phone: '8801711223344',
    })

    const resolution = await customers.resolveByPhone('01711-223344')
    expect(resolution).toMatchObject({
      kind: 'AMBIGUOUS',
      normalizedPhone: '01711223344',
      customer: null,
    })
    expect(resolution.matches.map((item) => item.id).sort()).toEqual(
      [first.id, second.id].sort(),
    )
  })

  it('isolates phone resolution by tenant', async () => {
    const tenantA = await createProductTestTenant('Customer Tenant A')
    const tenantB = await createProductTestTenant('Customer Tenant B')
    const a = new CustomerService(tenantA.id, getPool())
    const b = new CustomerService(tenantB.id, getPool())

    const customerA = await a.create({
      name: 'Tenant A Customer',
      phone: '01700111222',
    })
    await b.create({
      name: 'Tenant B Customer',
      phone: '+8801700111222',
    })

    await expect(a.resolveByPhone('8801700111222')).resolves.toMatchObject({
      kind: 'UNIQUE',
      customer: expect.objectContaining({ id: customerA.id }),
    })
  })

  it('computes live Customer balance only from signed ledger entries', async () => {
    const tenant = await createProductTestTenant('Customer Balance')
    const customers = new CustomerService(tenant.id, getPool())
    const customer = await customers.create({
      name: 'Balance Customer',
      phone: '01700999888',
    })

    expect(await customers.balance(customer.id)).toBe('0')

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
       VALUES
         ($1,$2,'2026-09-24','SALE_DUE',97000,'SALE',''),
         ($1,$2,'2026-09-25','PAYMENT',-47000,'PAYMENT','')`,
      [tenant.id, customer.id],
    )

    expect(await customers.balance(customer.id)).toBe('50000')

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
       VALUES ($1,$2,'2026-09-25','CREDIT',-60000,'ADJUSTMENT','')`,
      [tenant.id, customer.id],
    )

    expect(await customers.balance(customer.id)).toBe('-10000')
  })
})
