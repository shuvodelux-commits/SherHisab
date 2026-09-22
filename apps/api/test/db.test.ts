import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../src/db/pool'
import { withTransaction } from '../src/db/transaction'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const rollbackTable = 'foundation_rollback_test'

describe.skipIf(!hasDatabase)('postgres foundation', () => {
  afterEach(async () => {
    await getPool().query(`DROP TABLE IF EXISTS ${rollbackTable}`)
  })

  afterAll(async () => {
    await closePool()
  })

  it('connects to PostgreSQL', async () => {
    const result = await getPool().query<{ value: number }>('SELECT 1 AS value')

    expect(result.rows[0]?.value).toBe(1)
  })

  it('rolls back failed transactions without partial data', async () => {
    await getPool().query(
      `CREATE TABLE ${rollbackTable} (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    )

    await expect(
      withTransaction(async (client) => {
        await client.query(
          `INSERT INTO ${rollbackTable} (id, value) VALUES ($1, $2)`,
          [1, 'must rollback'],
        )

        throw new Error('force rollback')
      }),
    ).rejects.toThrow('force rollback')

    const result = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${rollbackTable}`,
    )

    expect(result.rows[0]?.count).toBe('0')
  })
})
