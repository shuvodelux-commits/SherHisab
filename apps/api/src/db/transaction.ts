import { Pool, type Client, type PoolClient } from 'pg'
import { getPool } from './pool'
import type { DatabaseClient } from './request-database'

type TransactionClient = Client | PoolClient

async function runTransaction<T>(
  client: TransactionClient,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')

  try {
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function withDatabaseTransaction<T>(
  database: DatabaseClient,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  if (database instanceof Pool) {
    const client = await database.connect()

    try {
      return await runTransaction(client, work)
    } finally {
      client.release()
    }
  }

  return runTransaction(database, work)
}
