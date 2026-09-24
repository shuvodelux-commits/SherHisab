import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { LanguageProvider } from '../../app/language'
import { ProductPage } from './product-page'
import type { ProductListItemDto } from './product-types'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function product(
  overrides: Partial<ProductListItemDto> = {},
): ProductListItemDto {
  return {
    id: 'product-1',
    name: 'Cotton Roll',
    brand: 'Classic',
    category: {
      id: 'category-1',
      name: 'Fabric',
      isActive: true,
    },
    baseUnit: {
      id: 'unit-1',
      name: 'Yard',
      symbol: 'yd',
      isActive: true,
    },
    defaultVariantId: 'variant-1',
    variantCount: 3,
    defaultPurchasePricePaisa: '1250',
    defaultSellingPricePaisa: '1875',
    stockBaseQty: '2.50000000',
    stockValuePaisa: '3125',
    minimumStockBaseQty: '0.12500000',
    trackingMode: 'SIMPLE',
    variantsEnabled: true,
    isActive: true,
    ...overrides,
  }
}

function installFetch(
  options: {
    productsStatus?: number
    total?: number
    items?: ProductListItemDto[]
  } = {},
) {
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

    if (url.startsWith('/api/private/product-categories')) {
      return jsonResponse([
        {
          id: 'category-1',
          name: 'Fabric',
          isActive: true,
        },
      ])
    }

    if (
      url === '/api/private/products/product-1/status' &&
      init?.method === 'POST'
    ) {
      return jsonResponse(product({ isActive: false }))
    }

    if (url.startsWith('/api/private/products')) {
      if ((options.productsStatus ?? 200) >= 400) {
        return jsonResponse(
          { error: 'Products are temporarily unavailable.' },
          options.productsStatus ?? 500,
        )
      }

      const parsed = new URL(url, 'https://sherhisab.test')
      const offset = Number(parsed.searchParams.get('offset') ?? '0')

      if (offset === 50) {
        return jsonResponse({
          items: [
            product({
              id: 'product-51',
              name: 'Last Product',
              variantCount: 1,
              variantsEnabled: false,
            }),
          ],
          total: options.total ?? 51,
          limit: 50,
          offset,
        })
      }

      return jsonResponse({
        items: options.items ?? [product()],
        total: options.total ?? 51,
        limit: 50,
        offset,
      })
    }

    return jsonResponse({ error: 'Unexpected test request.' }, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function chooseSelectOption(label: string, option: string) {
  const trigger = screen.getByLabelText(label)
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  const optionElement = await screen.findByRole('option', { name: option })
  fireEvent.click(optionElement)
  await waitFor(() => {
    expect(screen.getByLabelText(label)).toHaveTextContent(option)
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ProductPage />
      </QueryClientProvider>
    </LanguageProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('ProductPage', () => {
  it('renders the compact bilingual table, filters and server pagination', async () => {
    const fetchMock = installFetch()

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(screen.getByText('পণ্য ও স্টক')).toBeInTheDocument()

    expect(
      await screen.findByRole('columnheader', { name: 'Product' }),
    ).toBeInTheDocument()

    for (const heading of [
      'Category',
      'Brand',
      'Unit',
      'Purchase Price',
      'Selling Price',
      'Stock',
      'Min Stock',
      'Stock Value',
      'Status',
      'Actions',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: heading }),
      ).toBeInTheDocument()
    }

    const headerNames = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.trim())
    expect(headerNames.indexOf('Stock Value')).toBeLessThan(
      headerNames.indexOf('Status'),
    )

    for (const heading of [
      'Purchase Price',
      'Selling Price',
      'Stock',
      'Min Stock',
      'Stock Value',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: heading }),
      ).toHaveAttribute('data-align', 'right')
    }

    for (const heading of [
      'Product',
      'Purchase Price',
      'Selling Price',
      'Stock',
      'Stock Value',
    ]) {
      expect(
        screen.getByRole('button', { name: `Sort by ${heading}` }),
      ).toBeInTheDocument()
    }

    for (const heading of [
      'Category',
      'Brand',
      'Unit',
      'Min Stock',
      'Status',
      'Actions',
    ]) {
      expect(
        screen.queryByRole('button', { name: `Sort by ${heading}` }),
      ).not.toBeInTheDocument()
    }

    const categoryFilter = screen.getByLabelText('Category filter')
    const statusFilter = screen.getByLabelText('Status filter')
    expect(categoryFilter.tagName).not.toBe('SELECT')
    expect(statusFilter.tagName).not.toBe('SELECT')

    const addProductButton = screen.getByRole('button', { name: 'Add Product' })
    expect(addProductButton).toHaveAttribute('data-slot', 'button')

    expect(screen.getByText('Cotton Roll')).toBeInTheDocument()
    expect(screen.getByText('3 variants')).toBeInTheDocument()
    expect(screen.getByText('৳12.50')).toBeInTheDocument()
    expect(screen.getByText('৳18.75')).toBeInTheDocument()
    expect(screen.getByText('2.5')).toBeInTheDocument()
    expect(screen.getByText('0.125')).toBeInTheDocument()
    expect(screen.getByText('৳31.25')).toBeInTheDocument()

    for (const value of ['৳12.50', '৳18.75', '2.5', '0.125', '৳31.25']) {
      expect(screen.getByRole('cell', { name: value })).toHaveAttribute(
        'data-align',
        'right',
      )
    }

    const activeStatusCell = screen.getByRole('cell', { name: 'Active' })
    const activeStatus = activeStatusCell.querySelector('[data-slot="badge"]')
    expect(activeStatus).not.toBeNull()
    expect(activeStatus).toHaveClass('sher-badge-success')
    expect(screen.getByText('Showing 1–50 of 51')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search products'), {
      target: { value: 'bulb' },
    })
    await chooseSelectOption('Category filter', 'Fabric')
    fireEvent.change(screen.getByLabelText('Brand filter'), {
      target: { value: 'Classic' },
    })
    await chooseSelectOption('Status filter', 'Inactive')

    await waitFor(() => {
      const productUrls = fetchMock.mock.calls
        .map(([input]) =>
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        )
        .filter((url) => url.startsWith('/api/private/products'))

      expect(
        productUrls.some((url) => {
          const parsed = new URL(url, 'https://sherhisab.test')
          return (
            parsed.searchParams.get('search') === 'bulb' &&
            parsed.searchParams.get('categoryId') === 'category-1' &&
            parsed.searchParams.get('brand') === 'Classic' &&
            parsed.searchParams.get('status') === 'inactive' &&
            parsed.searchParams.get('offset') === '0'
          )
        }),
      ).toBe(true)
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Next' }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url
          if (!url.startsWith('/api/private/products')) {
            return false
          }
          const parsed = new URL(url, 'https://sherhisab.test')
          return parsed.searchParams.get('offset') === '50'
        }),
      ).toBe(true)
    })
  })

  it('requests server-side sorting when a Product header is sorted', async () => {
    const fetchMock = installFetch()
    renderPage()

    const sortButton = await screen.findByRole('button', {
      name: 'Sort by Selling Price',
    })
    fireEvent.click(sortButton)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url
          if (!url.startsWith('/api/private/products')) {
            return false
          }
          const parsed = new URL(url, 'https://sherhisab.test')
          return (
            parsed.searchParams.get('sortBy') === 'sellingPrice' &&
            parsed.searchParams.get('sortDir') === 'asc' &&
            parsed.searchParams.get('offset') === '0'
          )
        }),
      ).toBe(true)
    })
  })

  it('renders a useful empty state', async () => {
    installFetch({ items: [], total: 0 })

    renderPage()

    expect(await screen.findByText('No products yet.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Add your first product to start tracking stock.',
      ),
    ).toBeInTheDocument()
  })

  it('renders an error state with retry', async () => {
    const fetchMock = installFetch({ productsStatus: 500 })

    renderPage()

    expect(
      await screen.findByText('Could not load products.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Products are temporarily unavailable.'),
    ).toBeInTheDocument()

    const before = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    })
  })
})
