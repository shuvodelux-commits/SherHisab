import {
  useState,
  type FormEvent,
} from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLanguageMode } from '../../app/language'
import { BilingualLabel } from '../../components/ui/bilingual-label'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import {
  SearchCombobox,
  type SearchComboboxOption,
} from '../../components/ui/search-combobox'
import { formatNumber } from '../../lib/format-number'
import {
  formatPaisaToTaka,
  parseTakaToPaisa,
} from '../../lib/money'
import {
  createCategory,
  createProduct,
  createUnit,
  listCategories,
  listUnits,
  updateProduct,
} from './product-api'
import {
  advancedFormStateFromProduct,
  buildAdvancedPayload,
  emptyAdvancedFormState,
  ProductAdvancedFields,
  type ProductAdvancedFormState,
} from './product-advanced-fields'
import type {
  ProductCategoryDto,
  ProductDetailDto,
  ProductUnitDto,
} from './product-types'

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  product?: ProductDetailDto
}

interface ProductFormState {
  name: string
  brand: string
  categoryId: string
  baseUnitId: string
  barcode: string
  purchasePrice: string
  sellingPrice: string
  openingStock: string
  minimumStock: string
}

function initialFormState(
  mode: 'create' | 'edit',
  product?: ProductDetailDto,
): ProductFormState {
  if (mode === 'edit' && product) {
    return {
      name: product.name,
      brand: product.brand,
      categoryId: product.category?.id ?? '',
      baseUnitId: product.baseUnit.id,
      barcode: product.primaryBarcode ?? '',
      purchasePrice: formatPaisaToTaka(
        product.defaultPurchasePricePaisa,
      ),
      sellingPrice: formatPaisaToTaka(
        product.defaultSellingPricePaisa,
      ),
      openingStock: '0',
      minimumStock: product.minimumStockBaseQty,
    }
  }

  return {
    name: '',
    brand: '',
    categoryId: '',
    baseUnitId: '',
    barcode: '',
    purchasePrice: '0.00',
    sellingPrice: '0.00',
    openingStock: '0',
    minimumStock: '0',
  }
}

function initialAdvancedState(
  mode: 'create' | 'edit',
  product?: ProductDetailDto,
): ProductAdvancedFormState {
  if (mode === 'edit' && product) {
    return advancedFormStateFromProduct(
      product.trackingMode,
      product.variantsEnabled,
      product.advanced,
    )
  }

  return emptyAdvancedFormState()
}

function FieldLabel({
  en,
  bn,
  htmlFor,
}: {
  en: string
  bn: string
  htmlFor?: string
}) {
  return (
    <label className="product-field-label" htmlFor={htmlFor}>
      <BilingualLabel en={en} bn={bn} />
    </label>
  )
}

function masterOptions<
  T extends ProductCategoryDto | ProductUnitDto,
>(
  items: T[],
  currentId: string,
): SearchComboboxOption[] {
  return items
    .filter((item) => item.isActive || item.id === currentId)
    .map((item) => ({
      value: item.id,
      label: item.isActive
        ? item.name
        : `${item.name} (Inactive)`,
      keywords:
        'symbol' in item && item.symbol
          ? [item.symbol]
          : undefined,
    }))
}

export function ProductFormDialog({
  open,
  onOpenChange,
  mode,
  product,
}: ProductFormDialogProps) {
  const queryClient = useQueryClient()
  const { mode: languageMode } = useLanguageMode()
  const [form, setForm] = useState<ProductFormState>(() =>
    initialFormState(mode, product),
  )
  const [advanced, setAdvanced] =
    useState<ProductAdvancedFormState>(() =>
      initialAdvancedState(mode, product),
    )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [unitDialogOpen, setUnitDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [newUnitSymbol, setNewUnitSymbol] = useState('')
  const [masterError, setMasterError] = useState('')

  const categoriesQuery = useQuery({
    queryKey: ['product-categories', 'all'],
    queryFn: () => listCategories(true),
    enabled: open,
  })

  const unitsQuery = useQuery({
    queryKey: ['product-units', 'all'],
    queryFn: () => listUnits(true),
    enabled: open,
  })

  const categoryOptions = masterOptions(
    categoriesQuery.data ??
      (product?.category ? [product.category] : []),
    form.categoryId,
  )

  const unitOptions = masterOptions(
    unitsQuery.data ??
      (product?.baseUnit ? [product.baseUnit] : []),
    form.baseUnitId,
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      const purchasePrice = parseTakaToPaisa(form.purchasePrice)
      const sellingPrice = parseTakaToPaisa(form.sellingPrice)
      const advancedPayload = buildAdvancedPayload(advanced, form.baseUnitId)

      if (!form.name.trim()) {
        throw new Error('Product name is required.')
      }

      if (!form.baseUnitId) {
        throw new Error('Unit is required.')
      }

      if (mode === 'create') {
        return createProduct({
          name: form.name.trim(),
          brand: form.brand.trim(),
          categoryId: form.categoryId || null,
          baseUnitId: form.baseUnitId,
          barcode: form.barcode.trim(),
          defaultPurchasePricePaisa: purchasePrice,
          defaultSellingPricePaisa: sellingPrice,
          openingStockBaseQty: advanced.variantsEnabled
            ? '0'
            : form.openingStock || '0',
          minimumStockBaseQty: form.minimumStock || '0',
          trackingMode: advanced.trackingMode,
          advanced: advancedPayload,
        })
      }

      if (!product) {
        throw new Error('Product details are required for editing.')
      }

      return updateProduct(product.id, {
        name: form.name.trim(),
        brand: form.brand.trim(),
        categoryId: form.categoryId || null,
        baseUnitId: form.baseUnitId,
        barcode: form.barcode.trim(),
        defaultPurchasePricePaisa: purchasePrice,
        defaultSellingPricePaisa: sellingPrice,
        minimumStockBaseQty: form.minimumStock || '0',
        trackingMode: advanced.trackingMode,
        advanced: advancedPayload,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      onOpenChange(false)
    },
    onError: (error) => {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Could not save Product.',
      )
    },
  })

  async function createCategoryInline() {
    setMasterError('')

    try {
      const created = await createCategory(newCategoryName)
      await queryClient.invalidateQueries({
        queryKey: ['product-categories'],
      })
      queryClient.setQueryData<ProductCategoryDto[]>(
        ['product-categories', 'all'],
        (current = []) => [
          ...current.filter((item) => item.id !== created.id),
          created,
        ],
      )
      setForm((current) => ({
        ...current,
        categoryId: created.id,
      }))
      setNewCategoryName('')
      setCategoryDialogOpen(false)
    } catch (error) {
      setMasterError(
        error instanceof Error
          ? error.message
          : 'Could not create category.',
      )
    }
  }

  async function createUnitInline() {
    setMasterError('')

    try {
      const created = await createUnit({
        name: newUnitName,
        symbol: newUnitSymbol || null,
      })
      await queryClient.invalidateQueries({
        queryKey: ['product-units'],
      })
      queryClient.setQueryData<ProductUnitDto[]>(
        ['product-units', 'all'],
        (current = []) => [
          ...current.filter((item) => item.id !== created.id),
          created,
        ],
      )
      setForm((current) => ({
        ...current,
        baseUnitId: created.id,
      }))
      setNewUnitName('')
      setNewUnitSymbol('')
      setUnitDialogOpen(false)
    } catch (error) {
      setMasterError(
        error instanceof Error
          ? error.message
          : 'Could not create unit.',
      )
    }
  }

  function updateAdvanced(next: ProductAdvancedFormState) {
    if (next.variantsEnabled && !advanced.variantsEnabled) {
      setForm((current) => ({
        ...current,
        openingStock: '0',
      }))
    }
    setAdvanced(next)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    saveMutation.mutate()
  }

  const title = mode === 'create' ? 'Add Product' : 'Edit Product'

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="product-form-dialog">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Keep the common fields simple. Use Advanced only when the
              business needs extra units, specifications, lots, batches, or
              stock variants.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit}>
            <div className="product-form-body">
              <div className="product-form-grid">
                <div className="product-field product-field-wide">
                  <FieldLabel
                    bn="পণ্যের নাম"
                    en="Product Name"
                    htmlFor="product-name"
                  />
                  <Input
                    aria-label="Product Name"
                    id="product-name"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    value={form.name}
                  />
                </div>

                <div className="product-field">
                  <FieldLabel
                    bn="ব্র্যান্ড"
                    en="Brand"
                    htmlFor="product-brand"
                  />
                  <Input
                    aria-label="Brand"
                    id="product-brand"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        brand: event.target.value,
                      }))
                    }
                    value={form.brand}
                  />
                </div>

                <div className="product-field">
                  <FieldLabel bn="ধরন" en="Category" />
                  <SearchCombobox
                    ariaLabel="Category"
                    emptyMessage="No categories"
                    footerAction={{
                      label: '+ Add category',
                      onSelect: () => {
                        setMasterError('')
                        setCategoryDialogOpen(true)
                      },
                    }}
                    onValueChange={(categoryId) =>
                      setForm((current) => ({
                        ...current,
                        categoryId,
                      }))
                    }
                    options={categoryOptions}
                    placeholder="Select category"
                    searchPlaceholder="Search categories"
                    value={form.categoryId || null}
                  />
                </div>

                <div className="product-field">
                  <FieldLabel bn="একক" en="Unit" />
                  <SearchCombobox
                    ariaLabel="Unit"
                    emptyMessage="No units"
                    footerAction={{
                      label: '+ Add unit',
                      onSelect: () => {
                        setMasterError('')
                        setUnitDialogOpen(true)
                      },
                    }}
                    onValueChange={(baseUnitId) =>
                      setForm((current) => ({
                        ...current,
                        baseUnitId,
                      }))
                    }
                    options={unitOptions}
                    placeholder="Select unit"
                    searchPlaceholder="Search units"
                    value={form.baseUnitId || null}
                  />
                </div>

                <div className="product-field">
                  <FieldLabel
                    bn="বারকোড"
                    en="Barcode"
                    htmlFor="product-barcode"
                  />
                  <Input
                    aria-label="Barcode"
                    id="product-barcode"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        barcode: event.target.value,
                      }))
                    }
                    value={form.barcode}
                  />
                </div>

                <div className="product-field">
                  <FieldLabel
                    bn="কেনা দাম"
                    en="Purchase Price"
                    htmlFor="product-purchase-price"
                  />
                  <Input
                    aria-label="Purchase Price"
                    id="product-purchase-price"
                    inputMode="decimal"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        purchasePrice: event.target.value,
                      }))
                    }
                    value={form.purchasePrice}
                  />
                </div>

                <div className="product-field">
                  <FieldLabel
                    bn="বিক্রির দাম"
                    en="Selling Price"
                    htmlFor="product-selling-price"
                  />
                  <Input
                    aria-label="Selling Price"
                    id="product-selling-price"
                    inputMode="decimal"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sellingPrice: event.target.value,
                      }))
                    }
                    value={form.sellingPrice}
                  />
                </div>

                {mode === 'create' ? (
                  <div className="product-field">
                    <FieldLabel
                      bn="শুরুর স্টক"
                      en="Opening Stock"
                      htmlFor="product-opening-stock"
                    />
                    <Input
                      aria-label="Opening Stock"
                      disabled={advanced.variantsEnabled}
                      id="product-opening-stock"
                      inputMode="decimal"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          openingStock: event.target.value,
                        }))
                      }
                      value={
                        advanced.variantsEnabled
                          ? '0'
                          : form.openingStock
                      }
                    />
                    {advanced.variantsEnabled ? (
                      <small className="product-field-help">
                        Add stock per Variant after creating this Product.
                      </small>
                    ) : null}
                  </div>
                ) : (
                  <div className="product-field product-current-stock">
                    <span className="product-field-label">
                      Current Stock
                    </span>
                    <strong>
                      {formatNumber(product?.stockBaseQty ?? '0', {
                        maximumFractionDigits: 8,
                      })}
                    </strong>
                    <small>
                      {product?.baseUnit.symbol ||
                        product?.baseUnit.name ||
                        ''}
                    </small>
                  </div>
                )}

                <div className="product-field">
                  <FieldLabel
                    bn="ন্যূনতম স্টক"
                    en="Minimum Stock"
                    htmlFor="product-minimum-stock"
                  />
                  <Input
                    aria-label="Minimum Stock"
                    id="product-minimum-stock"
                    inputMode="decimal"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minimumStock: event.target.value,
                      }))
                    }
                    value={form.minimumStock}
                  />
                </div>
              </div>

              <div className="product-advanced-toggle-wrap">
                <Button
                  aria-expanded={advancedOpen}
                  className="product-advanced-toggle"
                  onClick={() =>
                    setAdvancedOpen((current) => !current)
                  }
                  size="sm"
                  variant="outline"
                >
                  {advancedOpen ? (
                    <ChevronUp aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <ChevronDown aria-hidden="true" data-icon="inline-start" />
                  )}
                  {languageMode === 'bn' ? 'অ্যাডভান্সড' : 'Advanced'}
                </Button>
              </div>

              {advancedOpen ? (
                <ProductAdvancedFields
                  baseUnitId={form.baseUnitId}
                  onChange={updateAdvanced}
                  state={advanced}
                  units={unitsQuery.data ?? []}
                />
              ) : null}

              {formError ? (
                <div className="product-form-error" role="alert">
                  {formError}
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={saveMutation.isPending}
                type="submit"
                variant="default"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(nextOpen) => {
          setCategoryDialogOpen(nextOpen)
          if (!nextOpen) {
            setMasterError('')
          }
        }}
        open={categoryDialogOpen}
      >
        <DialogContent className="product-quick-master-dialog">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>
              Create a reusable Product category.
            </DialogDescription>
          </DialogHeader>
          <div className="product-form-body">
            <label className="product-field">
              <span>Category name</span>
              <Input
                aria-label="New category name"
                autoFocus
                onChange={(event) =>
                  setNewCategoryName(event.target.value)
                }
                value={newCategoryName}
              />
            </label>
            {masterError ? (
              <div className="product-form-error" role="alert">
                {masterError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setCategoryDialogOpen(false)}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={!newCategoryName.trim()}
              onClick={() => void createCategoryInline()}
              variant="default"
            >
              Create category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(nextOpen) => {
          setUnitDialogOpen(nextOpen)
          if (!nextOpen) {
            setMasterError('')
          }
        }}
        open={unitDialogOpen}
      >
        <DialogContent className="product-quick-master-dialog">
          <DialogHeader>
            <DialogTitle>Add Unit</DialogTitle>
            <DialogDescription>
              Create a reusable stock unit.
            </DialogDescription>
          </DialogHeader>
          <div className="product-form-body product-quick-unit-grid">
            <label className="product-field">
              <span>Unit name</span>
              <Input
                aria-label="New unit name"
                autoFocus
                onChange={(event) =>
                  setNewUnitName(event.target.value)
                }
                value={newUnitName}
              />
            </label>
            <label className="product-field">
              <span>Symbol</span>
              <Input
                aria-label="New unit symbol"
                onChange={(event) =>
                  setNewUnitSymbol(event.target.value)
                }
                placeholder="Optional"
                value={newUnitSymbol}
              />
            </label>
            {masterError ? (
              <div
                className="product-form-error product-field-wide"
                role="alert"
              >
                {masterError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setUnitDialogOpen(false)}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={!newUnitName.trim()}
              onClick={() => void createUnitInline()}
              variant="default"
            >
              Create unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
