import {
  AuthRepository,
  type AuthSession,
  type AuthorizationContext,
} from './auth.repository'
import { hashPassword, verifyPassword } from './password'
import {
  type PermissionKey,
  type UserRole,
} from './permissions'
import {
  createSessionToken,
  getSessionExpiry,
  hashSessionToken,
} from './session'

export interface LoginInput {
  tenantSlug: string
  email: string
  password: string
}

export interface LoginResult extends AuthSession {
  token: string
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository = new AuthRepository(),
  ) {}

  async createUser(input: {
    tenantId: string
    name: string
    email: string
    password: string
    role?: UserRole
  }) {
    const name = input.name.trim()
    const email = input.email.trim().toLowerCase()

    if (!name || !email) {
      throw new Error('Name and email are required')
    }

    const passwordHash = await hashPassword(input.password)

    return this.repository.createUser({
      tenantId: input.tenantId,
      name,
      email,
      passwordHash,
      role: input.role ?? 'STAFF',
    })
  }

  async getAuthorizationContext(
    tenantId: string,
    userId: string,
  ): Promise<AuthorizationContext> {
    const authorization =
      await this.repository.findAuthorizationContext(
        tenantId,
        userId,
      )

    if (!authorization) {
      throw new Error('User authorization context not found')
    }

    return authorization
  }

  async grantPermission(input: {
    tenantId: string
    userId: string
    permission: PermissionKey
    grantedByUserId: string
  }): Promise<void> {
    const grantor = await this.getAuthorizationContext(
      input.tenantId,
      input.grantedByUserId,
    )

    if (grantor.role !== 'OWNER' && grantor.role !== 'ADMIN') {
      throw new Error('Only Owner or Admin can grant permissions')
    }

    await this.repository.grantPermission(input)
  }

  async login(input: LoginInput): Promise<LoginResult | null> {
    const tenantSlug = input.tenantSlug.trim().toLowerCase()
    const email = input.email.trim().toLowerCase()

    if (!tenantSlug || !email || !input.password) {
      return null
    }

    const tenantId = await this.repository.findTenantIdBySlug(
      tenantSlug,
    )

    if (!tenantId) {
      return null
    }

    const user = await this.repository.findUserByEmail(
      tenantId,
      email,
    )

    if (!user?.isActive) {
      return null
    }

    const validPassword = await verifyPassword(
      input.password,
      user.passwordHash,
    )

    if (!validPassword) {
      return null
    }

    const token = createSessionToken()
    const tokenHash = await hashSessionToken(token)
    const expiresAt = getSessionExpiry()

    await this.repository.createSession({
      tenantId,
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    const authorization = await this.getAuthorizationContext(
      tenantId,
      user.id,
    )

    return {
      token,
      tenantId,
      userId: user.id,
      expiresAt,
      ...authorization,
    }
  }

  async validateSession(token: string): Promise<AuthSession | null> {
    if (!token) {
      return null
    }

    return this.repository.findValidSession(
      await hashSessionToken(token),
    )
  }

  async logout(token: string): Promise<void> {
    if (!token) {
      return
    }

    await this.repository.deleteSession(
      await hashSessionToken(token),
    )
  }
}
