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
import type {
  PosCustomerSearchDto,
  PosProductSearchDto,
} from './pos-types'

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

const fabric: PosProductSearchDto = {
  ...product('variant-fabric', 'Muslin Fabric Black', 'FAB-001'),
  productId: 'product-fabric',
  unitName: 'Gauge',
  unitSymbol: 'Gauge',
  currentSellingPricePaisa: '30000',
  availableOwnBaseQty: '100',
}

const dueCustomer: PosCustomerSearchDto = {
  id: 'customer-due',
  customerCode: 'CUS-00001',
  name: 'Rahim Customer',
  phone: '01711111111',
  guardianName: 'Karim',
  address: 'Belkuchi',
  balancePaisa: '5000',
}

const creditCustomer: PosCustomerSearchDto = {
  id: 'customer-credit',
  customerCode: 'CUS-00002',
  name: 'Salma Customer',
  phone: '01722222222',
  guardianName: '',
  address: 'Sirajganj',
  balancePaisa: '-3000',
}

const fabricSnapshot = {
  id: 'profile-fabric',
  productId: 'product-fabric',
  type: 'COMPOUND' as const,
  version: 1,
  baseUnitId: 'unit-gira',
  pricingUnitId: 'unit-gauge',
  pricingBaseFactorNumerator: '16',
  pricingBaseFactorDenominator: '1',
  displayPrecision: 2,
  components: [
    {
      id: 'component-gauge',
      key: 'gauge',
      label: 'Gauge',
      unitId: 'unit-gauge',
      baseFactorNumerator: '16',
      baseFactorDenominator: '1',
      sortOrder: 0,
      minValue: '0',
      maxExclusive: null,
      allowFraction: false,
      autoNormalizeRemainder: false,
    },
    {
      id: 'component-gira',
      key: 'gira',
      label: 'Gira',
      unitId: 'unit-gira',
      baseFactorNumerator: '1',
      baseFactorDenominator: '1',
      sortOrder: 1,
      minValue: '0',
      maxExclusive: '16',
      allowFraction: false,
      autoNormalizeRemainder: true,
    },
  ],
}

function fabricQuote(
  components: Record<string, string> = {},
) {
  const gauge = Number(components.gauge ?? '0')
  const gira = Number(components.gira ?? '0')
  const baseQty =
    Object.keys(components).length === 0
      ? 1
      : gauge * 16 + gira
  const pricingQty = baseQty / 16
  const displayQty = pricingQty.toFixed(2)
  const totalPaisa = Math.round(pricingQty * 30000).toString()

  return {
    variantId: 'variant-fabric',
    baseQty: String(baseQty),
    pricingQty: String(pricingQty),
    displayQty,
    availableOwnBaseQty: '100',
    shortfallBaseQty: '0',
    automaticSalesTotalPaisa: totalPaisa,
    effectiveUnitSellingPricePaisa: '30000',
    sellingSegments: [
      {
        lotId: 'lot-fabric',
        baseQty: String(baseQty),
        unitSellingPricePaisa: '30000',
        amountPaisa: totalPaisa,
      },
    ],
    conversion: {
      baseQty: String(baseQty),
      pricingQty: String(pricingQty),
      displayQty,
      components,
      snapshot: fabricSnapshot,
    },
  }
}

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
        if (search.toLowerCase().includes('muslin')) {
          return jsonResponse([fabric])
        }
        return jsonResponse(search ? [alpha, beta] : [])
      }

      if (url.startsWith('/api/private/pos/customers?')) {
        const params = new URLSearchParams(url.split('?')[1])
        const search = params.get('search') ?? ''
        if (search.includes('Salma') || search.includes('017222')) {
          return jsonResponse([creditCustomer])
        }
        if (search) {
          return jsonResponse([dueCustomer])
        }
        return jsonResponse([])
      }

      if (
        url === '/api/private/pos/quote-line' &&
        init?.method === 'POST'
      ) {
        const body = JSON.parse(String(init.body)) as {
          variantId: string
          quantity?: {
            kind: 'COMPONENTS'
            profileId: string
            profileVersion: number
            components: Record<string, string>
          }
        }
        if (body.variantId === 'variant-fabric') {
          return jsonResponse(
            fabricQuote(body.quantity?.components ?? {}),
          )
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

    fireEvent.change(search, { target: { value: 'hammer ' } })
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

  it('clears Product search without clearing the Cart', async () => {
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

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Clear product search',
      }),
    )

    expect(search).toHaveValue('')
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


describe('Mature POS Customer panel', () => {
  it('uses structured Name and Phone searches and shows the selected Customer live balance', async () => {
    const fetchMock = installFetch()
    renderPos()

    const name = screen.getByRole('textbox', {
      name: 'Customer Name',
    })
    const phone = screen.getByRole('textbox', {
      name: 'Customer Phone',
    })

    fireEvent.change(name, { target: { value: 'Rahim' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Select Rahim Customer',
      }),
    )

    expect(name).toHaveValue('Rahim Customer')
    expect(phone).toHaveValue('01711111111')
    expect(
      screen.getByText('Selected CUS-00001'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Outstanding Due ৳50.00'),
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).startsWith(
          '/api/private/pos/customers?search=Rahim&limit=20',
        ),
      ),
    ).toBe(true)

    fireEvent.change(name, { target: { value: 'Salma' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Select Salma Customer',
      }),
    )

    expect(
      screen.getByText('Customer Credit ৳30.00'),
    ).toBeInTheDocument()

    fireEvent.change(phone, { target: { value: '017111' } })
    await screen.findByRole('button', {
      name: 'Select Rahim Customer',
    })
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).startsWith(
          '/api/private/pos/customers?search=017111&limit=20',
        ),
      ),
    ).toBe(true)
  })

  it('editing selected Name or Phone clears selectedCustomerId while keeping typed snapshot values', async () => {
    installFetch()
    renderPos()

    const name = screen.getByRole('textbox', {
      name: 'Customer Name',
    })
    fireEvent.change(name, { target: { value: 'Rahim' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Select Rahim Customer',
      }),
    )
    expect(
      screen.getByText('Selected CUS-00001'),
    ).toBeInTheDocument()

    fireEvent.change(name, { target: { value: 'Rahim Edited' } })
    expect(
      screen.queryByText('Selected CUS-00001'),
    ).not.toBeInTheDocument()
    expect(name).toHaveValue('Rahim Edited')

    fireEvent.change(name, { target: { value: 'Rahim' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Select Rahim Customer',
      }),
    )
    const phone = screen.getByRole('textbox', {
      name: 'Customer Phone',
    })
    fireEvent.change(phone, { target: { value: '01799999999' } })

    expect(
      screen.queryByText('Selected CUS-00001'),
    ).not.toBeInTheDocument()
    expect(phone).toHaveValue('01799999999')
  })

  it('keeps Guardian and Address collapsed by default', async () => {
    installFetch()
    renderPos()

    expect(
      screen.queryByRole('textbox', { name: 'Customer Guardian' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Customer Address' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'More customer details',
      }),
    )

    expect(
      screen.getByRole('textbox', { name: 'Customer Guardian' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Customer Address' }),
    ).toBeInTheDocument()
  })

  it('enables Sales History for a selected Customer or a valid Phone', async () => {
    installFetch()
    renderPos()

    const history = screen.getByRole('button', {
      name: 'Sales History',
    })
    const phone = screen.getByRole('textbox', {
      name: 'Customer Phone',
    })

    expect(history).toBeDisabled()

    fireEvent.change(phone, { target: { value: '01712345678' } })
    expect(history).not.toBeDisabled()

    fireEvent.change(phone, { target: { value: '123' } })
    expect(history).toBeDisabled()

    const name = screen.getByRole('textbox', {
      name: 'Customer Name',
    })
    fireEvent.change(name, { target: { value: 'Rahim' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Select Rahim Customer',
      }),
    )
    expect(history).not.toBeDisabled()
  })
})


describe('Mature POS compound conversion row', () => {
  it('keeps derived compound Qty read-only and expands the generic editor immediately below the same Cart row', async () => {
    installFetch()
    renderPos()

    const search = screen.getByRole('textbox', {
      name: 'Search products',
    })
    fireEvent.change(search, { target: { value: 'muslin' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Muslin Fabric Black',
      }),
    )

    const row = await screen.findByRole('row', {
      name: /Muslin Fabric Black/i,
    })
    const qty = within(row).getByLabelText(
      'Quantity for Muslin Fabric Black',
    )
    expect(qty).toHaveAttribute('readonly')
    expect(qty).toHaveValue('0.06')
    expect(within(row).getByText('Gauge')).toBeInTheDocument()

    fireEvent.click(
      within(row).getByRole('button', {
        name: 'Edit quantity details for Muslin Fabric Black',
      }),
    )

    const editorRow = await screen.findByRole('row', {
      name: 'Quantity details for Muslin Fabric Black',
    })
    expect(row.nextElementSibling).toBe(editorRow)
    expect(
      within(editorRow).getByLabelText('Gauge for Muslin Fabric Black'),
    ).toBeInTheDocument()
    expect(
      within(editorRow).getByLabelText('Gira for Muslin Fabric Black'),
    ).toBeInTheDocument()
  })

  it('sends Gauge/Gira component input, displays rounded 2.31 and keeps exact 2.3125 economics', async () => {
    const fetchMock = installFetch()
    renderPos()

    const search = screen.getByRole('textbox', {
      name: 'Search products',
    })
    fireEvent.change(search, { target: { value: 'muslin' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Muslin Fabric Black',
      }),
    )

    const row = await screen.findByRole('row', {
      name: /Muslin Fabric Black/i,
    })
    fireEvent.click(
      within(row).getByRole('button', {
        name: 'Edit quantity details for Muslin Fabric Black',
      }),
    )

    const editorRow = await screen.findByRole('row', {
      name: 'Quantity details for Muslin Fabric Black',
    })
    fireEvent.change(
      within(editorRow).getByLabelText(
        'Gauge for Muslin Fabric Black',
      ),
      { target: { value: '2' } },
    )
    fireEvent.change(
      within(editorRow).getByLabelText(
        'Gira for Muslin Fabric Black',
      ),
      { target: { value: '5' } },
    )

    await waitFor(() => {
      const componentQuote = fetchMock.mock.calls.find(
        ([input, init]) => {
          if (
            input !== '/api/private/pos/quote-line' ||
            init?.method !== 'POST'
          ) {
            return false
          }
          const body = JSON.parse(String(init.body))
          return (
            body.variantId === 'variant-fabric' &&
            body.quantity?.components?.gauge === '2' &&
            body.quantity?.components?.gira === '5'
          )
        },
      )
      expect(componentQuote).toBeDefined()
    })

    const qty = within(row).getByLabelText(
      'Quantity for Muslin Fabric Black',
    )
    await waitFor(() => expect(qty).toHaveValue('2.31'))
    expect(
      within(row).getByLabelText(
        'Selling price for Muslin Fabric Black',
      ),
    ).toHaveValue('300.00')
    expect(within(row).getByText('৳693.75')).toBeInTheDocument()
  })

  it('re-quotes when a compound component changes instead of trusting client arithmetic', async () => {
    const fetchMock = installFetch()
    renderPos()

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search products' }),
      { target: { value: 'muslin' } },
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Muslin Fabric Black',
      }),
    )
    const row = await screen.findByRole('row', {
      name: /Muslin Fabric Black/i,
    })
    fireEvent.click(
      within(row).getByRole('button', {
        name: 'Edit quantity details for Muslin Fabric Black',
      }),
    )
    const editorRow = await screen.findByRole('row', {
      name: 'Quantity details for Muslin Fabric Black',
    })
    const gira = within(editorRow).getByLabelText(
      'Gira for Muslin Fabric Black',
    )

    fireEvent.change(gira, { target: { value: '3' } })

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
          return (
            body.variantId === 'variant-fabric' &&
            body.quantity?.kind === 'COMPONENTS' &&
            body.quantity?.profileId === 'profile-fabric' &&
            body.quantity?.profileVersion === 1 &&
            body.quantity?.components?.gira === '3'
          )
        }),
      ).toBe(true)
    })
  })
})
