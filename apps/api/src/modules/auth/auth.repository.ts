import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'

export interface AuthUser {
  id: string
  tenantId: string
  name: string
  email: string
  passwordHash: string
  isActive: boolean
}

export interface AuthSession {
  userId: string
  tenantId: string
  expiresAt: Date
}

interface UserRow {
  id: string
  tenant_id: string
  name: string
  email: string
  password_hash: string
  is_active: boolean
}

interface SessionRow {
  user_id: string
  tenant_id: string
  expires_at: Date
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    isActive: row.is_active,
  }
}

export class AuthRepository {
  constructor(private readonly database?: DatabaseClient) {}

  private get db(): DatabaseClient {
    return this.database ?? getPool()
  }

  async findTenantIdBySlug(slug: string): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      'SELECT id FROM tenants WHERE slug = $1',
      [slug],
    )

    return result.rows[0]?.id ?? null
  }

  async createUser(input: {
    tenantId: string
    name: string
    email: string
    passwordHash: string
  }): Promise<AuthUser> {
    const result = await this.db.query<UserRow>(
      `INSERT INTO users (tenant_id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, name, email, password_hash, is_active`,
      [input.tenantId, input.name, input.email, input.passwordHash],
    )

    const user = result.rows[0]

    if (!user) {
      throw new Error('Failed to create user')
    }

    return mapUser(user)
  }

  async findUserByEmail(
    tenantId: string,
    email: string,
  ): Promise<AuthUser | null> {
    const result = await this.db.query<UserRow>(
      `SELECT id, tenant_id, name, email, password_hash, is_active
       FROM users
       WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email],
    )

    const user = result.rows[0]
    return user ? mapUser(user) : null
  }

  async createSession(input: {
    tenantId: string
    userId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions (tenant_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.tenantId, input.userId, input.tokenHash, input.expiresAt],
    )
  }

  async findValidSession(tokenHash: string): Promise<AuthSession | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT user_id, tenant_id, expires_at
       FROM sessions
       WHERE token_hash = $1
         AND expires_at > NOW()`,
      [tokenHash],
    )

    const session = result.rows[0]

    return session
      ? {
          userId: session.user_id,
          tenantId: session.tenant_id,
          expiresAt: session.expires_at,
        }
      : null
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
  }
}
