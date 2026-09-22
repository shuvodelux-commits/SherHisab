import { Pool } from 'pg'

let pool: Pool | undefined

export function getPool(): Pool {
  if (pool) {
    return pool
  }

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  pool = new Pool({
    connectionString,
    max: 10,
  })

  return pool
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return
  }

  await pool.end()
  pool = undefined
}
