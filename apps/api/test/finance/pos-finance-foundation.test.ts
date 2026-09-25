import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { CashSessionService } from '../../src/modules/finance/cash-session.service'
import { FinanceRepository } from '../../src/modules/finance/finance.repository'
import { PosSettingsService } from '../../src/modules/settings/pos-settings.service'
import { VendorService } from '../../src/modules/vendors/vendor.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabase)('POS settings foundation', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('creates the POS party, finance, settings and counter schema', async () => {
    const result = await getPool().query<{
      customers: string | null
      customer_ledger_entries: string | null
      vendors: string | null
      vendor_ledger_entries: string | null
      financial_accounts: string | null
      financial_movements: string | null
      cash_sessions: string | null
      tenant_pos_settings: string | null
      tenant_document_counters: string | null
    }>(
      `SELECT
         to_regclass('public.customers')::text AS customers,
         to_regclass('public.customer_ledger_entries')::text AS customer_ledger_entries,
         to_regclass('public.vendors')::text AS vendors,
         to_regclass('public.vendor_ledger_entries')::text AS vendor_ledger_entries,
         to_regclass('public.financial_accounts')::text AS financial_accounts,
         to_regclass('public.financial_movements')::text AS financial_movements,
         to_regclass('public.cash_sessions')::text AS cash_sessions,
         to_regclass('public.tenant_pos_settings')::text AS tenant_pos_settings,
         to_regclass('public.tenant_document_counters')::text AS tenant_document_counters`,
    )

    expect(result.rows[0]).toEqual({
      customers: 'customers',
      customer_ledger_entries: 'customer_ledger_entries',
      vendors: 'vendors',
      vendor_ledger_entries: 'vendor_ledger_entries',
      financial_accounts: 'financial_accounts',
      financial_movements: 'financial_movements',
      cash_sessions: 'cash_sessions',
      tenant_pos_settings: 'tenant_pos_settings',
      tenant_document_counters: 'tenant_document_counters',
    })
  })

  it('allows duplicate normalized Customer phones so ambiguity can fail closed in the service', async () => {
    const tenant = await createProductTestTenant('Duplicate Phone Schema')

    await expect(
      getPool().query(
        `INSERT INTO customers
         (tenant_id, customer_code, name, phone, normalized_phone)
         VALUES
           ($1, 'CUS-00001', 'Customer One', '01711111111', '01711111111'),
           ($1, 'CUS-00002', 'Customer Two', '+8801711111111', '01711111111')`,
        [tenant.id],
      ),
    ).resolves.toBeDefined()
  })

  it('defaults new tenants to safe disabled POS settings', async () => {
    const tenant = await createProductTestTenant('POS Settings Default')
    const settings = await new PosSettingsService(
      tenant.id,
      getPool(),
    ).get()

    expect(settings).toEqual({
      showPurchasePrice: false,
      requireCashSession: false,
      invoiceShareEnabled: false,
    })
  })

  it('quick-creates Vendors and keeps Vendor reads tenant-scoped', async () => {
    const tenantA = await createProductTestTenant('Vendor Tenant A')
    const tenantB = await createProductTestTenant('Vendor Tenant B')
    const a = new VendorService(tenantA.id, getPool())
    const b = new VendorService(tenantB.id, getPool())

    await expect(
      a.create({ name: '  ' }),
    ).rejects.toThrow('Vendor name is required')

    const vendorA = await a.create({
      name: 'Local Fabric Vendor',
      phone: '01700123456',
      address: 'Natore',
    })
    const vendorB = await b.create({
      name: 'Foreign Vendor',
      phone: '01800987654',
      address: 'Rajshahi',
    })

    expect(vendorA).toMatchObject({
      vendorCode: 'VEN-00001',
      name: 'Local Fabric Vendor',
      isActive: true,
    })
    expect(vendorB.vendorCode).toBe('VEN-00001')

    await expect(a.get(vendorA.id)).resolves.toMatchObject({
      id: vendorA.id,
    })
    await expect(a.get(vendorB.id)).rejects.toThrow('Vendor not found')
  })

  it('stores Bank and Mobile Banking accounts with tenant-scoped mutation', async () => {
    const tenantA = await createProductTestTenant('Finance Account A')
    const tenantB = await createProductTestTenant('Finance Account B')
    const finance = new FinanceRepository(getPool())

    const bank = await finance.createAccount({
      tenantId: tenantA.id,
      type: 'BANK',
      name: 'DBBL Current',
      provider: 'Dutch-Bangla Bank',
      accountReference: '1234',
    })
    const wallet = await finance.createAccount({
      tenantId: tenantB.id,
      type: 'MOBILE_BANKING',
      name: 'Shop bKash',
      provider: 'bKash',
      accountReference: '01700000000',
    })

    expect(bank).toMatchObject({
      type: 'BANK',
      isActive: true,
    })
    expect(wallet).toMatchObject({
      type: 'MOBILE_BANKING',
      provider: 'bKash',
    })

    await expect(
      finance.findAccount(tenantA.id, wallet.id),
    ).resolves.toBeNull()

    await expect(
      finance.updateAccount(tenantA.id, wallet.id, {
        name: 'Do Not Touch',
        provider: 'Wrong Tenant',
        accountReference: '',
        isActive: false,
      }),
    ).resolves.toBeNull()

    await expect(
      finance.findAccount(tenantB.id, wallet.id),
    ).resolves.toMatchObject({
      name: 'Shop bKash',
      isActive: true,
    })
  })


  it('opens one cash session and projects expected cash only from linked CASH movements', async () => {
    const tenant = await createProductTestTenant('Cash Session Projection')
    const user = await getPool().query<{ id: string }>(
      `INSERT INTO users
       (tenant_id, name, email, password_hash, role)
       VALUES ($1, 'Cashier', $2, 'test-hash', 'STAFF')
       RETURNING id`,
      [tenant.id, `cashier-${tenant.id}@example.com`],
    )
    const actorUserId = user.rows[0]!.id
    const service = new CashSessionService(tenant.id, getPool())

    const opened = await service.open({
      openingCashPaisa: '10000',
      actorUserId,
      notes: 'Morning drawer',
    })

    expect(opened).toMatchObject({
      status: 'OPEN',
      openingCashPaisa: '10000',
      expectedCashPaisa: '10000',
      notes: 'Morning drawer',
    })

    await expect(
      service.open({
        openingCashPaisa: '5000',
        actorUserId,
      }),
    ).rejects.toThrow('A cash session is already open')

    await getPool().query(
      `INSERT INTO financial_movements
       (
         tenant_id,
         channel,
         cash_session_id,
         business_date,
         amount_paisa,
         source_type
       )
       VALUES
         ($1, 'CASH', $2, '2026-09-25', 5000, 'SALE'),
         ($1, 'CASH', $2, '2026-09-25', -1200, 'EXPENSE'),
         ($1, 'CASH', NULL, '2026-09-25', 9999, 'UNLINKED')`,
      [tenant.id, opened.id],
    )

    await expect(service.getActive()).resolves.toMatchObject({
      id: opened.id,
      status: 'OPEN',
      openingCashPaisa: '10000',
      expectedCashPaisa: '13800',
    })
  })

  it('closes a cash session with exact expected, counted and variance paisa', async () => {
    const tenant = await createProductTestTenant('Cash Session Close')
    const user = await getPool().query<{ id: string }>(
      `INSERT INTO users
       (tenant_id, name, email, password_hash, role)
       VALUES ($1, 'Owner', $2, 'test-hash', 'OWNER')
       RETURNING id`,
      [tenant.id, `owner-${tenant.id}@example.com`],
    )
    const actorUserId = user.rows[0]!.id
    const service = new CashSessionService(tenant.id, getPool())

    const opened = await service.open({
      openingCashPaisa: '20000',
      actorUserId,
    })

    await getPool().query(
      `INSERT INTO financial_movements
       (
         tenant_id,
         channel,
         cash_session_id,
         business_date,
         amount_paisa,
         source_type
       )
       VALUES
         ($1, 'CASH', $2, '2026-09-25', 7500, 'SALE'),
         ($1, 'CASH', $2, '2026-09-25', -2500, 'VENDOR_PAYMENT')`,
      [tenant.id, opened.id],
    )

    const closed = await service.close({
      countedCashPaisa: '25250',
      actorUserId,
      notes: 'Counted at close',
    })

    expect(closed).toMatchObject({
      id: opened.id,
      status: 'CLOSED',
      openingCashPaisa: '20000',
      expectedCashPaisa: '25000',
      countedCashPaisa: '25250',
      variancePaisa: '250',
      notes: 'Counted at close',
    })
    await expect(service.getActive()).resolves.toBeNull()
  })

})
