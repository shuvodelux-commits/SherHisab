import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const pgMock = vi.hoisted(() => ({
  clientConfigs: [] as Array<{ connectionString?: string }>,
  poolQuery: vi.fn(async () => {
    throw new Error('Cloudflare request used the global PostgreSQL pool')
  }),
  clientQuery: vi.fn(async () => ({
    rows: [] as Array<Record<string, unknown>>,
  })),
  clientEnd: vi.fn(async () => {}),
}))

vi.mock('pg', () => {
  class Pool {
    readonly options: { connectionString?: string }

    constructor(options: { connectionString?: string }) {
      this.options = options
    }

    query = pgMock.poolQuery
    connect = vi.fn()
    end = vi.fn(async () => {})
  }

  class Client {
    constructor(options: { connectionString?: string }) {
      pgMock.clientConfigs.push(options)
    }

    connect = vi.fn(async () => {})
    query = pgMock.clientQuery
    end = pgMock.clientEnd
  }

  return { Client, Pool }
})

import { PERMISSIONS } from '../src/modules/auth/permissions'

const originalDatabaseUrl = process.env.DATABASE_URL

beforeEach(() => {
  pgMock.clientConfigs.length = 0
  pgMock.poolQuery.mockClear()
  pgMock.clientQuery.mockClear()
  pgMock.clientEnd.mockClear()
  vi.resetModules()
})

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl
  }

  vi.resetModules()
})

describe('Cloudflare runtime', () => {
  it('serves health without opening PostgreSQL', async () => {
    delete process.env.DATABASE_URL

    const runtime = await import('../src/runtime/cloudflare')
    const worker = runtime.default

    const response = await worker.fetch(
      new Request('https://sherhisab.example/api/health'),
      {
        HYPERDRIVE: {
          connectionString:
            'postgresql://preview.example/sherhisab',
        },
      },
      {} as Parameters<typeof worker.fetch>[2],
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'sherhisab-api',
    })

    expect(pgMock.poolQuery).not.toHaveBeenCalled()
    expect(pgMock.clientConfigs).toHaveLength(0)
  })

  it('uses a fresh PostgreSQL client for every Hyperdrive request', async () => {
    delete process.env.DATABASE_URL

    const runtime = await import('../src/runtime/cloudflare')
    const worker = runtime.default
    const connectionString =
      'postgresql://hyperdrive.example/sherhisab'

    const loginRequest = () =>
      new Request(
        'https://sherhisab.example/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenantSlug: 'does-not-exist',
            email: 'nobody@example.com',
            password: 'invalid',
          }),
        },
      )

    const env = {
      HYPERDRIVE: {
        connectionString,
      },
    }

    const first = await worker.fetch(
      loginRequest(),
      env,
      {} as Parameters<typeof worker.fetch>[2],
    )

    const second = await worker.fetch(
      loginRequest(),
      env,
      {} as Parameters<typeof worker.fetch>[2],
    )

    expect(first.status).toBe(401)
    expect(second.status).toBe(401)

    expect(pgMock.poolQuery).not.toHaveBeenCalled()

    expect(pgMock.clientConfigs).toEqual([
      { connectionString },
      { connectionString },
    ])
    expect(pgMock.clientEnd).toHaveBeenCalledTimes(2)
  })

  it('uses the request-scoped Hyperdrive client for protected routes', async () => {
    delete process.env.DATABASE_URL

    const runtime = await import('../src/runtime/cloudflare')
    const { SESSION_COOKIE_NAME } = await import(
      '../src/modules/auth/session'
    )
    const worker = runtime.default
    const connectionString =
      'postgresql://hyperdrive.example/sherhisab'

    pgMock.clientQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-1',
          tenant_id: 'tenant-1',
          expires_at: new Date(Date.now() + 60_000),
          role: 'OWNER',
          permission_keys: [],
        },
      ],
    })

    const response = await worker.fetch(
      new Request(
        'https://sherhisab.example/api/private/context',
        {
          method: 'POST',
          headers: {
            Cookie: `${SESSION_COOKIE_NAME}=test-session-token`,
          },
        },
      ),
      {
        HYPERDRIVE: {
          connectionString,
        },
      },
      {} as Parameters<typeof worker.fetch>[2],
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
      permissions: PERMISSIONS,
    })

    expect(pgMock.poolQuery).not.toHaveBeenCalled()
    expect(pgMock.clientConfigs).toEqual([
      { connectionString },
    ])
    expect(pgMock.clientEnd).toHaveBeenCalledTimes(1)
  })



})
