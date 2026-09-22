import type { Pool, PoolClient } from 'pg'
import { getPool } from '../../db/pool'
import type { CreateTenantInput, Tenant } from './tenant.types'

type DatabaseClient = Pool | PoolClient

interface TenantRow {
  id: string
  name: string
  slug: string
  created_at: Date
  updated_at: Date
}

function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class TenantRepository {
  constructor(private readonly db: DatabaseClient = getPool()) {}

  async create(input: CreateTenantInput): Promise<Tenant> {
    const result = await this.db.query<TenantRow>(
      `INSERT INTO tenants (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug, created_at, updated_at`,
      [input.name, input.slug],
    )

    const tenant = result.rows[0]

    if (!tenant) {
      throw new Error('Failed to create tenant')
    }

    return mapTenant(tenant)
  }

  async findById(tenantId: string): Promise<Tenant | null> {
    const result = await this.db.query<TenantRow>(
      `SELECT id, name, slug, created_at, updated_at
       FROM tenants
       WHERE id = $1`,
      [tenantId],
    )

    const tenant = result.rows[0]
    return tenant ? mapTenant(tenant) : null
  }
}
