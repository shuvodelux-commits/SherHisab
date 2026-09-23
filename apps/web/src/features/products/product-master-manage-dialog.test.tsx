import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/language'
import { ProductMasterManageDialog } from './product-master-manage-dialog'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    if (
      url === '/api/private/product-categories?includeInactive=true' &&
      !init?.method
    ) {
      return jsonResponse([
        { id: 'cat-active', name: 'Hardware', isActive: true },
        { id: 'cat-old', name: 'Pipe', isActive: false },
      ])
    }

    if (url === '/api/private/units?includeInactive=true' && !init?.method) {
      return jsonResponse([
        { id: 'unit-active', name: 'Piece', symbol: 'pcs', isActive: true },
        { id: 'unit-old', name: 'Box', symbol: 'box', isActive: false },
      ])
    }

    if (
      url === '/api/private/product-categories/cat-active' &&
      init?.method === 'PATCH'
    ) {
      return jsonResponse({
        id: 'cat-active',
        name: 'Hardware',
        isActive: false,
      })
    }

    if (
      url === '/api/private/product-categories/cat-old' &&
      init?.method === 'PATCH'
    ) {
      return jsonResponse({
        id: 'cat-old',
        name: 'Pipe',
        isActive: true,
      })
    }

    if (
      url === '/api/private/units/unit-active' &&
      init?.method === 'PATCH'
    ) {
      return jsonResponse({
        id: 'unit-active',
        name: 'Piece',
        symbol: 'pcs',
        isActive: false,
      })
    }

    if (
      url === '/api/private/product-categories' &&
      init?.method === 'POST'
    ) {
      const body = JSON.parse(String(init.body))
      if (body.name === 'Hardware') {
        return jsonResponse(
          { error: 'A category with this name already exists.' },
          409,
        )
      }

      return jsonResponse(
        { id: 'cat-new', name: body.name, isActive: true },
        201,
      )
    }

    if (url === '/api/private/units' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return jsonResponse(
        {
          id: 'unit-new',
          name: body.name,
          symbol: body.symbol || null,
          isActive: true,
        },
        201,
      )
    }

    return jsonResponse({ error: 'Unexpected test request.' }, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ProductMasterManageDialog onOpenChange={vi.fn()} open />
      </QueryClientProvider>
    </LanguageProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('ProductMasterManageDialog', () => {
  it('lists active and inactive categories and archives/reactivates them', async () => {
    const fetchMock = installFetch()
    renderDialog()

    expect(
      await screen.findByRole('dialog', { name: 'Product Settings' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Hardware')).toBeInTheDocument()
    expect(screen.getByText('Pipe')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Archive category Hardware' }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            input === '/api/private/product-categories/cat-active' &&
            init?.method === 'PATCH' &&
            JSON.parse(String(init.body)).isActive === false,
        ),
      ).toBe(true)
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Activate category Pipe' }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            input === '/api/private/product-categories/cat-old' &&
            init?.method === 'PATCH' &&
            JSON.parse(String(init.body)).isActive === true,
        ),
      ).toBe(true)
    })
  })

  it('recreates an archived category name as a new active record', async () => {
    const fetchMock = installFetch()
    renderDialog()

    await screen.findByText('Pipe')
    fireEvent.change(screen.getByLabelText('Category name'), {
      target: { value: 'Pipe' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            input === '/api/private/product-categories' &&
            init?.method === 'POST' &&
            JSON.parse(String(init.body)).name === 'Pipe',
        ),
      ).toBe(true)
    })
  })

  it('keeps Product Settings open and preserves input on server conflict', async () => {
    installFetch()
    renderDialog()

    await screen.findByText('Hardware')
    const input = screen.getByLabelText('Category name')
    fireEvent.change(input, { target: { value: 'Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    expect(
      await screen.findByText('A category with this name already exists.'),
    ).toBeInTheDocument()
    expect(input).toHaveValue('Hardware')
    expect(
      screen.getByRole('dialog', { name: 'Product Settings' }),
    ).toBeInTheDocument()
  })

  it('manages Units with optional symbols', async () => {
    const fetchMock = installFetch()
    renderDialog()

    fireEvent.click(await screen.findByRole('tab', { name: 'Units' }))

    expect(screen.getByText('Piece')).toBeInTheDocument()
    expect(screen.getByText('pcs')).toBeInTheDocument()
    expect(screen.getByText('Box')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Unit name'), {
      target: { value: 'Roll' },
    })
    fireEvent.change(screen.getByLabelText('Unit symbol'), {
      target: { value: 'rl' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Unit' }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            input === '/api/private/units' &&
            init?.method === 'POST' &&
            JSON.parse(String(init.body)).name === 'Roll' &&
            JSON.parse(String(init.body)).symbol === 'rl',
        ),
      ).toBe(true)
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Archive unit Piece' }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            input === '/api/private/units/unit-active' &&
            init?.method === 'PATCH',
        ),
      ).toBe(true)
    })
  })
})
