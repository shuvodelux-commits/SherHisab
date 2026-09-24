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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const product = {
  id: 'product-1',
  name: '4" SWR Pipe PPL 2.7 mm',
  brand: 'RFL',
  category: { id: 'cat-1', name: 'Pipe', isActive: true },
  baseUnit: { id: 'unit-1', name: 'Feet', symbol: 'Feet', isActive: true },
  defaultVariantId: 'variant-1',
  variantCount: 1,
  defaultPurchasePricePaisa: '5000',
  defaultSellingPricePaisa: '6500',
  currentSellingPricePaisa: '6900',
  stockBaseQty: '3',
  stockValuePaisa: '15500',
  minimumStockBaseQty: '0',
  trackingMode: 'SIMPLE' as const,
  variantsEnabled: false,
  isActive: true,
}

const baseSession: AuthSession = {
  authenticated: true,
  userId: 'user-1',
  tenantId: 'tenant-1',
  role: 'STAFF',
  permissions: [],
  expiresAt: '2026-09-25T00:00:00.000Z',
}

function installFetch() {
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

    if (url.startsWith('/api/private/products?')) {
      return jsonResponse({
        items: [product],
        total: 1,
        limit: 50,
        offset: 0,
      })
    }

    if (
      url === '/api/private/sales/quote-line' &&
      init?.method === 'POST'
    ) {
      const body = JSON.parse(String(init.body)) as {
        baseQty: string
      }

      if (body.baseQty === '2') {
        return jsonResponse({
          variantId: 'variant-1',
          requestedBaseQty: '2',
          availableBaseQty: '3',
          allocations: [
            {
              lotId: 'lot-1',
              receivedOn: '2026-01-01',
              baseQty: '1',
              unitCostPaisa: '5000',
              lotSellingPricePaisa: '6900',
              automaticSalesAmountPaisa: '6900',
              cogsAmountPaisa: '5000',
            },
            {
              lotId: 'lot-2',
              receivedOn: '2026-02-01',
              baseQty: '1',
              unitCostPaisa: '5500',
              lotSellingPricePaisa: '7200',
              automaticSalesAmountPaisa: '7200',
              cogsAmountPaisa: '5500',
            },
          ],
          automaticSalesTotalPaisa: '14100',
          effectiveUnitSellingPricePaisa: '7050',
          cogsPaisa: '10500',
          isSufficient: true,
        })
      }

      return jsonResponse({
        variantId: 'variant-1',
        requestedBaseQty: '1',
        availableBaseQty: '3',
        allocations: [
          {
            lotId: 'lot-1',
            receivedOn: '2026-01-01',
            baseQty: '1',
            unitCostPaisa: '5000',
            lotSellingPricePaisa: '6900',
            automaticSalesAmountPaisa: '6900',
            cogsAmountPaisa: '5000',
          },
        ],
        automaticSalesTotalPaisa: '6900',
        effectiveUnitSellingPricePaisa: '6900',
        cogsPaisa: '5000',
        isSufficient: true,
      })
    }

    if (
      url === '/api/private/sales' &&
      init?.method === 'POST'
    ) {
      return jsonResponse(
        {
          id: 'sale-1',
          totalSalesPaisa: '14100',
          totalCogsPaisa: '10500',
          grossProfitPaisa: '3600',
          lines: [],
        },
        201,
      )
    }

    return jsonResponse({ error: 'Unexpected test request' }, 404)
  })

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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PosPage lot pricing', () => {
  it('adds a Product with automatic FIFO price and shows lot breakdown', async () => {
    installFetch()
    renderPos()

    const productButton = await screen.findByRole('button', {
      name: /4" SWR Pipe PPL 2.7 mm/i,
    })
    fireEvent.click(productButton)

    const cartRow = await screen.findByRole('row', {
      name: /4" SWR Pipe PPL 2.7 mm/i,
    })
    expect(
      within(cartRow).getByDisplayValue('69.00'),
    ).toHaveAttribute('readonly')
    expect(within(cartRow).getByText('৳69.00')).toBeInTheDocument()

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

    fireEvent.click(
      await screen.findByRole('button', {
        name: /4" SWR Pipe PPL 2.7 mm/i,
      }),
    )

    const price = await screen.findByLabelText(
      'Selling price for 4" SWR Pipe PPL 2.7 mm',
    )
    expect(price).toHaveAttribute('readonly')
    fireEvent.change(price, { target: { value: '40.00' } })
    expect(price).toHaveValue('69.00')
  })

  it('allows permitted manual price, warns below cost, and resets to lot price', async () => {
    installFetch()
    renderPos({
      ...baseSession,
      permissions: ['SALES_OVERRIDE_SELLING_PRICE'],
    })

    fireEvent.click(
      await screen.findByRole('button', {
        name: /4" SWR Pipe PPL 2.7 mm/i,
      }),
    )

    const price = await screen.findByLabelText(
      'Selling price for 4" SWR Pipe PPL 2.7 mm',
    )
    expect(price).not.toHaveAttribute('readonly')

    fireEvent.change(price, { target: { value: '40.00' } })

    expect(
      await screen.findByText('Manual selling price'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/below FIFO cost/i),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to Lot Price' }),
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

    fireEvent.click(
      await screen.findByRole('button', {
        name: /4" SWR Pipe PPL 2.7 mm/i,
      }),
    )

    const qty = await screen.findByLabelText(
      'Quantity for 4" SWR Pipe PPL 2.7 mm',
    )
    fireEvent.change(qty, { target: { value: '2' } })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          if (
            input !== '/api/private/sales/quote-line' ||
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
      screen.getByRole('button', { name: 'Reset to Lot Price' }),
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

    expect(await screen.findByText('Sale completed')).toBeInTheDocument()
  })
})
