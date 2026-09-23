import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  ProductLotsDialog,
  StockAdjustDialog,
} from './stock-adjust-dialog'
import type { ProductDetailDto } from './product-types'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const pieceUnit = {
  id: 'unit-piece',
  name: 'Piece',
  symbol: 'pcs',
  isActive: true,
}

function simpleProduct(): ProductDetailDto {
  return {
    id: 'product-simple',
    name: 'Hammer',
    brand: '',
    category: null,
    baseUnit: pieceUnit,
    defaultVariantId: 'variant-default',
    variantCount: 1,
    defaultPurchasePricePaisa: '1000',
    defaultSellingPricePaisa: '1500',
    stockBaseQty: '5.25',
    minimumStockBaseQty: '1',
    trackingMode: 'SIMPLE',
    variantsEnabled: false,
    isActive: true,
    primaryBarcode: null,
    advanced: {
      alternativeUnits: [],
      specifications: [],
      variants: [],
    },
  }
}

function variantProduct(): ProductDetailDto {
  return {
    ...simpleProduct(),
    id: 'product-variant',
    name: 'T-Shirt',
    variantsEnabled: true,
    variantCount: 3,
    stockBaseQty: '7',
    advanced: {
      alternativeUnits: [],
      specifications: [],
      variants: [
        {
          id: 'variant-red',
          displayName: 'Red / L',
          sku: 'RED-L',
          defaultPurchasePricePaisa: '1200',
          defaultSellingPricePaisa: '1800',
          minimumStockBaseQty: '1',
          stockBaseQty: '4',
          hasInventoryHistory: true,
          selections: { Color: 'Red', Size: 'L' },
          isActive: true,
        },
        {
          id: 'variant-blue',
          displayName: 'Blue / L',
          sku: 'BLUE-L',
          defaultPurchasePricePaisa: '1250',
          defaultSellingPricePaisa: '1850',
          minimumStockBaseQty: '1',
          stockBaseQty: '3',
          hasInventoryHistory: true,
          selections: { Color: 'Blue', Size: 'L' },
          isActive: true,
        },
      ],
    },
  }
}

function installFetch(options: { adjustmentError?: string } = {}) {
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

    if (
      url.startsWith('/api/private/products/product-simple/stock-adjustments') &&
      init?.method === 'POST'
    ) {
      if (options.adjustmentError) {
        return jsonResponse({ error: options.adjustmentError }, 400)
      }

      return jsonResponse({
        ...simpleProduct(),
        stockBaseQty: '5.375',
      })
    }

    if (
      url.startsWith('/api/private/products/product-variant/stock-adjustments') &&
      init?.method === 'POST'
    ) {
      if (options.adjustmentError) {
        return jsonResponse({ error: options.adjustmentError }, 400)
      }

      return jsonResponse(variantProduct())
    }

    if (url.startsWith('/api/private/products/product-simple/lots')) {
      return jsonResponse([
        {
          id: 'lot-old',
          receivedOn: '2026-09-01',
          sourceType: 'OPENING',
          originalBaseQty: '5',
          remainingBaseQty: '1.5',
          unitCostPaisa: '1000',
          status: 'ACTIVE',
          lotCode: null,
          batchCode: null,
          expiresOn: null,
        },
        {
          id: 'lot-new',
          receivedOn: '2026-09-10',
          sourceType: 'ADJUSTMENT',
          originalBaseQty: '2',
          remainingBaseQty: '2',
          unitCostPaisa: '1250',
          status: 'ACTIVE',
          lotCode: null,
          batchCode: null,
          expiresOn: null,
        },
      ])
    }

    if (url.startsWith('/api/private/products/product-variant/lots')) {
      return jsonResponse([
        {
          id: 'lot-red',
          receivedOn: '2026-09-05',
          sourceType: 'ADJUSTMENT',
          originalBaseQty: '4',
          remainingBaseQty: '4',
          unitCostPaisa: '1200',
          status: 'ACTIVE',
          lotCode: null,
          batchCode: null,
          expiresOn: null,
        },
      ])
    }

    return jsonResponse({ error: 'Unexpected test request.' }, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderWithQueryClient(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <QueryClientProvider client={queryClient}>
      {node}
    </QueryClientProvider>,
  )

  return { queryClient, invalidateSpy }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StockAdjustDialog', () => {
  it('shows current stock and uses the default variant silently for simple products', async () => {
    installFetch()

    renderWithQueryClient(
      <StockAdjustDialog
        onOpenChange={vi.fn()}
        open
        product={simpleProduct()}
      />,
    )

    expect(
      await screen.findByRole('dialog', { name: 'Adjust Stock' }),
    ).toBeInTheDocument()
    expect(screen.getByText('5.25')).toBeInTheDocument()
    expect(screen.getByText('pcs')).toBeInTheDocument()
    expect(screen.queryByLabelText('Variant')).not.toBeInTheDocument()
  })

  it('requires a non-zero signed quantity and reason', async () => {
    const fetchMock = installFetch()

    renderWithQueryClient(
      <StockAdjustDialog
        onOpenChange={vi.fn()}
        open
        product={simpleProduct()}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Adjust stock' }),
    )

    expect(
      await screen.findByText('Enter a non-zero stock adjustment.'),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Quantity adjustment'), {
      target: { value: '0.125' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }))

    expect(
      await screen.findByText('Adjustment reason is required.'),
    ).toBeInTheDocument()
  })

  it('shows optional Cost only for positive adjustments and submits exact paisa', async () => {
    const fetchMock = installFetch()
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const { invalidateSpy } = renderWithQueryClient(
      <StockAdjustDialog
        onOpenChange={onOpenChange}
        open
        product={simpleProduct()}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Quantity adjustment'), {
      target: { value: '0.125' },
    })

    expect(screen.getByLabelText('Cost')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add stock' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Cost'), {
      target: { value: '12.50' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Count correction' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          input ===
            '/api/private/products/product-simple/stock-adjustments' &&
          init?.method === 'POST',
      )
      expect(call).toBeDefined()
      const body = JSON.parse(String(call?.[1]?.body))
      expect(body).toEqual({
        deltaBaseQty: '0.125',
        note: 'Count correction',
        unitCostPaisa: '1250',
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['products'],
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('hides Cost for negative adjustments and keeps stock errors in the dialog', async () => {
    installFetch({
      adjustmentError:
        'Cannot remove stock because available stock is insufficient',
    })
    const onOpenChange = vi.fn<(open: boolean) => void>()

    renderWithQueryClient(
      <StockAdjustDialog
        onOpenChange={onOpenChange}
        open
        product={simpleProduct()}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Quantity adjustment'), {
      target: { value: '-9' },
    })

    expect(screen.queryByLabelText('Cost')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove stock' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Damaged items' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove stock' }))

    expect(
      await screen.findByText(
        'Cannot remove stock because available stock is insufficient',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Adjust Stock' }),
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('requires a specific active Variant for variant-enabled products', async () => {
    const fetchMock = installFetch()

    renderWithQueryClient(
      <StockAdjustDialog
        onOpenChange={vi.fn()}
        open
        product={variantProduct()}
      />,
    )

    expect(await screen.findByLabelText('Variant')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Red / L' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Blue / L' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Quantity adjustment'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Count correction' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }))

    expect(
      await screen.findByText('Select a Variant before adjusting stock.'),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Variant'), {
      target: { value: 'variant-red' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          input ===
            '/api/private/products/product-variant/stock-adjustments' &&
          init?.method === 'POST',
      )
      expect(call).toBeDefined()
      const body = JSON.parse(String(call?.[1]?.body))
      expect(body.variantId).toBe('variant-red')
    })
  })
})

describe('ProductLotsDialog', () => {
  it('shows FIFO lot evidence in API order with date, quantity, cost and status', async () => {
    installFetch()

    renderWithQueryClient(
      <ProductLotsDialog
        onOpenChange={vi.fn()}
        open
        product={simpleProduct()}
      />,
    )

    expect(
      await screen.findByRole('dialog', { name: 'Stock Lots' }),
    ).toBeInTheDocument()

    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]!).getByText('2026-09-01')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('1.5')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('৳10.00')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Active')).toBeInTheDocument()

    expect(within(rows[2]!).getByText('2026-09-10')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('2')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('৳12.50')).toBeInTheDocument()
  })

  it('requires a Variant before loading lots for variant-enabled products', async () => {
    const fetchMock = installFetch()

    renderWithQueryClient(
      <ProductLotsDialog
        onOpenChange={vi.fn()}
        open
        product={variantProduct()}
      />,
    )

    expect(await screen.findByLabelText('Variant')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Variant'), {
      target: { value: 'variant-red' },
    })

    expect(await screen.findByText('lot-red')).toBeInTheDocument()

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('variantId=variant-red'),
        ),
      ).toBe(true)
    })
  })
})
