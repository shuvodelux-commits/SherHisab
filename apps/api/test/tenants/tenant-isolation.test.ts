import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { TenantService } from '../../src/modules/tenants/tenant.service'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const createdTenantIds: string[] = []

describe.skipIf(!hasDatabase)('tenant isolation', () => {
  afterEach(async () => {
    if (createdTenantIds.length === 0) {
      return
    }

    await getPool().query(
      'DELETE FROM tenants WHERE id = ANY($1::uuid[])',
      [createdTenantIds.splice(0)],
    )
  })

  afterAll(async () => {
    await closePool()
  })

  it('keeps the service bound to its trusted tenant', async () => {
    const suffix = randomUUID()

    const tenantA = await TenantService.createTenant({
      name: 'Tenant A',
      slug: `tenant-a-${suffix}`,
    })
    createdTenantIds.push(tenantA.id)

    const tenantB = await TenantService.createTenant({
      name: 'Tenant B',
      slug: `tenant-b-${suffix}`,
    })
    createdTenantIds.push(tenantB.id)

    const tenantAService = new TenantService(tenantA.id)
    const currentTenant = await tenantAService.getCurrentTenant()

    expect(currentTenant.id).toBe(tenantA.id)
    expect(currentTenant.id).not.toBe(tenantB.id)
    expect(currentTenant.name).toBe('Tenant A')
  })
})
