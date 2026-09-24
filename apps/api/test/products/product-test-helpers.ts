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

  const tenantIds = createdTenantIds.splice(0)

  await getPool().query(
    'DELETE FROM sales_line_lot_allocations WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM sales_lines WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM sales_invoices WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM inventory_lot_selling_price_audit WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM user_permission_grants WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM inventory_movement_lot_allocations WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM inventory_movements WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM inventory_lots WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM products WHERE tenant_id = ANY($1::uuid[])',
    [tenantIds],
  )
  await getPool().query(
    'DELETE FROM tenants WHERE id = ANY($1::uuid[])',
    [tenantIds],
  )
}
