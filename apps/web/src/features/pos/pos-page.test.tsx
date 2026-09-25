import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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

const product: PosProductSearchDto = {
  productId: 'product-1',
  variantId: 'variant-1',
  productName: '4" SWR Pipe PPL 2.7 mm',
  variantName: null,
  sku: 'SWR-27',
  primaryBarcode: '123456',
  brand: 'RFL',
  categoryName: 'Pipe',
  unitId: 'unit-1',
  unitName: 'Feet',
  unitSymbol: 'Feet',
  currentSellingPricePaisa: '6900',
  availableOwnBaseQty: '3',
  trackingMode: 'SIMPLE' as const,
  allocationPolicy: 'FIFO' as const,
  variantsEnabled: false,
}

const baseSession: AuthSession = {
  authenticated: true,
  userId: 'user-1',
  tenantId: 'tenant-1',
  role: 'STAFF',
  permissions: [],
  expiresAt: '2026-09-25T00:00:00.000Z',
}

function safeQuote(baseQty: string, variantId = 'variant-1') {
  const two = baseQty === '2'
  return {
    variantId,
    baseQty,
    pricingQty: baseQty,
    displayQty: baseQty,
    availableOwnBaseQty: '3',
    shortfallBaseQty: '0',
    sellingSegments: two
      ? [
          { lotId: 'lot-1', baseQty: '1', unitSellingPricePaisa: '6900', amountPaisa: '6900' },
          { lotId: 'lot-2', baseQty: '1', unitSellingPricePaisa: '7200', amountPaisa: '7200' },
        ]
      : [
          { lotId: 'lot-1', baseQty: '1', unitSellingPricePaisa: '6900', amountPaisa: '6900' },
        ],
    automaticSalesTotalPaisa: two ? '14100' : '6900',
    effectiveUnitSellingPricePaisa: two ? '7050' : '6900',
    conversion: {
      baseQty,
      pricingQty: baseQty,
      displayQty: baseQty,
      components: {},
      snapshot: null,
    },
  }
}

function installFetch(
  products: PosProductSearchDto[] = [product],
) {
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
        return jsonResponse(params.get('search') ? products : [])
      }

      if (
        url === '/api/private/pos/quote-line' &&
        init?.method === 'POST'
      ) {
        const body = JSON.parse(String(init.body)) as {
          variantId: string
          baseQty: string
        }
        return jsonResponse(
          safeQuote(body.baseQty, body.variantId),
        )
      }

      if (
        url === '/api/private/sales' &&
        init?.method === 'POST'
      ) {
        return jsonResponse(
          {
            id: 'sale-1',
            businessDate: '2026-09-25',
            totalSalesPaisa: '14100',
            lines: [],
          },
          201,
        )
      }

      return jsonResponse(
        { error: `Unexpected test request: ${url}` },
        404,
      )
    },
  )

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPos(session: AuthSession = baseSession) {
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

async function searchForProduct() {
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search products' }),
    { target: { value: 'SWR' } },
  )

  return screen.findByRole('button', {
    name: /4" SWR Pipe PPL 2.7 mm/i,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PosPage lot pricing', () => {
  it('uses server-backed Product search and safe automatic lot pricing', async () => {
    const fetchMock = installFetch()
    renderPos()

    expect(
      screen.getByText('Search to find Products.'),
    ).toBeInTheDocument()

    fireEvent.click(await searchForProduct())

    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).startsWith(
          '/api/private/pos/products?search=SWR&limit=20',
        ),
      ),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).startsWith('/api/private/products?'),
      ),
    ).toBe(false)

    const cartRow = await screen.findByRole('row', {
      name: /4" SWR Pipe PPL 2.7 mm/i,
    })
    expect(
      within(cartRow).getByDisplayValue('69.00'),
    ).toHaveAttribute('readonly')
    expect(
      within(cartRow).getByText('৳69.00'),
    ).toBeInTheDocument()

    fireEvent.click(
      within(cartRow).getByRole('button', {
        name: /show lot price breakdown/i,
      }),
    )
    expect(
      await screen.findByText('1 × ৳69.00'),
    ).toBeInTheDocument()
  })

  it('keeps price read-only when Staff lacks override permission', async () => {
    installFetch()
    renderPos()

    fireEvent.click(await searchForProduct())

    const price = await screen.findByLabelText(
      'Selling price for 4" SWR Pipe PPL 2.7 mm',
    )
    expect(price).toHaveAttribute('readonly')
    fireEvent.change(price, { target: { value: '40.00' } })
    expect(price).toHaveValue('69.00')
  })

  it('allows permitted manual price and resets to lot price without browser COGS', async () => {
    installFetch()
    renderPos({
      ...baseSession,
      permissions: ['SALES_OVERRIDE_SELLING_PRICE'],
    })

    fireEvent.click(await searchForProduct())

    const price = await screen.findByLabelText(
      'Selling price for 4" SWR Pipe PPL 2.7 mm',
    )
    expect(price).not.toHaveAttribute('readonly')

    fireEvent.change(price, { target: { value: '40.00' } })

    expect(
      await screen.findByText('Manual selling price'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/below FIFO cost/i),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reset to Lot Price',
      }),
    )
    expect(price).toHaveValue('69.00')
    expect(
      screen.queryByText('Manual selling price'),
    ).not.toBeInTheDocument()
  })

  it('re-quotes when quantity changes and submits only active manual overrides', async () => {
    const fetchMock = installFetch()
    renderPos({
      ...baseSession,
      permissions: ['SALES_OVERRIDE_SELLING_PRICE'],
    })

    fireEvent.click(await searchForProduct())

    const qty = await screen.findByLabelText(
      'Quantity for 4" SWR Pipe PPL 2.7 mm',
    )
    fireEvent.change(qty, { target: { value: '2' } })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          if (
            input !== '/api/private/pos/quote-line' ||
            init?.method !== 'POST'
          ) {
            return false
          }
          const body = JSON.parse(String(init.body))
          return body.baseQty === '2'
        }),
      ).toBe(true)
    })

    const price = screen.getByLabelText(
      'Selling price for 4" SWR Pipe PPL 2.7 mm',
    )
    await waitFor(() => expect(price).toHaveValue('70.50'))

    fireEvent.change(price, { target: { value: '75.00' } })
    expect(
      await screen.findByText('Manual selling price'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reset to Lot Price',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Sale' }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          input === '/api/private/sales' &&
          init?.method === 'POST',
      )
      expect(call).toBeDefined()
      const body = JSON.parse(String(call?.[1]?.body))
      expect(body.lines).toEqual([
        {
          variantId: 'variant-1',
          baseQty: '2',
        },
      ])
      expect(body.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    expect(
      await screen.findByText('Sale completed'),
    ).toBeInTheDocument()
  })

  it('keeps zero, negative and explicit Variant search results selectable', async () => {
    const zeroStock = {
      ...product,
      productId: 'product-zero',
      variantId: 'variant-zero',
      productName: 'Zero Stock Product',
      availableOwnBaseQty: '0',
    }
    const negativeStock = {
      ...product,
      productId: 'product-negative',
      variantId: 'variant-negative',
      productName: 'Negative Stock Product',
      availableOwnBaseQty: '-2',
    }
    const explicitVariant = {
      ...product,
      productId: 'product-variant',
      variantId: 'variant-blue',
      productName: 'Variant Product',
      variantName: 'Blue',
      variantsEnabled: true,
      availableOwnBaseQty: '4',
    }

    installFetch([zeroStock, negativeStock, explicitVariant])
    renderPos()

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search products' }),
      { target: { value: 'stock' } },
    )

    expect(
      await screen.findByRole('button', {
        name: 'Add Zero Stock Product',
      }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: 'Add Negative Stock Product',
      }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: 'Add Variant Product',
      }),
    ).not.toBeDisabled()
  })

})
