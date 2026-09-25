import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const migrationPath = fileURLToPath(
  new URL('../../../../db/migrations/012b_sales_invoice_draft_source.sql', import.meta.url),
)

describe.skipIf(!hasDatabase)('sales draft source migration', () => {
  it('backfills only unambiguous historical links and safely reruns', async () => {
    const sourceUrl = new URL(process.env.DATABASE_URL!)
    const databaseName = `sherhisab_draft_source_${randomUUID().replaceAll('-', '')}`
    const adminUrl = new URL(sourceUrl)
    adminUrl.pathname = '/postgres'
    const isolatedUrl = new URL(sourceUrl)
    isolatedUrl.pathname = `/${databaseName}`
    const admin = new Client({ connectionString: adminUrl.toString() })
    await admin.connect()
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`)
    } finally {
      await admin.end()
    }

    const isolated = new Client({ connectionString: isolatedUrl.toString() })
    try {
      await isolated.connect()
      await isolated.query(`
        CREATE TABLE sales_invoices (
          id UUID PRIMARY KEY, tenant_id UUID NOT NULL, operation_id UUID
        );
        CREATE TABLE sales_drafts (
          id UUID PRIMARY KEY, tenant_id UUID NOT NULL, version INTEGER NOT NULL,
          status TEXT NOT NULL, posted_sale_id UUID, posted_operation_id UUID
        );
      `)
      // Simulate an installation that already applied the earlier 012b check.
      await isolated.query(`
        ALTER TABLE sales_invoices
          ADD COLUMN source_draft_id UUID,
          ADD COLUMN source_draft_version INTEGER,
          ADD CONSTRAINT sales_invoice_draft_source_pair_check CHECK (
            (source_draft_id IS NULL AND source_draft_version IS NULL)
            OR (source_draft_id IS NOT NULL AND source_draft_version > 0)
          )
      `)
      const tenantId = randomUUID()
      const uniqueSaleId = randomUUID()
      const uniqueDraftId = randomUUID()
      const ambiguousSaleId = randomUUID()
      const ambiguousOperationId = randomUUID()
      await isolated.query(
        `INSERT INTO sales_invoices (id, tenant_id, operation_id)
         VALUES ($1, $2, $3), ($4, $2, $5)` ,
        [uniqueSaleId, tenantId, randomUUID(), ambiguousSaleId, ambiguousOperationId],
      )
      await isolated.query(
        `INSERT INTO sales_drafts
           (id, tenant_id, version, status, posted_sale_id, posted_operation_id)
         VALUES
           ($1, $2, 3, 'POSTED', $3, (SELECT operation_id FROM sales_invoices WHERE id = $3)),
           ($4, $2, 1, 'POSTED', $5, $6),
           ($7, $2, 2, 'POSTED', $5, $6)`,
        [uniqueDraftId, tenantId, uniqueSaleId, randomUUID(), ambiguousSaleId, ambiguousOperationId, randomUUID()],
      )
      const sql = readFileSync(migrationPath, 'utf8')
      await isolated.query(sql)
      await isolated.query(sql)
      const sources = await isolated.query<{
        id: string
        source_draft_id: string | null
        source_draft_version: number | null
      }>(
        `SELECT id::text, source_draft_id::text, source_draft_version
         FROM sales_invoices ORDER BY id`,
      )
      expect(sources.rows.find((row) => row.id === uniqueSaleId)).toMatchObject({
        source_draft_id: uniqueDraftId,
        source_draft_version: 3,
      })
      expect(sources.rows.find((row) => row.id === ambiguousSaleId)).toMatchObject({
        source_draft_id: null,
        source_draft_version: null,
      })

      const accepts = async (sourceDraftId: string | null, sourceDraftVersion: number | null) => {
        await isolated.query('SAVEPOINT source_pair')
        try {
          await isolated.query(
            `INSERT INTO sales_invoices (id, tenant_id, operation_id, source_draft_id, source_draft_version)
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), tenantId, randomUUID(), sourceDraftId, sourceDraftVersion],
          )
          await isolated.query('RELEASE SAVEPOINT source_pair')
          return true
        } catch {
          await isolated.query('ROLLBACK TO SAVEPOINT source_pair')
          await isolated.query('RELEASE SAVEPOINT source_pair')
          return false
        }
      }
      await isolated.query('BEGIN')
      expect(await accepts(null, null)).toBe(true)
      expect(await accepts(randomUUID(), 1)).toBe(true)
      expect(await accepts(randomUUID(), null)).toBe(false)
      expect(await accepts(null, 1)).toBe(false)
      await isolated.query('ROLLBACK')
    } finally {
      await isolated.end().catch(() => undefined)
      const cleanup = new Client({ connectionString: adminUrl.toString() })
      await cleanup.connect()
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      } finally {
        await cleanup.end()
      }
    }
  })
})
