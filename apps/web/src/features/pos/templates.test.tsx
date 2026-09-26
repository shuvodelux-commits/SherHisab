import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/language'
import { PosPage } from './pos-page'
import { TemplatePicker } from './components/template-picker'
import type { SalesTemplateLineInputDto } from './pos-types'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const saved = {
  id: 'template-1', name: 'Bathroom package', version: 1,
  lineCount: 1, createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
}
const loaded = {
  id: saved.id, name: saved.name, version: 1,
  lines: [{
    variantId: 'variant-1',
    quantityInput: { kind: 'SIMPLE', baseQty: '2' },
    normalizedQuantitySnapshot: {
      baseQty: '2', pricingQty: '2', displayQty: '2',
      components: {}, snapshot: null,
    },
    pricingStrategy: 'CURRENT_AUTO',
    manualUnitSellingPricePaisa: null,
    product: { variantId: 'variant-1', productId: 'product-1',
      productName: 'Pipe', variantName: null, sku: null,
      primaryBarcode: null, brand: '', categoryName: null,
      unitId: 'unit-1', unitName: 'Piece', unitSymbol: 'pcs',
      currentSellingPricePaisa: '2000', availableOwnBaseQty: '8',
      trackingMode: 'SIMPLE', allocationPolicy: 'FIFO',
      variantsEnabled: false },
    quote: { variantId: 'variant-1', baseQty: '2', pricingQty: '2',
      displayQty: '2', availableOwnBaseQty: '8', shortfallBaseQty: '0',
      automaticSalesTotalPaisa: '4000',
      effectiveUnitSellingPricePaisa: '2000', sellingSegments: [],
      conversion: { baseQty: '2', pricingQty: '2', displayQty: '2',
        components: {}, snapshot: null }, fixedUnitOptions: [] },
  }],
}

function renderPicker(
  cartHasLines: boolean,
  canView = true,
  canOverrideSellingPrice = false,
  currentLines: SalesTemplateLineInputDto[] = [],
) {
  const onLoad = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <TemplatePicker
        canView={canView}
        canManage
        canOverrideSellingPrice={canOverrideSellingPrice}
        cartHasLines={cartHasLines}
        currentLines={currentLines}
        onLoad={onLoad}
      />
    </QueryClientProvider>,
  )
  return onLoad
}

afterEach(() => vi.unstubAllGlobals())

describe('TemplatePicker', () => {
  it('asks before replacing a nonempty cart and loads a fresh template', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/sales/templates') return jsonResponse([saved])
      if (url === '/api/private/sales/templates/template-1') {
        return jsonResponse(loaded)
      }
      return jsonResponse({ error: `Unexpected request: ${url}` }, 404)
    }))
    const onLoad = renderPicker(true)
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Bathroom package · 1 items' }))
    expect(onLoad).not.toHaveBeenCalled()
    expect(screen.getByText(/replace.*cart/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load Template' }))
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(loaded))
  })

  it('clears checkout identity and payments when loading a Template into POS', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/pos/bootstrap') {
        return jsonResponse({
          capabilities: { canSell: true, canOverrideSellingPrice: false,
            canViewConfiguredPurchasePrice: false, canBackdate: false },
          settings: { showPurchasePrice: false, requireCashSession: false,
            invoiceShareEnabled: false },
          financialAccounts: [], activeCashSession: null,
          recent: { drafts: [], templates: [] },
        })
      }
      if (url === '/api/private/sales/templates') return jsonResponse([saved])
      if (url === '/api/private/sales/templates/template-1') {
        return jsonResponse(loaded)
      }
      return jsonResponse({ error: `Unexpected request: ${url}` }, 404)
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(['auth', 'session'], {
      authenticated: true, userId: 'user-1', tenantId: 'tenant-1',
      role: 'STAFF', permissions: [
        'POS_VIEW', 'POS_SELL', 'SALES_TEMPLATE_VIEW', 'SALES_TEMPLATE_MANAGE',
      ], expiresAt: '2026-09-26T00:00:00Z',
    })
    render(
      <LanguageProvider>
        <QueryClientProvider client={queryClient}><PosPage /></QueryClientProvider>
      </LanguageProvider>,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Customer Name' }), {
      target: { value: 'Old customer' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Payment amount 1' }), {
      target: { value: '12.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Bathroom package · 1 items',
    }))
    await screen.findByText('Loaded Bathroom package into a new cart')
    expect(screen.getByRole('textbox', { name: 'Customer Name' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Payment amount 1' })).toHaveValue('')
    expect(screen.getByText('Pipe')).toBeInTheDocument()
  })

  it('shows management without offering cart load to a manager-only user', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/sales/templates') return jsonResponse([saved])
      return jsonResponse({ error: 'Unexpected request' }, 404)
    }))
    renderPicker(false, false)
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    expect(await screen.findByRole('button', {
      name: 'Manage Bathroom package',
    })).toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: 'Bathroom package · 1 items',
    })).not.toBeInTheDocument()
  })

  it('edits fixed manual price in taka and submits exact paisa', async () => {
    let updateBody: unknown = null
    const editable = {
      ...loaded, status: 'ACTIVE', createdByUserId: 'user-1',
      createdAt: saved.createdAt, updatedAt: saved.updatedAt,
      lines: loaded.lines.map((line) => ({
        ...line, pricingStrategy: 'FIXED_MANUAL',
        manualUnitSellingPricePaisa: '1800',
      })),
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/sales/templates') return jsonResponse([saved])
      if (url === '/api/private/sales/templates/template-1/edit') {
        return jsonResponse(editable)
      }
      if (url === '/api/private/sales/templates/template-1' &&
          init?.method === 'PATCH') {
        updateBody = JSON.parse(String(init.body))
        return jsonResponse({ ...editable, version: 2 })
      }
      return jsonResponse({ error: `Unexpected request: ${url}` }, 404)
    }))
    renderPicker(false, true, true)
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Manage Bathroom package',
    }))
    const input = await screen.findByRole('textbox', { name: 'Fixed price (৳) 1' })
    expect(input).toHaveValue('18.00')
    fireEvent.change(input, { target: { value: '19.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateBody).toMatchObject({
      expectedVersion: 1,
      lines: [{ pricingStrategy: 'FIXED_MANUAL',
        manualUnitSellingPricePaisa: '1950' }],
    }))
  })

  it('saves only Product and quantity defaults from the current cart', async () => {
    let createBody: unknown = null
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/sales/templates' && init?.method === 'POST') {
        createBody = JSON.parse(String(init.body))
        return jsonResponse({ ...saved, status: 'ACTIVE',
          createdByUserId: 'user-1', lines: [] }, 201)
      }
      if (url === '/api/private/sales/templates') return jsonResponse([])
      return jsonResponse({ error: `Unexpected request: ${url}` }, 404)
    }))
    renderPicker(true, true, false, [{
      variantId: 'variant-1', productName: 'Pipe',
      quantityInput: { kind: 'SIMPLE', baseQty: '2' },
      pricingStrategy: 'CURRENT_AUTO',
      manualUnitSellingPricePaisa: '1800',
    }])
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Cart as Template' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Template name' }), {
      target: { value: 'Pipe package' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Template' }))
    await waitFor(() => expect(createBody).toEqual({
      name: 'Pipe package',
      lines: [{
        variantId: 'variant-1',
        quantityInput: { kind: 'SIMPLE', baseQty: '2' },
        pricingStrategy: 'CURRENT_AUTO',
      }],
    }))
  })

  it('renames an inactive Product Template without resubmitting its lines', async () => {
    let updateBody: unknown = null
    const editable = {
      ...loaded, status: 'ACTIVE', createdByUserId: 'user-1',
      createdAt: saved.createdAt, updatedAt: saved.updatedAt,
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/sales/templates' && !init?.method) {
        return jsonResponse([saved])
      }
      if (url === '/api/private/sales/templates/template-1/edit') {
        return jsonResponse(editable)
      }
      if (url === '/api/private/sales/templates/template-1' &&
          init?.method === 'PATCH') {
        updateBody = JSON.parse(String(init.body))
        return jsonResponse({ ...editable, version: 2 })
      }
      return jsonResponse({ error: `Unexpected request: ${url}` }, 404)
    }))
    renderPicker(false)
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Manage Bathroom package',
    }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Template name' }), {
      target: { value: 'Renamed package' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateBody).toEqual({
      expectedVersion: 1, name: 'Renamed package',
    }))
  })

  it('loads without a warning when the cart is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === '/api/private/sales/templates') return jsonResponse([saved])
      if (url === '/api/private/sales/templates/template-1') {
        return jsonResponse(loaded)
      }
      return jsonResponse({ error: 'Unexpected request' }, 404)
    }))
    const onLoad = renderPicker(false)
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Bathroom package · 1 items' }))
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(loaded))
    expect(screen.queryByText(/replace.*cart/i)).not.toBeInTheDocument()
  })
})
