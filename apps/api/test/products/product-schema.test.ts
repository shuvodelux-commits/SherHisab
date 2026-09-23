import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const tenantIds: string[] = []

describe.skipIf(!hasDatabase)('product master schema', () => {
  afterEach(async () => {
    if (tenantIds.length) {
      await getPool().query(
        'DELETE FROM tenants WHERE id = ANY($1::uuid[])',
        [tenantIds.splice(0)],
      )
    }
  })

  afterAll(async () => {
    await closePool()
  })

  async function createTenant(name: string) {
    const result = await getPool().query<{ id: string }>(
      `INSERT INTO tenants (name, slug)
       VALUES ($1, $2)
       RETURNING id`,
      [name, `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}`],
    )
    const id = result.rows[0]!.id
    tenantIds.push(id)
    return id
  }

  it('stores exact decimal quantities', async () => {
    const tenantId = await createTenant('Decimal Tenant')
    const unit = await getPool().query<{ id: string }>(
      `INSERT INTO units (tenant_id, name, symbol)
       VALUES ($1, 'yard', 'yd') RETURNING id`,
      [tenantId],
    )
    const product = await getPool().query<{ id: string }>(
      `INSERT INTO products
       (tenant_id, name, base_unit_id, tracking_mode)
       VALUES ($1, 'Cotton Fabric', $2, 'SIMPLE') RETURNING id`,
      [tenantId, unit.rows[0]!.id],
    )
    const variant = await getPool().query<{ id: string }>(
      `INSERT INTO product_variants
       (tenant_id, product_id, is_default, minimum_stock_base_qty)
       VALUES ($1, $2, TRUE, '0.125') RETURNING id`,
      [tenantId, product.rows[0]!.id],
    )

    const row = await getPool().query<{ qty: string }>(
      `SELECT trim_scale(minimum_stock_base_qty)::text AS qty
       FROM product_variants WHERE id = $1`,
      [variant.rows[0]!.id],
    )

    expect(row.rows[0]?.qty).toBe('0.12500000')
  })

  it('rejects a category from another tenant', async () => {
    const tenantA = await createTenant('Tenant A')
    const tenantB = await createTenant('Tenant B')
    const unitA = await getPool().query<{ id: string }>(
      `INSERT INTO units (tenant_id, name) VALUES ($1, 'pcs') RETURNING id`,
      [tenantA],
    )
    const categoryB = await getPool().query<{ id: string }>(
      `INSERT INTO product_categories (tenant_id, name)
       VALUES ($1, 'Foreign') RETURNING id`,
      [tenantB],
    )

    await expect(
      getPool().query(
        `INSERT INTO products
         (tenant_id, name, category_id, base_unit_id)
         VALUES ($1, 'Hammer', $2, $3)`,
        [tenantA, categoryB.rows[0]!.id, unitA.rows[0]!.id],
      ),
    ).rejects.toThrow()
  })

  it('allows an archived category name to be reused', async () => {
    const tenantId = await createTenant('Archive Tenant')
    await getPool().query(
      `INSERT INTO product_categories (tenant_id, name, is_active)
       VALUES ($1, 'Pipe', FALSE)`,
      [tenantId],
    )

    await expect(
      getPool().query(
        `INSERT INTO product_categories (tenant_id, name)
         VALUES ($1, 'pipe')`,
        [tenantId],
      ),
    ).resolves.toBeDefined()
  })
})
