import { randomUUID } from 'node:crypto'
import { getPool } from '../../src/db/pool'
import { TenantService } from '../../src/modules/tenants/tenant.service'

const createdTenantIds: string[] = []

export async function createProductTestTenant(name: string) {
  const tenant = await TenantService.createTenant({
    name,
    slug: `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${randomUUID()}`,
  })
  createdTenantIds.push(tenant.id)
  return tenant
}

export async function cleanupProductTestTenants(): Promise<void> {
  if (createdTenantIds.length === 0) {
    return
  }

  await getPool().query(
    'DELETE FROM tenants WHERE id = ANY($1::uuid[])',
    [createdTenantIds.splice(0)],
  )
}
