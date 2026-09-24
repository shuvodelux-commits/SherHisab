import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import {
  resolvePermissions,
  type PermissionKey,
  type UserRole,
} from './permissions'

export interface AuthUser {
  id: string
  tenantId: string
  name: string
  email: string
  passwordHash: string
  isActive: boolean
  role: UserRole
}

export interface AuthorizationContext {
  role: UserRole
  permissions: PermissionKey[]
}

export interface AuthSession extends AuthorizationContext {
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
  role: UserRole
}

interface AuthorizationRow {
  role: UserRole
  permission_keys: PermissionKey[]
}

interface SessionRow extends AuthorizationRow {
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
    role: row.role,
  }
}

function resolvedAuthorization(
  row: AuthorizationRow,
): AuthorizationContext {
  return {
    role: row.role,
    permissions: resolvePermissions(
      row.role,
      row.permission_keys ?? [],
    ),
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
    role: UserRole
  }): Promise<AuthUser> {
    const result = await this.db.query<UserRow>(
      `INSERT INTO users
       (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         tenant_id,
         name,
         email,
         password_hash,
         is_active,
         role`,
      [
        input.tenantId,
        input.name,
        input.email,
        input.passwordHash,
        input.role,
      ],
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
      `SELECT
         id,
         tenant_id,
         name,
         email,
         password_hash,
         is_active,
         role
       FROM users
       WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email],
    )

    const user = result.rows[0]
    return user ? mapUser(user) : null
  }

  async findAuthorizationContext(
    tenantId: string,
    userId: string,
  ): Promise<AuthorizationContext | null> {
    const result = await this.db.query<AuthorizationRow>(
      `SELECT
         u.role,
         COALESCE(
           array_agg(g.permission_key)
             FILTER (WHERE g.permission_key IS NOT NULL),
           ARRAY[]::text[]
         ) AS permission_keys
       FROM users u
       LEFT JOIN user_permission_grants g
         ON g.tenant_id = u.tenant_id
        AND g.user_id = u.id
       WHERE u.tenant_id = $1
         AND u.id = $2
         AND u.is_active
       GROUP BY u.role`,
      [tenantId, userId],
    )

    const row = result.rows[0]
    return row ? resolvedAuthorization(row) : null
  }

  async grantPermission(input: {
    tenantId: string
    userId: string
    permission: PermissionKey
    grantedByUserId: string
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO user_permission_grants
       (tenant_id, user_id, permission_key, granted_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, user_id, permission_key)
       DO UPDATE SET
         granted_by_user_id = EXCLUDED.granted_by_user_id,
         created_at = NOW()`,
      [
        input.tenantId,
        input.userId,
        input.permission,
        input.grantedByUserId,
      ],
    )
  }

  async createSession(input: {
    tenantId: string
    userId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions
       (tenant_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.tenantId, input.userId, input.tokenHash, input.expiresAt],
    )
  }

  async findValidSession(
    tokenHash: string,
  ): Promise<AuthSession | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT
         s.user_id,
         s.tenant_id,
         s.expires_at,
         u.role,
         COALESCE(
           array_agg(g.permission_key)
             FILTER (WHERE g.permission_key IS NOT NULL),
           ARRAY[]::text[]
         ) AS permission_keys
       FROM sessions s
       JOIN users u
         ON u.tenant_id = s.tenant_id
        AND u.id = s.user_id
        AND u.is_active
       LEFT JOIN user_permission_grants g
         ON g.tenant_id = u.tenant_id
        AND g.user_id = u.id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()
       GROUP BY
         s.user_id,
         s.tenant_id,
         s.expires_at,
         u.role`,
      [tokenHash],
    )

    const session = result.rows[0]

    if (!session) {
      return null
    }

    return {
      userId: session.user_id,
      tenantId: session.tenant_id,
      expiresAt: session.expires_at,
      ...resolvedAuthorization(session),
    }
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.query(
      'DELETE FROM sessions WHERE token_hash = $1',
      [tokenHash],
    )
  }
}
