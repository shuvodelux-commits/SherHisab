import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

const hasDatabase = Boolean(process.env.DATABASE_URL)

function migrationPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../../db/migrations/${name}`, import.meta.url),
  )
}

async function applyMigration(
  client: Client,
  name: string,
): Promise<void> {
  await client.query(readFileSync(migrationPath(name), 'utf8'))
}

describe.skipIf(!hasDatabase)('inventory tracking migration', () => {
  it('upgrades legacy tracking modes without dropping Products and defaults allocation to FIFO', async () => {
    const trackingMigration = migrationPath(
      '008_inventory_tracking.sql',
    )

    expect(
      existsSync(trackingMigration),
      '008 inventory tracking migration must exist',
    ).toBe(true)

    const sourceUrl = new URL(process.env.DATABASE_URL!)
    const databaseName = `sherhisab_tracking_${randomUUID().replaceAll('-', '')}`
    const adminUrl = new URL(sourceUrl)
    adminUrl.pathname = '/postgres'
    const isolatedUrl = new URL(sourceUrl)
    isolatedUrl.pathname = `/${databaseName}`

    const admin = new Client({
      connectionString: adminUrl.toString(),
    })
    await admin.connect()

    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`)
    } finally {
      await admin.end()
    }

    const isolated = new Client({
      connectionString: isolatedUrl.toString(),
    })

    try {
      await isolated.connect()

      for (const migration of [
        '001_foundation.sql',
        '002_tenants.sql',
        '003_users_sessions.sql',
      ]) {
        await applyMigration(isolated, migration)
      }

      const tenantResult = await isolated.query<{ id: string }>(
        `INSERT INTO tenants (name, slug)
         VALUES ('Tracking Migration Tenant', $1)
         RETURNING id`,
        [`tracking-${randomUUID()}`],
      )
      const tenantId = tenantResult.rows[0]?.id
      expect(tenantId).toBeTruthy()

      for (const migration of [
        '004_product_master_inventory.sql',
        '005_roles_permissions_lot_price_audit.sql',
        '006_sales_foundation.sql',
        '007_quantity_conversion.sql',
      ]) {
        await applyMigration(isolated, migration)
      }

      const unitResult = await isolated.query<{ id: string }>(
        `SELECT id
         FROM units
         WHERE tenant_id = $1
           AND name = 'Piece'`,
        [tenantId],
      )
      const unitId = unitResult.rows[0]?.id
      expect(unitId).toBeTruthy()

      await isolated.query(
        `INSERT INTO products
         (tenant_id, name, base_unit_id, tracking_mode)
         VALUES
           ($1, 'Legacy Simple', $2, 'SIMPLE'),
           ($1, 'Legacy Lot', $2, 'LOT'),
           ($1, 'Legacy Batch', $2, 'BATCH')`,
        [tenantId, unitId],
      )

      await applyMigration(isolated, '008_inventory_tracking.sql')

      const products = await isolated.query<{
        name: string
        tracking_mode: string
        allocation_policy: string
      }>(
        `SELECT name, tracking_mode, allocation_policy
         FROM products
         WHERE tenant_id = $1
         ORDER BY name`,
        [tenantId],
      )

      expect(products.rows).toEqual([
        {
          name: 'Legacy Batch',
          tracking_mode: 'BATCH_EXPIRY',
          allocation_policy: 'FIFO',
        },
        {
          name: 'Legacy Lot',
          tracking_mode: 'SIMPLE',
          allocation_policy: 'FIFO',
        },
        {
          name: 'Legacy Simple',
          tracking_mode: 'SIMPLE',
          allocation_policy: 'FIFO',
        },
      ])

      await expect(
        isolated.query(
          `UPDATE products
           SET tracking_mode = 'LOT'
           WHERE tenant_id = $1
             AND name = 'Legacy Simple'`,
          [tenantId],
        ),
      ).rejects.toMatchObject({ code: '23514' })
    } finally {
      await isolated.end().catch(() => undefined)

      const cleanup = new Client({
        connectionString: adminUrl.toString(),
      })
      await cleanup.connect()

      try {
        await cleanup.query(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
        )
      } finally {
        await cleanup.end()
      }
    }
  })
})
