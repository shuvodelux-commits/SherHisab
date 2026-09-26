import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/language'
import { ProductFormDialog } from './product-form-dialog'
import { buildAdvancedPayload, emptyAdvancedFormState } from './product-advanced-fields'
import type { ProductDetailDto } from './product-types'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const activeCategory = { id: 'category-active', name: 'Hardware', isActive: true }
const archivedCategory = { id: 'category-archived', name: 'Old Category', isActive: false }
const activeUnit = { id: 'unit-active', name: 'Piece', symbol: 'pcs', isActive: true }
const activeGiraUnit = { id: 'unit-gira', name: 'Gira', symbol: 'gira', isActive: true }
const activeGaugeUnit = { id: 'unit-gauge', name: 'Gauge', symbol: 'gauge', isActive: true }
const activeCartonUnit = { id: 'unit-carton', name: 'Carton', symbol: 'ctn', isActive: true }
const activeBagUnit = { id: 'unit-bag', name: 'Bag', symbol: 'bag', isActive: true }
const archivedUnit = { id: 'unit-archived', name: 'Old Unit', symbol: 'old', isActive: false }

function createdProduct(): ProductDetailDto {
  return {
    id: 'product-1',
    name: 'Hammer',
    brand: 'Classic',
    category: activeCategory,
    baseUnit: activeUnit,
    defaultVariantId: 'variant-1',
    variantCount: 1,
    defaultPurchasePricePaisa: '1250',
    defaultSellingPricePaisa: '1875',
    currentSellingPricePaisa: '1875',
    stockBaseQty: '2.5',
    stockValuePaisa: '3125',
    minimumStockBaseQty: '0.125',
    trackingMode: 'SIMPLE',
    allocationPolicy: 'FIFO',
    variantsEnabled: false,
    isActive: true,
    primaryBarcode: '123456',
    advanced: { alternativeUnits: [], specifications: [], variants: [] },
  }
}

function conversionProduct(): ProductDetailDto {
  return {
    ...createdProduct(),
    id: 'product-conversion-edit',
    name: 'Existing Fabric',
    baseUnit: activeGiraUnit,
    advanced: {
      alternativeUnits: [],
      specifications: [],
      variants: [],
      conversionProfile: {
        id: 'conversion-profile-1',
        productId: 'product-conversion-edit',
        type: 'COMPOUND',
        version: 3,
        baseUnitId: 'unit-gira',
        pricingUnitId: 'unit-gauge',
        pricingBaseFactorNumerator: '16',
        pricingBaseFactorDenominator: '1',
        displayPrecision: 2,
        components: [
          {
            id: 'conversion-component-gauge',
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
            id: 'conversion-component-gira',
            key: 'gira',
            label: 'Gira',
            unitId: 'unit-gira',
            baseFactorNumerator: '1',
            baseFactorDenominator: '1',
            sortOrder: 1,
            minValue: '0',
            maxExclusive: '16',
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
        ],
      },
    },
  }
}

function trackingProduct(): ProductDetailDto {
  return {
    ...createdProduct(),
    id: 'product-tracking-edit',
    name: 'Existing Medicine',
    trackingMode: 'BATCH_EXPIRY',
    allocationPolicy: 'FEFO',
    advanced: {
      alternativeUnits: [],
      specifications: [],
      variants: [],
      warrantyPolicy: {
        id: 'warranty-policy-1',
        productId: 'product-tracking-edit',
        enabled: true,
        durationValue: 12,
        durationUnit: 'MONTH',
        provider: 'Manufacturer',
        text: 'Original warranty',
      },
      captureFields: [
        {
          id: 'capture-field-1',
          key: 'dosage_form',
          label: 'Dosage Form',
          type: 'select',
          selectOptions: ['Tablet', 'Syrup'],
          required: true,
          sortOrder: 0,
        },
      ],
    },
  }
}

function archivedProduct(): ProductDetailDto {
  return {
    ...createdProduct(),
    id: 'product-archived-master',
    name: 'Legacy Hammer',
    category: archivedCategory,
    baseUnit: archivedUnit,
    stockBaseQty: '7.25',
  }
}

function installFetch(options: { productError?: string } = {}) {
  const unitList = [activeUnit, activeGiraUnit, activeGaugeUnit, activeCartonUnit, activeBagUnit, archivedUnit]
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    if (url.startsWith('/api/private/product-categories')) {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 'category-new', name: 'Electrical', isActive: true },
          201,
        )
      }
      return jsonResponse([activeCategory, archivedCategory])
    }

    if (url.startsWith('/api/private/units')) {
      if (url === '/api/private/units/unit-gauge' && init?.method === 'PATCH') {
        const updated = { ...activeGaugeUnit, name: 'Gaz' }
        unitList.splice(unitList.findIndex((item) => item.id === updated.id), 1, updated)
        return jsonResponse(updated)
      }
      if (init?.method === 'POST') {
        const created = { id: 'unit-new', name: 'Box', symbol: 'box', isActive: true }
        unitList.push(created)
        return jsonResponse(created, 201)
      }
      return jsonResponse(unitList)
    }

    if (url === '/api/private/products' && init?.method === 'POST') {
      if (options.productError) {
        return jsonResponse({ error: options.productError }, 409)
      }
      return jsonResponse(createdProduct(), 201)
    }

    if (
      url === '/api/private/products/product-conversion-edit' &&
      init?.method === 'PATCH'
    ) {
      return jsonResponse(conversionProduct())
    }

    if (
      url === '/api/private/products/product-tracking-edit' &&
      init?.method === 'PATCH'
    ) {
      return jsonResponse(trackingProduct())
    }

    if (
      url === '/api/private/products/product-archived-master' &&
      init?.method === 'PATCH'
    ) {
      return jsonResponse(archivedProduct())
    }

    return jsonResponse({ error: 'Unexpected test request.' }, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderForm(options: {
  mode?: 'create' | 'edit'
  product?: ProductDetailDto
  languageMode?: 'en-bn' | 'en' | 'bn'
  onOpenChange?: (open: boolean) => void
} = {}) {
  window.localStorage.setItem(
    'sherhisab-language-mode',
    options.languageMode ?? 'en-bn',
  )

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const onOpenChange = options.onOpenChange ?? vi.fn<(open: boolean) => void>()

  render(
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ProductFormDialog
          mode={options.mode ?? 'create'}
          onOpenChange={onOpenChange}
          open
          product={options.product}
        />
      </QueryClientProvider>
    </LanguageProvider>,
  )

  return { invalidateSpy, onOpenChange }
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('ProductFormDialog', () => {
  it('uses distinct component keys for Bengali unit names', () => {
    const state = {
      ...emptyAdvancedFormState('SIMPLE'),
      conversionEnabled: true,
      conversionGuidedUnitId: 'unit-boro',
      conversionGuidedRatio: '16',
    }
    const units = [
      { id: 'unit-boro', name: 'গজ', symbol: 'গজ', isActive: true },
      { id: 'unit-choto', name: 'গিরা', symbol: 'গিরা', isActive: true },
    ]
    const profile = buildAdvancedPayload(state, 'unit-choto', units).conversionProfile
    expect(profile?.components.map((component) => component.key)).toEqual(['larger', 'base'])
  })
  it('reopens a two-unit profile in the simple ratio editor', async () => {
    installFetch()
    renderForm({ mode: 'edit', product: conversionProduct() })
    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))
    expect(screen.getByRole('combobox', { name: 'Larger unit' })).toHaveTextContent('Gauge')
    expect(screen.getByLabelText('Units per larger unit')).toHaveValue('16')
    expect(screen.queryByLabelText('Conversion component key 1')).not.toBeInTheDocument()
  })
  it('keeps advanced help compact and groups alternative-unit controls', async () => {
    installFetch()
    renderForm()
    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))

    expect(screen.queryByText(/For example, 1 carton = 24 pieces/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'About Alternative Units' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add alternative unit' })).toHaveTextContent('Add alternative')

    fireEvent.click(screen.getByRole('button', { name: 'Add alternative unit' }))
    const unitSelector = screen.getByRole('combobox', { name: 'Alternative unit 1' })
    expect(unitSelector.closest('.product-alternative-row')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Unit for alternative 1' })).toBeInTheDocument()
  })
  // Two Radix selectors can exceed the suite's default timeout under parallel jsdom load.
  it('saves carton and bag as separate fixed alternatives', async () => {
    const fetchMock = installFetch()
    renderForm()
    fireEvent.change(await screen.findByLabelText('Product Name'), { target: { value: 'Rice' } })
    fireEvent.change(screen.getByLabelText('Purchase Price'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Selling Price'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unit' }))
    fireEvent.click(await screen.findByRole('option', { name: /Piece/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add alternative unit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add alternative unit' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Alternative unit 1' }))
    fireEvent.click(await screen.findByRole('option', { name: /Carton/ }))
    fireEvent.change(screen.getByLabelText('Conversion to base 1'), { target: { value: '24' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Alternative unit 2' }))
    fireEvent.click(await screen.findByRole('option', { name: /Bag/ }))
    fireEvent.change(screen.getByLabelText('Conversion to base 2'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input, init]) => input === '/api/private/products' && init?.method === 'POST')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body)).advanced.alternativeUnits).toEqual([
        { unitId: 'unit-carton', conversionMode: 'FIXED', conversionToBase: '24' },
        { unitId: 'unit-bag', conversionMode: 'FIXED', conversionToBase: '50' },
      ])
    })
  }, 10000)
  it('configures mixed Gauge and Gira with one everyday ratio', async () => {
    const fetchMock = installFetch()
    renderForm()
    fireEvent.change(await screen.findByLabelText('Product Name'), { target: { value: 'Fabric' } })
    fireEvent.change(screen.getByLabelText('Purchase Price'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Selling Price'), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unit' }))
    fireEvent.click(await screen.findByRole('option', { name: /Gira/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable custom quantity conversion' }))
    expect(screen.queryByLabelText('Conversion component key 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Larger unit' }))
    fireEvent.click(await screen.findByRole('option', { name: /Gauge/ }))
    fireEvent.change(screen.getByLabelText('Units per larger unit'), { target: { value: '16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input, init]) => input === '/api/private/products' && init?.method === 'POST')
      expect(call).toBeDefined()
      const body = JSON.parse(String(call?.[1]?.body))
      expect(body.advanced.conversionProfile).toMatchObject({
        type: 'COMPOUND', baseUnitId: 'unit-gira', pricingUnitId: 'unit-gauge',
        pricingBaseFactorNumerator: '16', pricingBaseFactorDenominator: '1',
        components: [
          expect.objectContaining({ unitId: 'unit-gauge', baseFactorNumerator: '16' }),
          expect.objectContaining({ unitId: 'unit-gira', baseFactorNumerator: '1', maxExclusive: '16' }),
        ],
      })
    })
  })

  it('adds a shared unit inside conversion setup without losing the Product form', async () => {
    const fetchMock = installFetch()
    renderForm()
    fireEvent.change(await screen.findByLabelText('Product Name'), { target: { value: 'Fabric Roll' } })
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable custom quantity conversion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Unit for conversion' }))
    fireEvent.change(screen.getByLabelText('New unit name'), { target: { value: 'Box' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create unit' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Unit' })).not.toBeInTheDocument())
    expect(screen.getByText(/1 Box =/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Larger unit' })).toHaveTextContent('Box'))
    expect(screen.getByLabelText('Product Name')).toHaveValue('Fabric Roll')
    expect(fetchMock.mock.calls.some(([input, init]) => input === '/api/private/units' && init?.method === 'POST')).toBe(true)
  })
  it('explains a shared Unit edit and retains the Product conversion ratio', async () => {
    const fetchMock = installFetch()
    renderForm()
    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable custom quantity conversion' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Larger unit' }))
    fireEvent.click(await screen.findByRole('option', { name: /Gauge/ }))
    fireEvent.change(screen.getByLabelText('Units per larger unit'), { target: { value: '16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit selected Unit' }))
    expect(screen.getByText(/shared Unit name and symbol change everywhere/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('New unit name'), { target: { value: 'Gaz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save unit' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Larger unit' })).toHaveTextContent('Gaz'))
    expect(screen.getByLabelText('Units per larger unit')).toHaveValue('16')
    expect(fetchMock.mock.calls.some(([input, init]) => input === '/api/private/units/unit-gauge' && init?.method === 'PATCH')).toBe(true)
  })
  it('renders the exact compact create fields with bilingual helpers', async () => {
    installFetch()
    renderForm()

    expect(
      await screen.findByRole('dialog', { name: 'Add Product' }),
    ).toBeInTheDocument()

    const fields = [
      ['Product Name', 'পণ্যের নাম'],
      ['Brand', 'ব্র্যান্ড'],
      ['Category', 'ধরন'],
      ['Unit', 'একক'],
      ['Barcode', 'বারকোড'],
      ['Purchase Price', 'কেনা দাম'],
      ['Selling Price', 'বিক্রির দাম'],
      ['Opening Stock', 'শুরুর স্টক'],
      ['Minimum Stock', 'ন্যূনতম স্টক'],
    ] as const

    for (const [english, bangla] of fields) {
      expect(screen.getByText(english)).toBeInTheDocument()
      expect(screen.getByText(bangla)).toBeInTheDocument()
    }

    expect(screen.getByLabelText('Opening Stock')).toBeEnabled()
    expect(screen.queryByText('Current Stock')).not.toBeInTheDocument()

    expect(screen.queryByRole('separator')).not.toBeInTheDocument()

    const advanced = screen.getByRole('button', { name: 'Advanced' })
    expect(advanced).toHaveAttribute('aria-expanded', 'false')
    expect(advanced).toHaveClass('ui-button-outline')
    expect(advanced).toHaveClass('ui-button-sm')
    expect(screen.queryByText('Tracking')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Category' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unit' })).toBeInTheDocument()
  })

  // This full form interaction is slower when the Web suite runs files concurrently.
  it('configures a generic exact quantity conversion profile from Advanced', async () => {
    const fetchMock = installFetch()
    renderForm()

    fireEvent.change(await screen.findByLabelText('Product Name'), {
      target: { value: 'Muslin Fabric Black' },
    })
    fireEvent.change(screen.getByLabelText('Purchase Price'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('Selling Price'), {
      target: { value: '300' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Unit' }))
    fireEvent.click(await screen.findByRole('option', { name: /Gira/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))

    expect(screen.getByText('Quantity Conversion')).toBeInTheDocument()
    expect(screen.getByText('পরিমাণ রূপান্তর')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Enable custom quantity conversion',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Advanced conversion settings' }))

    fireEvent.click(
      screen.getByRole('combobox', { name: 'Conversion profile type' }),
    )
    fireEvent.click(await screen.findByRole('option', { name: 'Compound' }))

    fireEvent.click(
      screen.getByRole('combobox', { name: 'Pricing unit' }),
    )
    fireEvent.click(await screen.findByRole('option', { name: /Gauge/ }))

    fireEvent.change(screen.getByLabelText('Pricing factor numerator'), {
      target: { value: '16' },
    })
    fireEvent.change(screen.getByLabelText('Pricing factor denominator'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Conversion display precision'), {
      target: { value: '2' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Add Conversion Component' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Conversion Component' }),
    )

    fireEvent.change(screen.getByLabelText('Conversion component key 1'), {
      target: { value: 'gauge' },
    })
    fireEvent.change(screen.getByLabelText('Conversion component label 1'), {
      target: { value: 'Gauge' },
    })
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Conversion component unit 1' }),
    )
    fireEvent.click(await screen.findByRole('option', { name: /Gauge/ }))
    fireEvent.change(
      screen.getByLabelText('Conversion component numerator 1'),
      { target: { value: '16' } },
    )
    fireEvent.change(
      screen.getByLabelText('Conversion component denominator 1'),
      { target: { value: '1' } },
    )

    fireEvent.change(screen.getByLabelText('Conversion component key 2'), {
      target: { value: 'gira' },
    })
    fireEvent.change(screen.getByLabelText('Conversion component label 2'), {
      target: { value: 'Gira' },
    })
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Conversion component unit 2' }),
    )
    fireEvent.click(await screen.findByRole('option', { name: /Gira/ }))
    fireEvent.change(
      screen.getByLabelText('Conversion component numerator 2'),
      { target: { value: '1' } },
    )
    fireEvent.change(
      screen.getByLabelText('Conversion component denominator 2'),
      { target: { value: '1' } },
    )
    fireEvent.change(
      screen.getByLabelText('Conversion component max exclusive 2'),
      { target: { value: '16' } },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          input === '/api/private/products' && init?.method === 'POST',
      )
      expect(createCall).toBeDefined()
      const body = JSON.parse(String(createCall?.[1]?.body))

      expect(body.baseUnitId).toBe('unit-gira')
      expect(body.advanced.conversionProfile).toEqual({
        type: 'COMPOUND',
        baseUnitId: 'unit-gira',
        pricingUnitId: 'unit-gauge',
        pricingBaseFactorNumerator: '16',
        pricingBaseFactorDenominator: '1',
        displayPrecision: 2,
        components: [
          {
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
            key: 'gira',
            label: 'Gira',
            unitId: 'unit-gira',
            baseFactorNumerator: '1',
            baseFactorDenominator: '1',
            sortOrder: 1,
            minValue: '0',
            maxExclusive: '16',
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
        ],
      })
    })
  }, 15_000)

  it('forces generic opening stock to zero when variants are enabled', async () => {
    installFetch()
    renderForm()

    fireEvent.change(await screen.findByLabelText('Opening Stock'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByLabelText('Tracking').tagName).not.toBe('SELECT')
    expect(screen.getByLabelText('Tracking')).toHaveAttribute(
      'data-slot',
      'select-trigger',
    )
    const variantsCheckbox = screen.getByRole('checkbox', { name: 'Enable Variants' })
    expect(variantsCheckbox).toHaveAttribute('data-slot', 'checkbox')
    fireEvent.click(variantsCheckbox)

    expect(screen.getByLabelText('Opening Stock')).toBeDisabled()
    expect(screen.getByLabelText('Opening Stock')).toHaveValue('0')
    expect(
      screen.getByText('Add stock per Variant after creating this Product.'),
    ).toBeInTheDocument()
  })

  it('quick-creates masters, submits exact paisa, invalidates and closes', async () => {
    const fetchMock = installFetch()
    const { invalidateSpy, onOpenChange } = renderForm()

    fireEvent.change(await screen.findByLabelText('Product Name'), {
      target: { value: 'Hammer' },
    })
    fireEvent.change(screen.getByLabelText('Purchase Price'), {
      target: { value: '12.50' },
    })
    fireEvent.change(screen.getByLabelText('Selling Price'), {
      target: { value: '18.75' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Category' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Add category' }))
    fireEvent.change(screen.getByLabelText('New category name'), {
      target: { value: 'Electrical' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Category' })).toHaveTextContent(
        'Electrical',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Unit' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Add unit' }))
    fireEvent.change(screen.getByLabelText('New unit name'), {
      target: { value: 'Box' },
    })
    fireEvent.change(screen.getByLabelText('New unit symbol'), {
      target: { value: 'box' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create unit' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unit' })).toHaveTextContent('Box')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          input === '/api/private/products' && init?.method === 'POST',
      )
      expect(createCall).toBeDefined()
      const body = JSON.parse(String(createCall?.[1]?.body))
      expect(body.defaultPurchasePricePaisa).toBe('1250')
      expect(body.defaultSellingPricePaisa).toBe('1875')
      expect(body.baseUnitId).toBe('unit-new')
      expect(body.categoryId).toBe('category-new')
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['products'] })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the create dialog open and shows server validation errors', async () => {
    installFetch({ productError: 'Barcode already exists.' })
    renderForm()

    fireEvent.change(await screen.findByLabelText('Product Name'), {
      target: { value: 'Hammer' },
    })
    fireEvent.change(screen.getByLabelText('Purchase Price'), {
      target: { value: '12.50' },
    })
    fireEvent.change(screen.getByLabelText('Selling Price'), {
      target: { value: '18.75' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Category' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Hardware' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unit' }))
    fireEvent.click(await screen.findByRole('option', { name: /Piece/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))

    expect(await screen.findByText('Barcode already exists.')).toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Add Product' }),
    ).toBeInTheDocument()
  })

  it('edits without opening stock and retains archived current masters', async () => {
    installFetch()
    renderForm({ mode: 'edit', product: archivedProduct() })

    expect(
      await screen.findByRole('dialog', { name: 'Edit Product' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Opening Stock')).not.toBeInTheDocument()
    expect(screen.getByText('Current Stock')).toBeInTheDocument()
    expect(screen.getByText('7.25')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Category' })).toHaveTextContent(
      'Old Category (Inactive)',
    )
    expect(screen.getByRole('button', { name: 'Unit' })).toHaveTextContent(
      'Old Unit (Inactive)',
    )
  })

  it('labels Variant fields clearly with bilingual guidance', async () => {
    installFetch()
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Variants' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Option' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }))

    for (const [english, bangla] of [
      ['Option Name', 'অপশনের নাম'],
      ['Option Values', 'অপশনের মান'],
      ['Variant Name', 'ভ্যারিয়েন্ট নাম'],
      ['SKU', 'এসকেইউ'],
      ['Purchase Price', 'কেনা দাম'],
      ['Selling Price', 'বিক্রির দাম'],
      ['Minimum Stock', 'ন্যূনতম স্টক'],
    ] as const) {
      expect(screen.getAllByText(english).length).toBeGreaterThan(0)
      expect(screen.getAllByText(bangla).length).toBeGreaterThan(0)
    }

    expect(
      screen.getByRole('button', { name: 'About SKU' }),
    ).toBeInTheDocument()
  })

  it('renders all Advanced Product guidance in Bangla in Full Bangla mode', async () => {
    installFetch()
    renderForm({ languageMode: 'bn' })

    const advanced = await screen.findByRole('button', { name: 'অ্যাডভান্সড' })
    fireEvent.click(advanced)

    for (const label of [
      'স্টক ট্র্যাকিং',
      'বিকল্প একক',
      'বৈশিষ্ট্য',
      'ভ্যারিয়েন্ট চালু করুন',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    expect(screen.queryByText('Tracking')).not.toBeInTheDocument()
    expect(screen.queryByText('Alternative Units')).not.toBeInTheDocument()
    expect(screen.queryByText('Specifications')).not.toBeInTheDocument()
    expect(screen.queryByText('Enable Variants')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'ভ্যারিয়েন্ট চালু করুন' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'অপশন যোগ করুন' }))
    fireEvent.click(screen.getByRole('button', { name: 'ভ্যারিয়েন্ট যোগ করুন' }))

    for (const label of [
      'অপশনের নাম',
      'অপশনের মান',
      'ভ্যারিয়েন্ট নাম',
      'এসকেইউ',
      'কেনা দাম',
      'বিক্রির দাম',
      'ন্যূনতম স্টক',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }

    expect(screen.queryByText('Option Name')).not.toBeInTheDocument()
    expect(screen.queryByText('Variant Name')).not.toBeInTheDocument()
    expect(screen.queryByText('Purchase Price')).not.toBeInTheDocument()
  })

  it('hides Bangla helpers in Full English mode', async () => {
    installFetch()
    renderForm({ languageMode: 'en' })

    expect(await screen.findByText('Product Name')).toBeInTheDocument()
    expect(screen.queryByText('পণ্যের নাম')).not.toBeInTheDocument()
  })

  it('hides English labels in Full Bangla mode', async () => {
    installFetch()
    renderForm({ languageMode: 'bn' })

    expect(await screen.findByText('পণ্যের নাম')).toBeInTheDocument()
    expect(screen.queryByText('Product Name')).not.toBeInTheDocument()
  })
  it('round-trips an existing exact conversion profile through Edit Product', async () => {
    const fetchMock = installFetch()
    renderForm({ mode: 'edit', product: conversionProduct() })

    expect(
      await screen.findByRole('dialog', { name: 'Edit Product' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Advanced conversion settings' }))

    expect(
      screen.getByRole('checkbox', {
        name: 'Enable custom quantity conversion',
      }),
    ).toBeChecked()
    expect(
      screen.getByRole('combobox', {
        name: 'Conversion profile type',
      }),
    ).toHaveTextContent('Compound')
    expect(
      screen.getByRole('combobox', { name: 'Pricing unit' }),
    ).toHaveTextContent('Gauge')
    expect(screen.getByLabelText('Pricing factor numerator')).toHaveValue('16')
    expect(screen.getByLabelText('Pricing factor denominator')).toHaveValue('1')
    expect(screen.getByLabelText('Conversion component key 1')).toHaveValue(
      'gauge',
    )
    expect(screen.getByLabelText('Conversion component key 2')).toHaveValue(
      'gira',
    )
    expect(
      screen.getByLabelText('Conversion component max exclusive 2'),
    ).toHaveValue('16')

    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))

    await waitFor(() => {
      const updateCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          input === '/api/private/products/product-conversion-edit' &&
          init?.method === 'PATCH',
      )
      expect(updateCall).toBeDefined()
      const body = JSON.parse(String(updateCall?.[1]?.body))

      expect(body.advanced.conversionProfile).toEqual({
        type: 'COMPOUND',
        baseUnitId: 'unit-gira',
        pricingUnitId: 'unit-gauge',
        pricingBaseFactorNumerator: '16',
        pricingBaseFactorDenominator: '1',
        displayPrecision: 2,
        components: [
          {
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
            key: 'gira',
            label: 'Gira',
            unitId: 'unit-gira',
            baseFactorNumerator: '1',
            baseFactorDenominator: '1',
            sortOrder: 1,
            minValue: '0',
            maxExclusive: '16',
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
        ],
      })
    })
  })


  it('configures mature tracking, warranty and typed capture fields from the compact Product editor', async () => {
    const fetchMock = installFetch()
    renderForm()

    fireEvent.change(await screen.findByLabelText('Product Name'), {
      target: { value: 'Tracked Medicine' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unit' }))
    fireEvent.click(await screen.findByRole('option', { name: /Piece/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))

    expect(screen.queryByLabelText('Allocation Policy')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Warranty Duration')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Tracking'))
    fireEvent.click(
      await screen.findByRole('option', { name: 'Batch & Expiry' }),
    )

    const allocationPolicy = screen.getByLabelText('Allocation Policy')
    expect(allocationPolicy).toHaveAttribute('data-slot', 'select-trigger')
    fireEvent.click(allocationPolicy)
    fireEvent.click(await screen.findByRole('option', { name: 'FEFO' }))

    const warrantyToggle = screen.getByRole('checkbox', {
      name: 'Enable Warranty',
    })
    fireEvent.click(warrantyToggle)

    fireEvent.change(screen.getByLabelText('Warranty Duration'), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByLabelText('Warranty Duration Unit'))
    fireEvent.click(await screen.findByRole('option', { name: 'Months' }))
    fireEvent.change(screen.getByLabelText('Warranty Provider'), {
      target: { value: 'Manufacturer' },
    })
    fireEvent.change(screen.getByLabelText('Warranty Terms'), {
      target: { value: 'Original warranty' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Add Capture Field' }),
    )
    fireEvent.change(screen.getByLabelText('Capture Field Key 1'), {
      target: { value: 'dosage_form' },
    })
    fireEvent.change(screen.getByLabelText('Capture Field Label 1'), {
      target: { value: 'Dosage Form' },
    })
    fireEvent.click(screen.getByLabelText('Capture Field Type 1'))
    fireEvent.click(await screen.findByRole('option', { name: 'Select' }))
    fireEvent.change(screen.getByLabelText('Capture Field Options 1'), {
      target: { value: 'Tablet, Syrup' },
    })
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Capture Field Required 1',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          input === '/api/private/products' && init?.method === 'POST',
      )
      expect(createCall).toBeDefined()
      const body = JSON.parse(String(createCall?.[1]?.body))

      expect(body.trackingMode).toBe('BATCH_EXPIRY')
      expect(body.allocationPolicy).toBe('FEFO')
      expect(body.advanced.warrantyPolicy).toEqual({
        enabled: true,
        durationValue: 12,
        durationUnit: 'MONTH',
        provider: 'Manufacturer',
        text: 'Original warranty',
      })
      expect(body.advanced.captureFields).toEqual([
        {
          key: 'dosage_form',
          label: 'Dosage Form',
          type: 'select',
          selectOptions: ['Tablet', 'Syrup'],
          required: true,
        },
      ])
    })
  })


  it('round-trips existing mature tracking settings through Edit Product', async () => {
    const fetchMock = installFetch()
    renderForm({ mode: 'edit', product: trackingProduct() })

    expect(
      await screen.findByRole('dialog', { name: 'Edit Product' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))

    expect(screen.getByLabelText('Tracking')).toHaveTextContent(
      'Batch & Expiry',
    )
    expect(screen.getByLabelText('Allocation Policy')).toHaveTextContent(
      'FEFO',
    )
    expect(
      screen.getByRole('checkbox', { name: 'Enable Warranty' }),
    ).toBeChecked()
    expect(screen.getByLabelText('Warranty Duration')).toHaveValue('12')
    expect(
      screen.getByLabelText('Warranty Duration Unit'),
    ).toHaveTextContent('Months')
    expect(screen.getByLabelText('Warranty Provider')).toHaveValue(
      'Manufacturer',
    )
    expect(screen.getByLabelText('Warranty Terms')).toHaveValue(
      'Original warranty',
    )
    expect(screen.getByLabelText('Capture Field Key 1')).toHaveValue(
      'dosage_form',
    )
    expect(screen.getByLabelText('Capture Field Label 1')).toHaveValue(
      'Dosage Form',
    )
    expect(screen.getByLabelText('Capture Field Type 1')).toHaveTextContent(
      'Select',
    )
    expect(screen.getByLabelText('Capture Field Options 1')).toHaveValue(
      'Tablet, Syrup',
    )
    expect(
      screen.getByRole('checkbox', {
        name: 'Capture Field Required 1',
      }),
    ).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }))

    await waitFor(() => {
      const updateCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          input === '/api/private/products/product-tracking-edit' &&
          init?.method === 'PATCH',
      )
      expect(updateCall).toBeDefined()
      const body = JSON.parse(String(updateCall?.[1]?.body))

      expect(body.trackingMode).toBe('BATCH_EXPIRY')
      expect(body.allocationPolicy).toBe('FEFO')
      expect(body.advanced.warrantyPolicy).toEqual({
        enabled: true,
        durationValue: 12,
        durationUnit: 'MONTH',
        provider: 'Manufacturer',
        text: 'Original warranty',
      })
      expect(body.advanced.captureFields).toEqual([
        {
          key: 'dosage_form',
          label: 'Dosage Form',
          type: 'select',
          selectOptions: ['Tablet', 'Syrup'],
          required: true,
        },
      ])
    })
  })

})
