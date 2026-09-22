import { describe, expect, it } from 'vitest'
import { app } from '../src/app'

describe('GET /api/health', () => {
  it('returns the API health status', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'sherhisab-api',
    })
  })
})
