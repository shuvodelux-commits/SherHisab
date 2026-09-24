import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { hashSessionToken, SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
import { TenantService } from '../../src/modules/tenants/tenant.service'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const tenantIds: string[] = []

function readSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error('Session cookie was not set')
  }

  const cookie = setCookieHeader.split(';')[0]

  if (!cookie?.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Unexpected session cookie')
  }

  return cookie
}

describe.skipIf(!hasDatabase)('authentication foundation', () => {
  afterEach(async () => {
    if (tenantIds.length === 0) {
      return
    }

    const ids = tenantIds.splice(0)

    await getPool().query(
      'DELETE FROM user_permission_grants WHERE tenant_id = ANY($1::uuid[])',
      [ids],
    )
    await getPool().query(
      'DELETE FROM tenants WHERE id = ANY($1::uuid[])',
      [ids],
    )
  })

  afterAll(async () => {
    await closePool()
  })

  async function createFixture() {
    const suffix = randomUUID()
    const tenant = await TenantService.createTenant({
      name: 'Auth Tenant',
      slug: `auth-${suffix}`,
    })
    tenantIds.push(tenant.id)

    const authService = new AuthService()
    const user = await authService.createUser({
      tenantId: tenant.id,
      name: 'Owner',
      email: `owner-${suffix}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })

    return {
      tenant,
      user,
      password: 'strong-password-123',
    }
  }

  it('logs in with a secure HttpOnly server session', async () => {
    const fixture = await createFixture()

    const response = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tenantSlug: fixture.tenant.slug,
        email: fixture.user.email,
        password: fixture.password,
      }),
    })

    expect(response.status).toBe(200)

    const setCookieHeader = response.headers.get('set-cookie')
    expect(setCookieHeader).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(setCookieHeader?.toLowerCase()).toContain('httponly')
    expect(setCookieHeader?.toLowerCase()).toContain('samesite=lax')

    const body = await response.json()
    expect(body).toMatchObject({
      userId: fixture.user.id,
      tenantId: fixture.tenant.id,
      role: 'OWNER',
      permissions: [
        'SALES_OVERRIDE_SELLING_PRICE',
        'INVENTORY_EDIT_LOT_SELLING_PRICE',
      ],
    })
  })

  it('defaults new users to Staff and resolves only explicit grants', async () => {
    const suffix = randomUUID()
    const tenant = await TenantService.createTenant({
      name: 'Staff Auth Tenant',
      slug: `staff-auth-${suffix}`,
    })
    tenantIds.push(tenant.id)

    const authService = new AuthService()
    const owner = await authService.createUser({
      tenantId: tenant.id,
      name: 'Owner',
      email: `owner-${suffix}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })
    const staff = await authService.createUser({
      tenantId: tenant.id,
      name: 'Cashier',
      email: `cashier-${suffix}@example.com`,
      password: 'strong-password-123',
    })

    expect(staff.role).toBe('STAFF')
    expect(
      await authService.getAuthorizationContext(tenant.id, staff.id),
    ).toEqual({
      role: 'STAFF',
      permissions: [],
    })

    await authService.grantPermission({
      tenantId: tenant.id,
      userId: staff.id,
      permission: 'SALES_OVERRIDE_SELLING_PRICE',
      grantedByUserId: owner.id,
    })

    expect(
      await authService.getAuthorizationContext(tenant.id, staff.id),
    ).toEqual({
      role: 'STAFF',
      permissions: ['SALES_OVERRIDE_SELLING_PRICE'],
    })
  })

  it('rejects invalid credentials', async () => {
    const fixture = await createFixture()

    const response = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tenantSlug: fixture.tenant.slug,
        email: fixture.user.email,
        password: 'wrong-password',
      }),
    })

    expect(response.status).toBe(401)
  })

  it('validates and logs out a session', async () => {
    const fixture = await createFixture()
    const login = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tenantSlug: fixture.tenant.slug,
        email: fixture.user.email,
        password: fixture.password,
      }),
    })

    const cookie = readSessionCookie(login.headers.get('set-cookie'))

    const session = await app.request('http://localhost/api/auth/session', {
      headers: { cookie },
    })

    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({
      authenticated: true,
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      role: 'OWNER',
      permissions: [
        'SALES_OVERRIDE_SELLING_PRICE',
        'INVENTORY_EDIT_LOT_SELLING_PRICE',
      ],
    })

    const logout = await app.request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { cookie },
    })

    expect(logout.status).toBe(200)

    const afterLogout = await app.request('http://localhost/api/auth/session', {
      headers: { cookie },
    })

    expect(afterLogout.status).toBe(401)
  })

  it('rejects expired sessions', async () => {
    const fixture = await createFixture()
    const token = randomUUID()
    const tokenHash = await hashSessionToken(token)

    await getPool().query(
      `INSERT INTO sessions (tenant_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '1 minute')`,
      [fixture.tenant.id, fixture.user.id, tokenHash],
    )

    const response = await app.request('http://localhost/api/auth/session', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    })

    expect(response.status).toBe(401)
  })

  it('marks production session cookies as Secure', async () => {
    const fixture = await createFixture()
    const previousNodeEnv = process.env.NODE_ENV

    process.env.NODE_ENV = 'production'

    try {
      const response = await app.request(
        'http://localhost/api/auth/login',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantSlug: fixture.tenant.slug,
            email: fixture.user.email,
            password: fixture.password,
          }),
        },
      )

      expect(response.status).toBe(200)
      expect(
        response.headers.get('set-cookie')?.toLowerCase(),
      ).toContain('secure')
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })


})
