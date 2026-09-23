import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
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
    await router.navigate({ to: '/' })

    renderRouter()

    expect(
      await screen.findByRole('heading', { name: 'SherHisab' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Foundation is running.')).toBeInTheDocument()
  })

  it('renders the products route inside the application shell', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url

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

    await router.navigate({ to: '/app/products' })

    renderRouter()

    expect(
      await screen.findByRole('heading', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('পণ্য ও স্টক').length).toBeGreaterThan(0)
  })
})
