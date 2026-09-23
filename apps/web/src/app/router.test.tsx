import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { LanguageProvider } from './language'
import { queryClient } from './query-client'
import { router } from './router'
import { ThemeProvider } from './theme'

function renderRouter() {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </LanguageProvider>
    </ThemeProvider>,
  )
}

describe('frontend foundation', () => {
  beforeEach(() => {
    queryClient.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('renders the SherHisab home route', async () => {
    renderRouter()
    await router.navigate({ to: '/' })

    expect(
      await screen.findByRole('heading', { name: 'SherHisab' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Foundation is running.')).toBeInTheDocument()
  })

  it('requires a valid session before rendering protected Product screens', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url === '/api/auth/session') {
        return new Response(
          JSON.stringify({ authenticated: false }),
          { status: 401 },
        )
      }

      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRouter()
    await router.navigate({ to: '/app/products' })

    expect(
      await screen.findByRole('heading', { name: 'Sign in to SherHisab' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Business code')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()

    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).startsWith('/api/private/products'),
      ),
    ).toBe(false)
  })

  it('unlocks the Product screen after a successful login', async () => {
    let authenticated = false

    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url === '/api/auth/session') {
        return new Response(
          JSON.stringify(
            authenticated
              ? {
                  authenticated: true,
                  userId: 'user-1',
                  tenantId: 'tenant-1',
                  expiresAt: '2026-09-30T00:00:00.000Z',
                }
              : { authenticated: false },
          ),
          { status: authenticated ? 200 : 401 },
        )
      }

      if (url === '/api/auth/login' && init?.method === 'POST') {
        authenticated = true
        expect(JSON.parse(String(init.body))).toEqual({
          tenantSlug: 'demo-shop',
          email: 'owner@example.com',
          password: 'strong-password',
        })

        return new Response(
          JSON.stringify({
            userId: 'user-1',
            tenantId: 'tenant-1',
            expiresAt: '2026-09-30T00:00:00.000Z',
          }),
          { status: 200 },
        )
      }

      if (url.startsWith('/api/private/product-categories')) {
        return new Response('[]', { status: 200 })
      }

      if (url.startsWith('/api/private/products')) {
        return new Response(
          JSON.stringify({
            items: [],
            total: 0,
            limit: 50,
            offset: 0,
          }),
          { status: 200 },
        )
      }

      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRouter()
    await router.navigate({ to: '/app/products' })

    fireEvent.change(
      await screen.findByLabelText('Business code'),
      { target: { value: 'demo-shop' } },
    )
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('পণ্য ও স্টক').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith('/api/private/products'),
        ),
      ).toBe(true)
    })
  })

  it('renders the products route inside the application shell for an authenticated session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url

        if (url === '/api/auth/session') {
          return new Response(
            JSON.stringify({
              authenticated: true,
              userId: 'user-1',
              tenantId: 'tenant-1',
              expiresAt: '2026-09-30T00:00:00.000Z',
            }),
            { status: 200 },
          )
        }

        if (url.startsWith('/api/private/product-categories')) {
          return new Response('[]', { status: 200 })
        }

        if (url.startsWith('/api/private/products')) {
          return new Response(
            JSON.stringify({
              items: [],
              total: 0,
              limit: 50,
              offset: 0,
            }),
            { status: 200 },
          )
        }

        return new Response('{}', { status: 404 })
      }),
    )

    renderRouter()
    await router.navigate({ to: '/app/products' })

    expect(
      await screen.findByRole('heading', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('পণ্য ও স্টক').length).toBeGreaterThan(0)
  })
})
