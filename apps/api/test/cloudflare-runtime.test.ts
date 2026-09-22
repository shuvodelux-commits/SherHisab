import { afterEach, describe, expect, it, vi } from 'vitest'

const originalDatabaseUrl = process.env.DATABASE_URL

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl
  }

  vi.resetModules()
})

describe('Cloudflare runtime', () => {
  it('loads and serves the health route without opening PostgreSQL', async () => {
    delete process.env.DATABASE_URL
    vi.resetModules()

    const runtime = await import('../src/runtime/cloudflare')
    const worker = runtime.default

    expect(runtime.cloudflareWorker).toBe(worker)

    const response = await worker.request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'sherhisab-api',
    })
  })
})
