import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { PosSettingsService } from '../../src/modules/settings/pos-settings.service'
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
})
