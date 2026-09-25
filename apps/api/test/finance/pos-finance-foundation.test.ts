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
