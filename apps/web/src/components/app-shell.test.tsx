import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { LanguageProvider } from '../app/language'
import { queryClient } from '../app/query-client'
import { router } from '../app/router'
import { ThemeProvider } from '../app/theme'

function renderApplication() {
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

describe('responsive application shell', () => {
  beforeEach(() => {
    queryClient.clear()
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

        return new Response('{}', { status: 404 })
      }),
    )
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
  })

  it('renders the compact desktop navigation and content', async () => {
    renderApplication()
    await router.navigate({ to: '/app' })

    expect(
      await screen.findByRole('navigation', { name: 'Primary navigation' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Dashboard' }),
    ).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation drawer', async () => {
    renderApplication()
    await router.navigate({ to: '/app' })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Navigation menu' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }))

    expect(
      screen.queryByRole('dialog', { name: 'Navigation menu' }),
    ).not.toBeInTheDocument()
  })
})
