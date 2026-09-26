import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/language'
import { PosPage } from './pos-page'
import { TemplatePicker } from './components/template-picker'

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

function renderPicker(cartHasLines: boolean) {
  const onLoad = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <TemplatePicker
        canManage
        cartHasLines={cartHasLines}
        currentLines={[]}
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
