import { beforeEach, describe, expect, it, vi } from 'vitest'

const { serveMock, serverMock } = vi.hoisted(() => {
  const server = {
    close: vi.fn(),
  }

  return {
    serveMock: vi.fn(() => server),
    serverMock: server,
  }
})

vi.mock('@hono/node-server', () => ({
  serve: serveMock,
}))

describe('Node production runtime', () => {
  beforeEach(() => {
    serveMock.mockClear()
  })

  it('starts the shared Hono app on the requested port', async () => {
    const runtime = await import('../src/runtime/node')

    expect(typeof runtime.startNodeServer).toBe('function')

    const server = runtime.startNodeServer(4321)

    expect(server).toBe(serverMock)
    expect(serveMock).toHaveBeenCalledTimes(1)
    expect(serveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function),
        port: 4321,
      }),
      expect.any(Function),
    )
  })
})
