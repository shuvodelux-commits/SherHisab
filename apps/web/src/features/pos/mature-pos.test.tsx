import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/language'
import type { AuthSession } from '../auth-api'
import { PosPage } from './pos-page'
import type { PosProductSearchDto } from './pos-types'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const session: AuthSession = {
  authenticated: true,
  userId: 'user-1',
  tenantId: 'tenant-1',
  role: 'OWNER',
  permissions: [
    'SALES_OVERRIDE_SELLING_PRICE',
    'INVENTORY_EDIT_LOT_SELLING_PRICE',
  ],
  expiresAt: '2026-09-25T12:00:00.000Z',
}

function product(
  variantId: string,
  productName: string,
  primaryBarcode: string,
): PosProductSearchDto {
  return {
    productId: `product-${variantId}`,
    variantId,
    productName,
    variantName: null,
    sku: `SKU-${variantId}`,
    primaryBarcode,
    brand: 'Sher',
    categoryName: 'Hardware',
    unitId: 'unit-1',
    unitName: 'Piece',
    unitSymbol: 'pcs',
    currentSellingPricePaisa: '1000',
    availableOwnBaseQty: '5',
    trackingMode: 'SIMPLE',
    allocationPolicy: 'FIFO',
    variantsEnabled: false,
  }
}

const alpha = product('variant-a', 'Alpha Hammer', '111111')
const beta = product('variant-b', 'Beta Hammer', '222222')

function safeQuote(variantId: string) {
  return {
    variantId,
    baseQty: '1',
    pricingQty: '1',
    displayQty: '1',
    availableOwnBaseQty: '5',
    shortfallBaseQty: '0',
    automaticSalesTotalPaisa: '1000',
    effectiveUnitSellingPricePaisa: '1000',
    sellingSegments: [
      {
        lotId: `lot-${variantId}`,
        baseQty: '1',
        unitSellingPricePaisa: '1000',
        amountPaisa: '1000',
      },
    ],
    conversion: {
      baseQty: '1',
      pricingQty: '1',
      displayQty: '1',
      components: {},
      snapshot: null,
    },
  }
}

function installFetch() {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url.startsWith('/api/private/pos/products?')) {
        const params = new URLSearchParams(url.split('?')[1])
        const search = params.get('search') ?? ''
        if (search === '222222') {
          return jsonResponse([beta])
        }
        return jsonResponse(search ? [alpha, beta] : [])
      }

      if (
        url === '/api/private/pos/quote-line' &&
        init?.method === 'POST'
      ) {
        const body = JSON.parse(String(init.body)) as {
          variantId: string
        }
        return jsonResponse(safeQuote(body.variantId))
      }

      if (url === '/api/private/pos/bootstrap') {
        return jsonResponse({
          capabilities: {
            canSell: true,
            canOverrideSellingPrice: true,
            canViewConfiguredPurchasePrice: true,
            canBackdate: true,
          },
          settings: {
            showPurchasePrice: true,
            requireCashSession: false,
            invoiceShareEnabled: false,
          },
          financialAccounts: [],
          activeCashSession: null,
          recent: { drafts: [], templates: [] },
        })
      }

      return jsonResponse(
        { error: `Unexpected request: ${url}` },
        404,
      )
    },
  )

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPos() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(['auth', 'session'], session)

  render(
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <PosPage />
      </QueryClientProvider>
    </LanguageProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Mature POS Product search keyboard flow', () => {
  it('moves active server result with ArrowDown and ArrowUp and Enter adds the active Variant', async () => {
    const fetchMock = installFetch()
    renderPos()

    const search = screen.getByRole('textbox', {
      name: 'Search products',
    })
    fireEvent.change(search, { target: { value: 'hammer' } })

    const alphaButton = await screen.findByRole('button', {
      name: 'Add Alpha Hammer',
    })
    const betaButton = screen.getByRole('button', {
      name: 'Add Beta Hammer',
    })

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(alphaButton).toHaveAttribute('data-active', 'true')

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(betaButton).toHaveAttribute('data-active', 'true')

    fireEvent.keyDown(search, { key: 'ArrowUp' })
    expect(alphaButton).toHaveAttribute('data-active', 'true')

    fireEvent.keyDown(search, { key: 'Enter' })

    expect(
      await screen.findByRole('row', { name: /Alpha Hammer/i }),
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          input !== '/api/private/pos/quote-line' ||
          init?.method !== 'POST'
        ) {
          return false
        }
        const body = JSON.parse(String(init.body))
        return body.variantId === 'variant-a'
      }),
    ).toBe(true)
  })

  it('Escape closes search results without clearing the existing Cart', async () => {
    installFetch()
    renderPos()

    const search = screen.getByRole('textbox', {
      name: 'Search products',
    })
    fireEvent.change(search, { target: { value: 'hammer' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Alpha Hammer',
      }),
    )

    expect(
      await screen.findByRole('row', { name: /Alpha Hammer/i }),
    ).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'hammer' } })
    expect(
      await screen.findByRole('button', { name: 'Add Beta Hammer' }),
    ).toBeInTheDocument()

    fireEvent.keyDown(search, { key: 'Escape' })

    expect(
      screen.queryByRole('button', { name: 'Add Beta Hammer' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('row', { name: /Alpha Hammer/i }),
    ).toBeInTheDocument()
  })

  it('exact barcode response can be added with Enter without a mouse', async () => {
    const fetchMock = installFetch()
    renderPos()

    const search = screen.getByRole('textbox', {
      name: 'Search products',
    })
    fireEvent.change(search, { target: { value: '222222' } })

    await screen.findByRole('button', { name: 'Add Beta Hammer' })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(
      await screen.findByRole('row', { name: /Beta Hammer/i }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith(
            '/api/private/pos/products?search=222222&limit=20',
          ),
        ),
      ).toBe(true)
    })
  })
})
