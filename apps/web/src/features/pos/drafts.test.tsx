import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/language'
import { PosPage } from './pos-page'
import type { SalesDraftDto } from './pos-types'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const product = {
  productId: 'product-1',
  variantId: 'variant-1',
  productName: 'Draft Pipe',
  variantName: null,
  sku: 'PIPE-1',
  primaryBarcode: null,
  brand: 'Local',
  categoryName: 'Pipe',
  unitId: 'unit-1',
  unitName: 'Feet',
  unitSymbol: 'ft',
  currentSellingPricePaisa: '10000',
  availableOwnBaseQty: '10',
  trackingMode: 'SIMPLE' as const,
  allocationPolicy: 'FIFO' as const,
  variantsEnabled: false,
}

const draft: SalesDraftDto = {
  id: 'draft-1',
  tenantId: 'tenant-1',
  draftNumber: 'DRAFT-000001',
  version: 3,
  status: 'ACTIVE',
  ownerUserId: 'user-1',
  postedSaleId: null,
  postedOperationId: null,
  customer: {
    selectedCustomerId: 'customer-1',
    name: 'Ayesha',
    phone: '01700000000',
    guardianName: 'Rahim',
    address: 'Dhaka',
  },
  discountPaisa: '500',
  payments: [
    { clientLineId: 'pay-1', method: 'CASH', accountId: null, amountPaisa: '2500', reference: '', note: '' },
    { clientLineId: 'pay-2', method: 'MOBILE_BANKING', accountId: 'account-1', amountPaisa: '3000', reference: 'trx', note: 'bKash' },
  ],
  note: 'Call before delivery',
  lines: [{
    variantId: 'variant-1',
    quantityInput: { kind: 'SIMPLE', baseQty: '2' },
    normalizedQuantitySnapshot: {
      baseQty: '2', pricingQty: '2', displayQty: '2', components: {}, snapshot: null,
    },
    pricingMode: 'MANUAL',
    manualUnitSellingPricePaisa: '9000',
    shortageResolution: { type: 'NEGATIVE_STOCK' },
    serialIds: ['serial-1'],
    batchSelection: { lotId: 'lot-1', batchCode: 'B-1', expiresOn: '2027-01-01' },
    warrantySnapshot: { policyId: 'warranty-1', durationDays: 90 },
    captureValues: { imei: 'capture-1' },
  }],
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
}

function installFetch(selectedDraft = draft) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url === '/api/private/auth/session') {
      return jsonResponse({ authenticated: true, userId: 'user-1', tenantId: 'tenant-1', role: 'STAFF', permissions: ['POS_VIEW', 'POS_SELL'], expiresAt: '2026-09-25T00:00:00Z' })
    }
    if (url === '/api/private/pos/bootstrap') {
      return jsonResponse({ capabilities: { canSell: true, canOverrideSellingPrice: false, canViewConfiguredPurchasePrice: false, canBackdate: false }, settings: { showPurchasePrice: false, requireCashSession: false, invoiceShareEnabled: false }, financialAccounts: [], activeCashSession: null, recent: { drafts: [], templates: [] } })
    }
    if (url.startsWith('/api/private/sales/drafts?')) return jsonResponse([selectedDraft])
    if (url === `/api/private/sales/drafts/${selectedDraft.id}/post` && init?.method === 'POST') {
      return jsonResponse({ error: 'Insufficient stock' }, 400)
    }
    if (url === `/api/private/sales/drafts/${selectedDraft.id}` && init?.method === 'PATCH') return jsonResponse({ ...selectedDraft, version: selectedDraft.version + 1 })
    if (url === `/api/private/sales/drafts/${selectedDraft.id}`) return jsonResponse(selectedDraft)
    if (url === '/api/private/pos/products/variant-1') return jsonResponse(product)
    if (url === '/api/private/pos/products?search=Pipe&limit=20') return jsonResponse([product])
    if (url === '/api/private/pos/quote-line' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { variantId: string; baseQty?: string; quantity?: { components?: Record<string, string> } }
      if (body.quantity?.components) {
        return jsonResponse({ error: 'Conversion profile version was not found.' }, 400)
      }
      const qty = body.baseQty ?? '2'
      return jsonResponse({ variantId: body.variantId, baseQty: qty, pricingQty: qty, displayQty: qty, availableOwnBaseQty: '10', shortfallBaseQty: '0', automaticSalesTotalPaisa: String(Number(qty) * 10000), effectiveUnitSellingPricePaisa: '10000', sellingSegments: [], conversion: { baseQty: qty, pricingQty: qty, displayQty: qty, components: {}, snapshot: null } })
    }
    if (url === '/api/private/sales/drafts' && init?.method === 'POST') return jsonResponse({ ...draft, id: 'draft-2', version: 1 }, 201)
    return jsonResponse({ error: `Unexpected request: ${url}` }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPos() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(['auth', 'session'], { authenticated: true, userId: 'user-1', tenantId: 'tenant-1', role: 'STAFF', permissions: ['POS_VIEW', 'POS_SELL'], expiresAt: '2026-09-25T00:00:00Z' })
  render(<LanguageProvider><QueryClientProvider client={queryClient}><PosPage /></QueryClientProvider></LanguageProvider>)
  return queryClient
}

afterEach(() => vi.unstubAllGlobals())

describe('POS drafts', () => {
  it('warns on a new active profile version even when entered base quantity matches', async () => {
    const oldProfile = { id: 'profile-old', productId: 'product-1', type: 'COMPOUND' as const,
      version: 1, baseUnitId: 'unit-1', pricingUnitId: 'unit-1',
      pricingBaseFactorNumerator: '1', pricingBaseFactorDenominator: '1', displayPrecision: 0,
      components: [{ id: 'component-1', key: 'length', label: 'Length', unitId: 'unit-1',
        baseFactorNumerator: '1', baseFactorDenominator: '1', sortOrder: 0,
        minValue: '0', maxExclusive: null, allowFraction: false, autoNormalizeRemainder: false }],
    }
    const selectedDraft: SalesDraftDto = { ...draft, lines: [{ ...draft.lines[0]!,
      quantityInput: { kind: 'COMPONENTS', profileId: oldProfile.id, profileVersion: 1, components: { length: '2' } },
      normalizedQuantitySnapshot: { baseQty: '2', pricingQty: '2', displayQty: '2', components: { length: '2' }, snapshot: oldProfile },
    }] }
    const fetchMock = installFetch(selectedDraft)
    const originalFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/pos/quote-line' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        const profile = body.quantity?.profileVersion === 1 ? oldProfile : { ...oldProfile, version: 2 }
        return jsonResponse({ variantId: 'variant-1', baseQty: '2', pricingQty: '2', displayQty: '2',
          availableOwnBaseQty: '10', shortfallBaseQty: '0', automaticSalesTotalPaisa: '20000',
          effectiveUnitSellingPricePaisa: '10000', sellingSegments: [],
          conversion: { baseQty: '2', pricingQty: '2', displayQty: '2', components: { length: '2' }, snapshot: profile },
        })
      }
      return originalFetch(input, init)
    })
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    expect(await screen.findByText(/conversion profile changed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeDisabled()
  })
  it('reopens a fixed-unit Draft, warns on a changed ratio, and adopts the current rule explicitly', async () => {
    const fixedDraft: SalesDraftDto = {
      ...draft, lines: [{ ...draft.lines[0]!,
        quantityInput: { kind: 'FIXED_UNIT', unitId: 'unit-carton', quantity: '1' },
        normalizedQuantitySnapshot: { baseQty: '24', pricingQty: '24', displayQty: '1',
          components: {}, snapshot: null,
          fixedUnitSnapshot: { productId: 'product-1', unitId: 'unit-carton', unitName: 'Carton',
            unitSymbol: 'ctn', quantity: '1', conversionToBase: '24' },
        },
      }],
    }
    const fetchMock = installFetch(fixedDraft)
    const originalFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/pos/quote-line' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        const fixed = body.quantity?.kind === 'FIXED_UNIT'
        const qty = fixed ? Number(body.quantity.quantity) * 50 : Number(body.baseQty ?? 24)
        return jsonResponse({ variantId: 'variant-1', baseQty: String(qty), pricingQty: String(qty),
          displayQty: fixed ? body.quantity.quantity : String(qty), availableOwnBaseQty: '100',
          shortfallBaseQty: '0', automaticSalesTotalPaisa: String(qty * 10000),
          effectiveUnitSellingPricePaisa: '10000', sellingSegments: [],
          fixedUnitOptions: [{ unitId: 'unit-carton', unitName: 'Carton', unitSymbol: 'ctn', conversionToBase: '50' }],
          conversion: { baseQty: String(qty), pricingQty: String(qty), displayQty: fixed ? body.quantity.quantity : String(qty),
            components: {}, snapshot: null,
            fixedUnitSnapshot: fixed ? { productId: 'product-1', unitId: 'unit-carton', unitName: 'Carton',
              unitSymbol: 'ctn', quantity: body.quantity.quantity, conversionToBase: '50' } : null,
          },
        })
      }
      return originalFetch(input, init)
    })
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    expect(await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('24')
    expect(await screen.findByText(/fixed-unit conversion ratio changed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Use current unit ratio for Draft Pipe' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('50'))
    expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeEnabled()
  })
  it('loads a recent draft back into the existing POS editor with every payment line', async () => {
    const fetchMock = installFetch()
    renderPos()

    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    const draftButton = await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i })
    fireEvent.click(draftButton)

    expect(await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('2')
    expect(screen.getByRole('textbox', { name: 'Customer Name' })).toHaveValue('Ayesha')
    expect(screen.getByRole('textbox', { name: 'Payment amount 1' })).toHaveValue('25.00')
    expect(screen.getByRole('textbox', { name: 'Payment amount 2' })).toHaveValue('30.00')
    expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Draft Sales/i })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/private/sales/drafts/draft-1', expect.anything())
  })

  it('confirms archive before discarding a saved draft', async () => {
    const fetchMock = installFetch()
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Archive DRAFT-000001' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/private/sales/drafts/draft-1/archive', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Archive Draft' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/private/sales/drafts/draft-1/archive', expect.objectContaining({ method: 'POST' })))
  })

  it('detaches an archived open draft but keeps the cart; archiving another draft keeps the active one', async () => {
    const other = { ...draft, id: 'draft-other', draftNumber: 'DRAFT-000002' }
    const fetchMock = installFetch()
    const originalFetch = fetchMock.getMockImplementation()!
    let listed = [draft, other]
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/private/sales/drafts?')) return jsonResponse(listed)
      if (url.endsWith('/archive') && init?.method === 'POST') {
        const id = url.split('/').at(-2)
        listed = listed.filter((item) => item.id !== id)
        return jsonResponse({ ...draft, id, status: 'ARCHIVED' })
      }
      return originalFetch(input, init)
    })
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })
    fireEvent.click(screen.getByRole('button', { name: 'Archive DRAFT-000002' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive Draft' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Archive DRAFT-000002' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Update Draft' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Archive DRAFT-000001' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive Draft' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('2')
    fireEvent.click(screen.getByRole('button', { name: 'Complete Sale' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/private/sales', expect.objectContaining({ method: 'POST' })))
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/private/sales/drafts/draft-1/post')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/private/sales/drafts', expect.objectContaining({ method: 'POST' })))
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH')).toHaveLength(0)
  })

  it('refreshes Recent Drafts after a successful draft post', async () => {
    const fetchMock = installFetch()
    const originalFetch = fetchMock.getMockImplementation()!
    let posted = false
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/private/sales/drafts?')) return jsonResponse(posted ? [] : [draft])
      if (url === '/api/private/sales/drafts/draft-1/post' && init?.method === 'POST') {
        posted = true
        return jsonResponse({ id: 'sale-1', invoiceNumber: 'INV-000001', totalSalesPaisa: '20000', lines: [] })
      }
      return originalFetch(input, init)
    })
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Sale' }))
    await screen.findByText('Sale completed')
    await waitFor(() => expect(screen.getByText('No saved drafts.')).toBeInTheDocument())
  })

  it('updates a loaded draft with its exact saved line snapshot and current version', async () => {
    const fetchMock = installFetch()
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' }), { target: { value: '4' } })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('4'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Discount' }), { target: { value: '7.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Draft' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/private/sales/drafts/draft-1',
      expect.objectContaining({ method: 'PATCH' }),
    ))
    const request = fetchMock.mock.calls.find(([url, init]) =>
      url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH',
    )?.[1]
    expect(JSON.parse(String(request?.body))).toMatchObject({
      expectedVersion: 3,
      discountPaisa: '750',
      payments: draft.payments,
      lines: [expect.objectContaining({
        quantityInput: { kind: 'SIMPLE', baseQty: '4' },
        normalizedQuantitySnapshot: expect.objectContaining({ baseQty: '4' }),
        serialIds: draft.lines[0]?.serialIds,
        batchSelection: draft.lines[0]?.batchSelection,
        warrantySnapshot: draft.lines[0]?.warrantySnapshot,
        captureValues: draft.lines[0]?.captureValues,
      })],
    })
  })

  it('revalidates saved conversion components against the current Product profile on load', async () => {
    const savedLine = draft.lines[0]!
    const componentDraft: SalesDraftDto = {
      ...draft,
      lines: [{
        ...savedLine,
        quantityInput: {
          kind: 'COMPONENTS' as const,
          profileId: 'profile-old',
          profileVersion: 4,
          components: { length: '2' },
        },
        normalizedQuantitySnapshot: {
          ...savedLine.normalizedQuantitySnapshot,
          baseQty: '2',
          pricingQty: '1',
          components: { length: '2' },
          snapshot: {
            id: 'profile-old',
            productId: 'product-1',
            type: 'COMPOUND' as const,
            version: 4,
            baseUnitId: 'unit-1',
            pricingUnitId: 'unit-1',
            pricingBaseFactorNumerator: '2',
            pricingBaseFactorDenominator: '1',
            displayPrecision: 0,
            components: [],
          },
        },
      }],
    }
    const fetchMock = installFetch(componentDraft)
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))

    expect(await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('2')
    expect(await screen.findByText(/conversion profile version was not found/i)).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/private/pos/quote-line',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          variantId: 'variant-1',
          quantity: {
            kind: 'COMPONENTS',
            profileId: 'profile-old',
            profileVersion: 4,
            components: { length: '2' },
          },
        }),
      }),
    ))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/private/pos/quote-line',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ variantId: 'variant-1', baseQty: '2' }),
      }),
    )
  })

  it('keeps an unchanged saved draft at its version after a failed post, then saves edits', async () => {
    // PostgreSQL JSONB returns payment object keys in a different order from
    // the editor payload, even though the saved values are identical.
    const persistedDraft: SalesDraftDto = {
      ...draft,
      payments: draft.payments.map((payment) => ({
        note: payment.note,
        method: payment.method,
        accountId: payment.accountId,
        reference: payment.reference,
        amountPaisa: payment.amountPaisa,
        clientLineId: payment.clientLineId,
      })),
    }
    const fetchMock = installFetch(persistedDraft)
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })

    fireEvent.click(screen.getByRole('button', { name: 'Complete Sale' }))
    expect(await screen.findByText(/Insufficient stock/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url, init]) =>
      url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH',
    )).toBe(false)

    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' }), { target: { value: '4' } })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('4'))
    fireEvent.click(screen.getByRole('button', { name: 'Update Draft' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/private/sales/drafts/draft-1',
      expect.objectContaining({ method: 'PATCH' }),
    ))
    const patch = fetchMock.mock.calls.find(([url, init]) =>
      url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH',
    )?.[1]
    expect(JSON.parse(String(patch?.body))).toMatchObject({ expectedVersion: 3 })
  })

  it('uses the updated draft version for edits after posting fails', async () => {
    const fetchMock = installFetch()
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Discount' }), { target: { value: '7.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Sale' }))
    expect(await screen.findByText(/Insufficient stock/i)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' }), { target: { value: '4' } })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('4'))
    fireEvent.click(screen.getByRole('button', { name: 'Update Draft' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) =>
      url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH',
    )).toHaveLength(2))
    const patches = fetchMock.mock.calls.filter(([url, init]) =>
      url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH',
    )
    expect(JSON.parse(String(patches[0]?.[1]?.body))).toMatchObject({ expectedVersion: 3 })
    expect(JSON.parse(String(patches[1]?.[1]?.body))).toMatchObject({ expectedVersion: 4 })
  })

  it('warns when the current profile changes quantity while the saved profile is still available', async () => {
    const oldProfile = {
      id: 'profile-pipe', productId: 'product-1', type: 'COMPOUND' as const,
      version: 4, baseUnitId: 'unit-1', pricingUnitId: 'unit-1',
      pricingBaseFactorNumerator: '1', pricingBaseFactorDenominator: '1',
      displayPrecision: 0, components: [{
        id: 'length-1', key: 'length', label: 'Length', unitId: 'unit-1',
        baseFactorNumerator: '1', baseFactorDenominator: '1', sortOrder: 0,
        minValue: '0', maxExclusive: null, allowFraction: false,
        autoNormalizeRemainder: false,
      }],
    }
    const selectedDraft: SalesDraftDto = {
      ...draft,
      lines: [{
        ...draft.lines[0]!,
        quantityInput: { kind: 'COMPONENTS', profileId: oldProfile.id, profileVersion: 4, components: { length: '2' } },
        normalizedQuantitySnapshot: { baseQty: '2', pricingQty: '2', displayQty: '2', components: { length: '2' }, snapshot: oldProfile },
      }],
    }
    const fetchMock = installFetch(selectedDraft)
    const originalFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/pos/quote-line' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { baseQty?: string; quantity?: { profileVersion: number; components: { length: string } } }
        const activeProfile = {
          ...oldProfile,
          version: 5,
          components: [{ ...oldProfile.components[0]!, baseFactorNumerator: '2' }],
        }
        const baseQty = body.quantity?.profileVersion === 5
          ? String(Number(body.quantity.components.length) * 2)
          : body.baseQty ?? '2'
        const snapshot = body.quantity?.profileVersion === 4 ? oldProfile : activeProfile
        return jsonResponse({
          variantId: 'variant-1', baseQty, pricingQty: baseQty, displayQty: baseQty,
          availableOwnBaseQty: '10', shortfallBaseQty: '0',
          automaticSalesTotalPaisa: String(Number(baseQty) * 10000),
          effectiveUnitSellingPricePaisa: '10000', sellingSegments: [],
          conversion: { baseQty, pricingQty: baseQty, displayQty: baseQty, components: body.quantity?.components ?? { length: '2' }, snapshot },
        })
      }
      return originalFetch(input, init)
    })
    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))

    expect(await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('2')
    expect(await screen.findByText(/conversion profile changed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/private/pos/quote-line',
      expect.objectContaining({ body: JSON.stringify({
        variantId: 'variant-1', quantity: {
          kind: 'COMPONENTS', profileId: 'profile-pipe', profileVersion: 5,
          components: { length: '2' },
        },
      }) }),
    )
    expect(screen.getByRole('button', { name: /Use current conversion profile for Draft Pipe/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Use current conversion profile for Draft Pipe/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeEnabled())
    fireEvent.change(screen.getByRole('textbox', { name: 'Length for Draft Pipe' }), { target: { value: '3' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/private/pos/quote-line',
      expect.objectContaining({ body: JSON.stringify({
        variantId: 'variant-1', quantity: {
          kind: 'COMPONENTS', profileId: 'profile-pipe', profileVersion: 5,
          components: { length: '3' },
        },
      }) }),
    ))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('6'))
    fireEvent.click(screen.getByRole('button', { name: 'Update Draft' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/private/sales/drafts/draft-1', expect.objectContaining({ method: 'PATCH' })))
    const patch = fetchMock.mock.calls.find(([url, init]) => url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH')?.[1]
    expect(JSON.parse(String(patch?.body)).lines[0]).toMatchObject({
      quantityInput: { kind: 'COMPONENTS', profileVersion: 5, components: { length: '3' } },
      normalizedQuantitySnapshot: { baseQty: '6' },
    })
  })

  it.each([
    { caseName: 'removed component', newKey: null },
    { caseName: 'renamed component', newKey: 'coil' },
  ])('adopts current profile with a $caseName and sends only current keys through post', async ({ newKey }) => {
    const component = (key: string, sortOrder: number) => ({
      id: `${key}-1`, key, label: key[0]!.toUpperCase() + key.slice(1),
      unitId: 'unit-1', baseFactorNumerator: '1', baseFactorDenominator: '1',
      sortOrder, minValue: '0', maxExclusive: null, allowFraction: false,
      autoNormalizeRemainder: false,
    })
    const oldProfile = {
      id: 'profile-pipe', productId: 'product-1', type: 'COMPOUND' as const,
      version: 4, baseUnitId: 'unit-1', pricingUnitId: 'unit-1',
      pricingBaseFactorNumerator: '1', pricingBaseFactorDenominator: '1',
      displayPrecision: 0, components: [component('gauge', 0), component('gira', 1)],
    }
    const activeProfile = {
      ...oldProfile, version: 5,
      components: newKey ? [component('gauge', 0), component(newKey, 1)] : [component('gauge', 0)],
    }
    const selectedDraft: SalesDraftDto = {
      ...draft,
      lines: [{
        ...draft.lines[0]!,
        quantityInput: { kind: 'COMPONENTS', profileId: oldProfile.id, profileVersion: 4, components: { gauge: '2', gira: '3' } },
        normalizedQuantitySnapshot: { baseQty: '5', pricingQty: '5', displayQty: '5', components: { gauge: '2', gira: '3' }, snapshot: oldProfile },
      }],
    }
    let persistedDraft = selectedDraft
    const fetchMock = installFetch(selectedDraft)
    const originalFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/pos/quote-line' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          variantId: string
          baseQty?: string
          quantity?: { profileVersion: number; components: Record<string, string> }
        }
        if (body.quantity?.profileVersion === 4) return jsonResponse({ error: 'Conversion profile version was not found.' }, 400)
        const values = body.quantity?.components ?? { gauge: body.baseQty ?? '5', ...(newKey ? { [newKey]: '0' } : {}) }
        if (Object.keys(values).some((key) => !activeProfile.components.some((item) => item.key === key))) {
          return jsonResponse({ error: 'Unknown conversion component: gira' }, 400)
        }
        const baseQty = body.quantity ? String(Object.values(values).reduce((sum, value) => sum + Number(value), 0)) : body.baseQty ?? '5'
        return jsonResponse({
          variantId: body.variantId, baseQty, pricingQty: baseQty, displayQty: baseQty,
          availableOwnBaseQty: '10', shortfallBaseQty: '0',
          automaticSalesTotalPaisa: String(Number(baseQty) * 10000),
          effectiveUnitSellingPricePaisa: '10000', sellingSegments: [],
          conversion: { baseQty, pricingQty: baseQty, displayQty: baseQty, components: values, snapshot: activeProfile },
        })
      }
      if (url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH') {
        const { expectedVersion, ...state } = JSON.parse(String(init.body)) as { expectedVersion: number } & SalesDraftDto
        persistedDraft = { ...persistedDraft, ...state, version: expectedVersion + 1 }
        return jsonResponse(persistedDraft)
      }
      if (url === '/api/private/sales/drafts/draft-1') return jsonResponse(persistedDraft)
      if (url === '/api/private/sales/drafts/draft-1/post' && init?.method === 'POST') {
        return jsonResponse({ id: 'sale-1', invoiceNumber: 'INV-000001', totalSalesPaisa: '27000', lines: [] })
      }
      return originalFetch(input, init)
    })

    renderPos()
    fireEvent.click(screen.getByRole('button', { name: /Recent Drafts/i }))
    fireEvent.click(await screen.findByRole('button', { name: /DRAFT-000001.*Ayesha/i }))
    expect(await screen.findByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('5')
    expect(await screen.findByText(/Conversion profile version was not found/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Use current conversion profile for Draft Pipe/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Gauge for Draft Pipe' })).toHaveValue('2'))
    expect(screen.queryByRole('textbox', { name: 'Gira for Draft Pipe' })).not.toBeInTheDocument()
    if (newKey) expect(screen.getByRole('textbox', { name: 'Coil for Draft Pipe' })).toHaveValue('0')
    fireEvent.change(screen.getByRole('textbox', { name: 'Gauge for Draft Pipe' }), { target: { value: '3' } })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity for Draft Pipe' })).toHaveValue('3'))
    expect(screen.getByRole('button', { name: 'Complete Sale' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Update Draft' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/private/sales/drafts/draft-1', expect.objectContaining({ method: 'PATCH' })))
    const patch = fetchMock.mock.calls.find(([url, init]) => url === '/api/private/sales/drafts/draft-1' && init?.method === 'PATCH')?.[1]
    const savedLine = JSON.parse(String(patch?.body)).lines[0]
    expect(savedLine.quantityInput.components).toEqual({ gauge: '3', ...(newKey ? { [newKey]: '0' } : {}) })
    expect(savedLine).toMatchObject({
      quantityInput: { kind: 'COMPONENTS', profileVersion: 5 },
      normalizedQuantitySnapshot: { baseQty: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Sale' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/private/sales/drafts/draft-1/post', expect.objectContaining({ method: 'POST' })))
    expect(await screen.findByText('Sale completed')).toBeInTheDocument()
  })
})
