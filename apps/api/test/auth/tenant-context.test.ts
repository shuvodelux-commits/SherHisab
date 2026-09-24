import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { app } from '../../src/app'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session'
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

describe.skipIf(!hasDatabase)('trusted tenant request context', () => {
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

  async function createTenant(name: string, prefix: string) {
    const tenant = await TenantService.createTenant({
      name,
      slug: `${prefix}-${randomUUID()}`,
    })

    tenantIds.push(tenant.id)
    return tenant
  }

  it('ignores tenant_id from the request body and uses the session tenant', async () => {
    const tenantA = await createTenant('Tenant A', 'tenant-a')
    const tenantB = await createTenant('Tenant B', 'tenant-b')

    const password = 'strong-password-123'
    const authService = new AuthService()
    const user = await authService.createUser({
      tenantId: tenantA.id,
      name: 'Owner A',
      email: `owner-${randomUUID()}@example.com`,
      password,
      role: 'OWNER',
    })

    const login = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tenantSlug: tenantA.slug,
        email: user.email,
        password,
      }),
    })

    expect(login.status).toBe(200)
    const cookie = readSessionCookie(login.headers.get('set-cookie'))

    const response = await app.request(
      'http://localhost/api/private/context',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenantB.id,
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      userId: user.id,
      tenantId: tenantA.id,
      role: 'OWNER',
      permissions: [
        'SALES_OVERRIDE_SELLING_PRICE',
        'INVENTORY_EDIT_LOT_SELLING_PRICE',
      ],
    })
  })

  it('rejects permission grants that cross tenant boundaries', async () => {
    const tenantA = await createTenant('Grant Tenant A', 'grant-a')
    const tenantB = await createTenant('Grant Tenant B', 'grant-b')
    const authService = new AuthService()

    const ownerA = await authService.createUser({
      tenantId: tenantA.id,
      name: 'Owner A',
      email: `owner-a-${randomUUID()}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })
    const staffB = await authService.createUser({
      tenantId: tenantB.id,
      name: 'Staff B',
      email: `staff-b-${randomUUID()}@example.com`,
      password: 'strong-password-123',
    })

    await expect(
      authService.grantPermission({
        tenantId: tenantA.id,
        userId: staffB.id,
        permission: 'SALES_OVERRIDE_SELLING_PRICE',
        grantedByUserId: ownerA.id,
      }),
    ).rejects.toThrow()
  })

  it('rejects unauthenticated access to private routes', async () => {
    const response = await app.request(
      'http://localhost/api/private/context',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: randomUUID(),
        }),
      },
    )

    expect(response.status).toBe(401)
  })
})
