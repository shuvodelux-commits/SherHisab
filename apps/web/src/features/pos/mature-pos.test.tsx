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

const shortageProduct: PosProductSearchDto = {
  ...product('variant-shortage', 'Shortage Pipe', 'SHORT-001'),
  availableOwnBaseQty: '5',
}

const zeroStockProduct: PosProductSearchDto = {
  ...product('variant-zero', 'Zero Stock Switch', 'ZERO-001'),
  availableOwnBaseQty: '0',
}

const costedProduct: PosProductSearchDto = {
  ...product('variant-costed', 'Costed Drill', 'COST-001'),
  configuredPurchasePricePaisa: '7000',
}

const hiddenCostProduct: PosProductSearchDto = {
  ...product('variant-hidden-cost', 'Hidden Cost Drill', 'HIDE-001'),
}

const paymentProduct: PosProductSearchDto = {
  ...product('variant-payment', 'Payment Product', 'PAY-001'),
  currentSellingPricePaisa: '100000',
}

const vendor = {
  id: 'vendor-1',
  vendorCode: 'VEN-00001',
  name: 'Rahman Vendor',
  phone: '01733333333',
  address: 'Natore',
  isActive: true,
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

function shortageQuote(
  variantId: string,
  requestedBaseQty: string,
) {
  const requested = Number(requestedBaseQty)
  const own = variantId === 'variant-zero' ? 0 : 5
  const allocated = Math.min(requested, own)
  const shortfall = Math.max(requested - own, 0)

  return {
    variantId,
    baseQty: requestedBaseQty,
    pricingQty: requestedBaseQty,
    displayQty: requestedBaseQty,
    availableOwnBaseQty: String(own),
    shortfallBaseQty: String(shortfall),
    automaticSalesTotalPaisa: String(allocated * 1000),
    effectiveUnitSellingPricePaisa: '1000',
    sellingSegments:
      allocated > 0
        ? [
            {
              lotId: `lot-${variantId}`,
              baseQty: String(allocated),
              unitSellingPricePaisa: '1000',
              amountPaisa: String(allocated * 1000),
            },
          ]
        : [],
    conversion: {
      baseQty: requestedBaseQty,
      pricingQty: requestedBaseQty,
      displayQty: requestedBaseQty,
      components: {},
      snapshot: null,
    },
  }
}

interface SaleTestResponse {
  status: number
  body: unknown
}

function successfulSaleResponse() {
  return {
    id: 'sale-payment',
    invoiceNumber: 'INV-000123',
    businessDate: '2026-09-25',
    totalSalesPaisa: '100000',
    totalCogsPaisa: '70000',
    grossProfitPaisa: '30000',
    lines: [],
    customerId: null,
    subtotalPaisa: '100000',
    discountPaisa: '0',
    grandTotalPaisa: '100000',
    settlementStatus: 'PAID',
    paidAmountPaisa: '100000',
    duePaisa: '0',
    changePaisa: '0',
  }
}

function installFetch(options: {
  saleResponses?: SaleTestResponse[]
} = {}) {
  let saleAttempt = 0
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
        if (search.toLowerCase().includes('shortage')) {
          return jsonResponse([shortageProduct])
        }
        if (search.toLowerCase().includes('zero')) {
          return jsonResponse([zeroStockProduct])
        }
        if (search.toLowerCase().includes('costed')) {
          return jsonResponse([costedProduct])
        }
        if (search.toLowerCase().includes('hidden cost')) {
          return jsonResponse([hiddenCostProduct])
        }
        if (search.toLowerCase().includes('payment')) {
          return jsonResponse([paymentProduct])
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

      if (url.startsWith('/api/private/vendors?')) {
        const params = new URLSearchParams(url.split('?')[1])
        const search = params.get('search') ?? ''
        return jsonResponse(
          search.toLowerCase().includes('rahman') ? [vendor] : [],
        )
      }

      if (
        url === '/api/private/pos/quote-line' &&
        init?.method === 'POST'
      ) {
        const body = JSON.parse(String(init.body)) as {
          variantId: string
          baseQty?: string
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
        if (body.variantId === 'variant-payment') {
          return jsonResponse({
            ...safeQuote(body.variantId),
            automaticSalesTotalPaisa: '100000',
            effectiveUnitSellingPricePaisa: '100000',
            sellingSegments: [
              {
                lotId: 'lot-variant-payment',
                baseQty: '1',
                unitSellingPricePaisa: '100000',
                amountPaisa: '100000',
              },
            ],
          })
        }
        if (
          body.variantId === 'variant-shortage' ||
          body.variantId === 'variant-zero'
        ) {
          const requestedBaseQty =
            typeof body.baseQty === 'string' ? body.baseQty : '1'
          return jsonResponse(
            shortageQuote(body.variantId, requestedBaseQty),
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
          financialAccounts: [
            {
              id: 'account-dbbl',
              type: 'BANK',
              name: 'DBBL',
              provider: 'Dutch-Bangla Bank',
              accountReference: '****1234',
              isActive: true,
            },
            {
              id: 'account-bkash',
              type: 'MOBILE_BANKING',
              name: 'Shop bKash',
              provider: 'bKash',
              accountReference: '01700000000',
              isActive: true,
            },
          ],
          activeCashSession: null,
          recent: { drafts: [], templates: [] },
        })
      }

      if (
        url === '/api/private/sales' &&
        init?.method === 'POST'
      ) {
        const response =
          options.saleResponses?.[saleAttempt] ?? {
            status: 201,
            body: successfulSaleResponse(),
          }
        saleAttempt += 1
        return jsonResponse(response.body, response.status)
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

describe('Mature POS shortage resolution', () => {
  async function addProductAndSetQuantity(
    searchValue: string,
    productName: string,
    quantity: string,
  ) {
    const search = screen.getByRole('textbox', {
      name: 'Search products',
    })
    fireEvent.change(search, { target: { value: searchValue } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: `Add ${productName}`,
      }),
    )
    const quantityInput = await screen.findByLabelText(
      `Quantity for ${productName}`,
    )
    const row = quantityInput.closest('tr')
    if (!row) {
      throw new Error('Cart row not found')
    }
    fireEvent.change(quantityInput, {
      target: { value: quantity },
    })
    return row
  }

  it('Own Stock clamps a partial shortage to exact available own quantity and closes the panel', async () => {
    installFetch()
    renderPos()

    const row = await addProductAndSetQuantity(
      'shortage',
      'Shortage Pipe',
      '10',
    )

    expect(
      await screen.findByText(/Shortfall: 5 pcs/i),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Own Stock (5)' }),
    )

    await waitFor(() => {
      expect(
        within(row).getByLabelText('Quantity for Shortage Pipe'),
      ).toHaveValue('5')
    })
    expect(
      screen.queryByText(/Shortfall: 5 pcs/i),
    ).not.toBeInTheDocument()
  })

  it('Own Stock removes a zero-stock line and shows the compact no-stock message', async () => {
    installFetch()
    renderPos()

    await addProductAndSetQuantity(
      'zero',
      'Zero Stock Switch',
      '1',
    )

    expect(
      await screen.findByText(/Shortfall: 1 pcs/i),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Own Stock (0)' }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('row', {
          name: /Zero Stock Switch/i,
        }),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByText(/no own stock available/i),
    ).toBeInTheDocument()
  })

  it('Vendor reveals selector, unit cost, shortage total and New Vendor; switching to Negative clears Vendor fields', async () => {
    installFetch()
    renderPos()

    await addProductAndSetQuantity(
      'shortage',
      'Shortage Pipe',
      '10',
    )
    await screen.findByText(/Shortfall: 5 pcs/i)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Vendor / Consignment',
      }),
    )

    const vendorSearch = screen.getByRole('textbox', {
      name: 'Vendor for Shortage Pipe',
    })
    expect(
      screen.getByRole('button', { name: '+ New Vendor' }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Sourcing Unit Cost for Shortage Pipe'),
    ).toBeInTheDocument()

    fireEvent.change(vendorSearch, {
      target: { value: 'Rahman' },
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Select Rahman Vendor',
      }),
    )
    fireEvent.change(
      screen.getByLabelText('Sourcing Unit Cost for Shortage Pipe'),
      { target: { value: '80.00' } },
    )

    expect(screen.getByText('Shortage 5 pcs')).toBeInTheDocument()
    expect(screen.getByText('Vendor total ৳400.00')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Negative Stock Sale',
      }),
    )

    expect(
      screen.queryByRole('textbox', {
        name: 'Vendor for Shortage Pipe',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText(
        'Sourcing Unit Cost for Shortage Pipe',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Negative Stock Sale',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})


describe('Mature POS purchase-price reveal', () => {
  it('does not render a purchase-price eye when the secure DTO omits configured purchase price', async () => {
    installFetch()
    renderPos()

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search products' }),
      { target: { value: 'hidden cost' } },
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Hidden Cost Drill',
      }),
    )

    await screen.findByLabelText('Quantity for Hidden Cost Drill')
    expect(
      screen.queryByRole('button', {
        name: 'Show purchase price for Hidden Cost Drill',
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Purchase Price/i)).not.toBeInTheDocument()
  })

  it('reveals only configured purchase price and automatically hides it after 500 ms', async () => {
    installFetch()
    renderPos()

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search products' }),
      { target: { value: 'costed' } },
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Costed Drill',
      }),
    )

    const rowInput = await screen.findByLabelText(
      'Quantity for Costed Drill',
    )
    const row = rowInput.closest('tr')
    if (!row) {
      throw new Error('Costed cart row not found')
    }

    const reveal = within(row).getByRole('button', {
      name: 'Show purchase price for Costed Drill',
    })
    fireEvent.click(reveal)

    expect(
      within(row).getByText('Purchase Price ৳70.00'),
    ).toBeInTheDocument()
    expect(within(row).queryByText(/COGS/i)).not.toBeInTheDocument()
    expect(within(row).queryByText(/FIFO cost/i)).not.toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 550))

    await waitFor(() => {
      expect(
        within(row).queryByText('Purchase Price ৳70.00'),
      ).not.toBeInTheDocument()
    })
    expect(
      within(row).getByRole('button', {
        name: 'Show purchase price for Costed Drill',
      }),
    ).toBeInTheDocument()
  })
})


describe('Mature POS multiple payments', () => {
  async function addPaymentProduct() {
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search products' }),
      { target: { value: 'payment' } },
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Payment Product',
      }),
    )
    await screen.findByLabelText('Quantity for Payment Product')
  }

  function choosePaymentMethod(
    index: number,
    method: 'Cash' | 'Bank' | 'Mobile Banking',
  ) {
    fireEvent.click(
      screen.getByLabelText(`Payment method ${index}`),
    )
    fireEvent.click(
      screen.getByRole('option', { name: method }),
    )
  }

  function choosePaymentAccount(index: number, account: string) {
    fireEvent.click(
      screen.getByLabelText(`Payment account ${index}`),
    )
    fireEvent.click(
      screen.getByRole('option', { name: account }),
    )
  }

  it('adds Cash, Bank and Mobile Banking rows with conditional accounts and live Paid/Due', async () => {
    installFetch()
    renderPos()
    await addPaymentProduct()

    fireEvent.change(screen.getByLabelText('Payment amount 1'), {
      target: { value: '500' },
    })
    expect(
      screen.queryByLabelText('Payment account 1'),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add Payment' }),
    )
    choosePaymentMethod(2, 'Bank')
    choosePaymentAccount(2, 'DBBL')
    fireEvent.change(screen.getByLabelText('Payment amount 2'), {
      target: { value: '300' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add Payment' }),
    )
    choosePaymentMethod(3, 'Mobile Banking')
    choosePaymentAccount(3, 'Shop bKash')
    fireEvent.change(screen.getByLabelText('Payment amount 3'), {
      target: { value: '200' },
    })

    expect(screen.getByText('Paid ৳1000.00')).toBeInTheDocument()
    expect(screen.getByText('Due ৳0.00')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove payment 2' }),
    )
    expect(screen.getByText('Paid ৳700.00')).toBeInTheDocument()
    expect(screen.getByText('Due ৳300.00')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Payment account 2'),
    ).not.toHaveTextContent('DBBL')
  })

  it('preserves every payment row in the checkout request', async () => {
    const fetchMock = installFetch()
    renderPos()
    await addPaymentProduct()

    fireEvent.change(screen.getByLabelText('Payment amount 1'), {
      target: { value: '500' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add Payment' }),
    )
    choosePaymentMethod(2, 'Bank')
    choosePaymentAccount(2, 'DBBL')
    fireEvent.change(screen.getByLabelText('Payment amount 2'), {
      target: { value: '300' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add Payment' }),
    )
    choosePaymentMethod(3, 'Mobile Banking')
    choosePaymentAccount(3, 'Shop bKash')
    fireEvent.change(screen.getByLabelText('Payment amount 3'), {
      target: { value: '200' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Sale' }),
    )

    await waitFor(() => {
      const saleCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          input === '/api/private/sales' &&
          init?.method === 'POST',
      )
      expect(saleCall).toBeDefined()

      const body = JSON.parse(String(saleCall?.[1]?.body)) as {
        payments: Array<{
          clientLineId: string
          method: string
          accountId?: string
          amountPaisa: string
        }>
      }

      expect(body.payments).toEqual([
        {
          clientLineId: expect.any(String),
          method: 'CASH',
          amountPaisa: '50000',
        },
        {
          clientLineId: expect.any(String),
          method: 'BANK',
          accountId: 'account-dbbl',
          amountPaisa: '30000',
        },
        {
          clientLineId: expect.any(String),
          method: 'MOBILE_BANKING',
          accountId: 'account-bkash',
          amountPaisa: '20000',
        },
      ])
    })
  })
})


describe('Mature POS submission intent and invoice result', () => {
  async function preparePaidCheckout() {
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search products' }),
      { target: { value: 'payment' } },
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Payment Product',
      }),
    )
    await screen.findByLabelText('Quantity for Payment Product')

    fireEvent.change(screen.getByLabelText('Customer Name'), {
      target: { value: 'Karim Buyer' },
    })
    fireEvent.change(screen.getByLabelText('Customer Phone'), {
      target: { value: '01711111111' },
    })
    fireEvent.change(screen.getByLabelText('Payment amount 1'), {
      target: { value: '1000' },
    })
  }

  function saleBodies(fetchMock: ReturnType<typeof installFetch>) {
    return fetchMock.mock.calls
      .filter(
        ([input, init]) =>
          input === '/api/private/sales' &&
          init?.method === 'POST',
      )
      .map(([, init]) =>
        JSON.parse(String(init?.body)) as {
          operationId: string
          payments: Array<{ amountPaisa: string }>
        },
      )
  }

  it('reuses one operation UUID on retry, clears editable state only after success, and shows the invoice result', async () => {
    const fetchMock = installFetch({
      saleResponses: [
        {
          status: 500,
          body: { error: 'Temporary sale failure' },
        },
        {
          status: 201,
          body: successfulSaleResponse(),
        },
      ],
    })
    renderPos()
    await preparePaidCheckout()

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Sale' }),
    )

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('Temporary sale failure')
    expect(
      screen.getByLabelText('Quantity for Payment Product'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Customer Name')).toHaveValue(
      'Karim Buyer',
    )
    expect(screen.getByLabelText('Payment amount 1')).toHaveValue(
      '1000',
    )

    await waitFor(() => {
      expect(saleBodies(fetchMock)).toHaveLength(1)
    })
    const firstOperationId = saleBodies(fetchMock)[0]!.operationId
    expect(firstOperationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Sale' }),
    )

    await waitFor(() => {
      expect(saleBodies(fetchMock)).toHaveLength(2)
    })
    expect(saleBodies(fetchMock)[1]!.operationId).toBe(
      firstOperationId,
    )

    const invoiceResult = await screen.findByLabelText(
      'Invoice INV-000123',
    )
    expect(
      within(invoiceResult).getByText('Invoice INV-000123'),
    ).toBeInTheDocument()
    expect(
      within(invoiceResult).getByText('Total ৳1000.00'),
    ).toBeInTheDocument()
    expect(
      within(invoiceResult).getByText('Paid ৳1000.00'),
    ).toBeInTheDocument()
    expect(
      within(invoiceResult).getByText('Due ৳0.00'),
    ).toBeInTheDocument()

    expect(
      screen.queryByLabelText('Quantity for Payment Product'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Customer Name')).toHaveValue('')
    expect(screen.getByLabelText('Customer Phone')).toHaveValue('')
    expect(screen.getByLabelText('Payment amount 1')).toHaveValue('')
  })

  it('creates a new operation UUID when checkout intent changes after a failed attempt', async () => {
    const fetchMock = installFetch({
      saleResponses: [
        {
          status: 500,
          body: { error: 'Temporary sale failure' },
        },
        {
          status: 201,
          body: {
            ...successfulSaleResponse(),
            settlementStatus: 'PARTIAL',
            paidAmountPaisa: '90000',
            duePaisa: '10000',
          },
        },
      ],
    })
    renderPos()
    await preparePaidCheckout()

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Sale' }),
    )
    await screen.findByText('Temporary sale failure')
    await waitFor(() => {
      expect(saleBodies(fetchMock)).toHaveLength(1)
    })

    const firstOperationId = saleBodies(fetchMock)[0]!.operationId
    fireEvent.change(screen.getByLabelText('Payment amount 1'), {
      target: { value: '900' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Sale' }),
    )

    await waitFor(() => {
      expect(saleBodies(fetchMock)).toHaveLength(2)
    })
    expect(saleBodies(fetchMock)[1]!.operationId).not.toBe(
      firstOperationId,
    )
  })
})

})
