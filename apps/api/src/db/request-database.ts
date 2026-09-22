import { Client, type Pool, type PoolClient } from 'pg'
import type { AppEnv } from '../types/context'
import { getPool } from './pool'

export type DatabaseClient = Client | Pool | PoolClient

export async function withRequestDatabase<T>(
  env: AppEnv['Bindings'] | undefined,
  work: (database: DatabaseClient) => Promise<T>,
): Promise<T> {
  const hyperdrive = env?.HYPERDRIVE

  if (!hyperdrive) {
    return work(getPool())
  }

  const client = new Client({
    connectionString: hyperdrive.connectionString,
  })

  await client.connect()

  return work(client)
}
