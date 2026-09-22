import { AuthRepository, type AuthSession } from './auth.repository'
import { hashPassword, verifyPassword } from './password'
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
    })
  }

  async login(input: LoginInput): Promise<LoginResult | null> {
    const tenantSlug = input.tenantSlug.trim().toLowerCase()
    const email = input.email.trim().toLowerCase()

    if (!tenantSlug || !email || !input.password) {
      return null
    }

    const tenantId = await this.repository.findTenantIdBySlug(tenantSlug)

    if (!tenantId) {
      return null
    }

    const user = await this.repository.findUserByEmail(tenantId, email)

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

    return {
      token,
      tenantId,
      userId: user.id,
      expiresAt,
    }
  }

  async validateSession(token: string): Promise<AuthSession | null> {
    if (!token) {
      return null
    }

    return this.repository.findValidSession(await hashSessionToken(token))
  }

  async logout(token: string): Promise<void> {
    if (!token) {
      return
    }

    await this.repository.deleteSession(await hashSessionToken(token))
  }
}
