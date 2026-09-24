import { useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Badge } from '../../components/ui/badge'
import { getSession, type AuthSession } from '../auth-api'
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { formatNumber } from '../../lib/format-number'
import {
  formatPaisaToTaka,
  parseTakaToPaisa,
} from '../../lib/money'
import {
  adjustStock,
  listProductLots,
  updateLotSellingPrice,
} from './product-api'
import type {
  ProductDetailDto,
  ProductLotDto,
  ProductStockTargetDto,
} from './product-types'

const SELECT_NONE = '__select_none__'

function inventoryValuePaisa(quantity: string, unitCostPaisa: string): string {
  const [whole = '0', fraction = ''] = quantity.split('.')
  const scale = 10n ** BigInt(fraction.length)
  const quantityUnits = BigInt(`${whole}${fraction}`)
  const valueNumerator = quantityUnits * BigInt(unitCostPaisa)

  return ((valueNumerator + scale / 2n) / scale).toString()
}

function lotSourceLabel(sourceType: 'OPENING' | 'ADJUSTMENT'): string {
  return sourceType === 'OPENING' ? 'Opening' : 'Adjustment'
}

interface StockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ProductDetailDto
}

function activeStockTargets(
  product: ProductDetailDto,
): ProductStockTargetDto[] {
  if (product.stockTargets) {
    return product.stockTargets.filter(
      (target) =>
        target.isActive &&
        (!target.isDefault ||
          !product.variantsEnabled ||
          target.hasInventoryHistory),
    )
  }

  return (product.advanced?.variants ?? []).flatMap((variant) => {
    if (variant.isActive === false || !variant.id) {
      return []
    }

    return [
      {
        id: variant.id,
        displayName: variant.displayName,
        stockBaseQty: variant.stockBaseQty ?? '0',
        hasInventoryHistory: Boolean(variant.hasInventoryHistory),
        isDefault: false,
        isActive: true,
      },
    ]
  })
}

function stockTargetLabel(target: ProductStockTargetDto): string {
  return target.isDefault ? 'Existing stock' : target.displayName
}

function unitLabel(product: ProductDetailDto): string {
  return product.baseUnit.symbol || product.baseUnit.name
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
}: StockDialogProps) {
  const queryClient = useQueryClient()
  const variants = activeStockTargets(product)
  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [purchasePrice, setPurchasePrice] = useState(
    formatPaisaToTaka(product.defaultPurchasePricePaisa),
  )
  const [sellingPrice, setSellingPrice] = useState(
    formatPaisaToTaka(product.defaultSellingPricePaisa),
  )
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const numericQuantity = Number(quantity)
  const isPositive =
    Number.isFinite(numericQuantity) && numericQuantity > 0
  const isNegative =
    Number.isFinite(numericQuantity) && numericQuantity < 0
  const actionLabel = isPositive
    ? 'Add stock'
    : isNegative
      ? 'Remove stock'
      : 'Adjust stock'

  const selectedVariant = variants.find(
    (variant) => variant.id === variantId,
  )
  const displayedStock =
    product.variantsEnabled && selectedVariant?.stockBaseQty !== undefined
      ? selectedVariant.stockBaseQty
      : product.stockBaseQty

  const mutation = useMutation({
    mutationFn: () =>
      adjustStock(product.id, {
        ...(product.variantsEnabled && variantId
          ? { variantId }
          : {}),
        deltaBaseQty: quantity.trim(),
        note: reason.trim(),
        ...(isPositive
          ? {
              unitCostPaisa: parseTakaToPaisa(purchasePrice),
              sellingPricePaisa: parseTakaToPaisa(sellingPrice),
            }
          : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({
        queryKey: ['product', product.id],
      })
      onOpenChange(false)
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Could not adjust stock.',
      )
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (
      !quantity.trim() ||
      !Number.isFinite(numericQuantity) ||
      numericQuantity === 0
    ) {
      setError('Enter a non-zero stock adjustment.')
      return
    }

    if (!reason.trim()) {
      setError('Adjustment reason is required.')
      return
    }

    if (product.variantsEnabled && !variantId) {
      setError('Select a Variant before adjusting stock.')
      return
    }

    try {
      if (isPositive) {
        if (!purchasePrice.trim()) {
          setError('Purchase price is required for added stock.')
          return
        }
        if (!sellingPrice.trim()) {
          setError('Selling price is required for added stock.')
          return
        }

        parseTakaToPaisa(purchasePrice)
        parseTakaToPaisa(sellingPrice)
      }
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : 'Cost is invalid.',
      )
      return
    }

    mutation.mutate()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="stock-adjust-dialog">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            Record an explicit stock correction for {product.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="stock-dialog-body">
            <div className="stock-current-strip">
              <span>Current Stock</span>
              <strong>
                {formatNumber(displayedStock ?? '0', {
                  maximumFractionDigits: 8,
                })}
              </strong>
              <small>{unitLabel(product)}</small>
            </div>

            {product.variantsEnabled ? (
              <label className="product-field">
                <span className="product-field-label">Variant</span>
                <Select
                  onValueChange={(value) => {
                    const nextVariantId =
                      value === SELECT_NONE ? '' : value
                    const defaults = product.advanced?.variants.find(
                      (variant) => variant.id === nextVariantId,
                    )

                    setVariantId(nextVariantId)
                    setPurchasePrice(
                      formatPaisaToTaka(
                        defaults?.defaultPurchasePricePaisa ??
                          product.defaultPurchasePricePaisa,
                      ),
                    )
                    setSellingPrice(
                      formatPaisaToTaka(
                        defaults?.defaultSellingPricePaisa ??
                          product.defaultSellingPricePaisa,
                      ),
                    )
                    setError('')
                  }}
                  value={variantId || SELECT_NONE}
                >
                  <SelectTrigger
                    aria-label="Variant"
                    className="product-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={SELECT_NONE}>Select Variant</SelectItem>
                      {variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {stockTargetLabel(variant)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            ) : null}

            <label className="product-field">
              <span className="product-field-label">
                Quantity adjustment
              </span>
              <Input
                aria-label="Quantity adjustment"
                inputMode="decimal"
                onChange={(event) => {
                  setQuantity(event.target.value)
                  setError('')
                }}
                placeholder="e.g. 2 or -1.5"
                value={quantity}
              />
              <small className="product-field-help">
                Positive adds stock. Negative removes stock.
              </small>
            </label>

            {isPositive ? (
              <div className="stock-in-price-fields">
                <label className="product-field">
                  <BilingualLabel
                    en="Purchase Price"
                    bn="কেনা দাম"
                  />
                  <Input
                    aria-label="Purchase Price"
                    inputMode="decimal"
                    onChange={(event) => {
                      setPurchasePrice(event.target.value)
                      setError('')
                    }}
                    value={purchasePrice}
                  />
                </label>

                <label className="product-field">
                  <BilingualLabel
                    en="Selling Price"
                    bn="বিক্রির দাম"
                  />
                  <Input
                    aria-label="Selling Price"
                    inputMode="decimal"
                    onChange={(event) => {
                      setSellingPrice(event.target.value)
                      setError('')
                    }}
                    value={sellingPrice}
                  />
                </label>

                <small className="product-field-help stock-in-price-help">
                  <BilingualLabel
                    en="These prices create a new stock lot. Future sales use this lot selling price."
                    bn="এই দামগুলো দিয়ে নতুন স্টক লট তৈরি হবে। ভবিষ্যৎ বিক্রিতে এই লটের বিক্রির দাম ব্যবহার হবে।"
                    layout="stacked"
                  />
                </small>
              </div>
            ) : null}

            <label className="product-field">
              <span className="product-field-label">Reason</span>
              <Input
                aria-label="Reason"
                onChange={(event) => {
                  setReason(event.target.value)
                  setError('')
                }}
                placeholder="Why is this stock changing?"
                value={reason}
              />
            </label>

            {error ? (
              <div className="product-form-error" role="alert">
                {error}
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
              disabled={mutation.isPending}
              type="submit"
              variant="default"
            >
              {mutation.isPending ? 'Saving...' : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProductLotsDialog({
  open,
  onOpenChange,
  product,
}: StockDialogProps) {
  const queryClient = useQueryClient()
  const variants = activeStockTargets(product)
  const [variantId, setVariantId] = useState('')
  const [editingLot, setEditingLot] = useState<ProductLotDto | null>(null)
  const [lotSellingPrice, setLotSellingPrice] = useState('')
  const [lotPriceError, setLotPriceError] = useState('')

  const sessionQuery = useQuery<AuthSession | null>({
    queryKey: ['auth', 'session'],
    queryFn: getSession,
    enabled: false,
  })
  const canEditLotSellingPrice =
    sessionQuery.data?.permissions.includes(
      'INVENTORY_EDIT_LOT_SELLING_PRICE',
    ) ?? false

  const effectiveVariantId = product.variantsEnabled
    ? variantId
    : undefined

  const lotsQuery = useQuery({
    queryKey: ['product-lots', product.id, effectiveVariantId ?? 'default'],
    queryFn: () => listProductLots(product.id, effectiveVariantId),
    enabled:
      open &&
      (!product.variantsEnabled || Boolean(effectiveVariantId)),
  })

  const lotPriceMutation = useMutation({
    mutationFn: async () => {
      if (!editingLot) {
        throw new Error('Select a stock lot.')
      }

      return updateLotSellingPrice(
        product.id,
        editingLot.id,
        parseTakaToPaisa(lotSellingPrice),
      )
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['product-lots', product.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['product', product.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['products'],
        }),
      ])
      setEditingLot(null)
      setLotPriceError('')
    },
    onError: (mutationError) => {
      setLotPriceError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Could not update the lot selling price.',
      )
    },
  })

  const lots = lotsQuery.data ?? []
  const totalRemaining = lots.reduce(
    (total, lot) => total + Number(lot.remainingBaseQty),
    0,
  )
  const totalStockValuePaisa = lots
    .reduce(
      (total, lot) =>
        total +
        BigInt(
          inventoryValuePaisa(
            lot.remainingBaseQty,
            lot.unitCostPaisa,
          ),
        ),
      0n,
    )
    .toString()

  function openLotPriceEditor(lot: ProductLotDto) {
    setEditingLot(lot)
    setLotSellingPrice(
      formatPaisaToTaka(lot.defaultSellingPricePaisa),
    )
    setLotPriceError('')
  }

  function submitLotSellingPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLotPriceError('')

    if (!lotSellingPrice.trim()) {
      setLotPriceError('Selling price is required.')
      return
    }

    try {
      parseTakaToPaisa(lotSellingPrice)
    } catch (parseError) {
      setLotPriceError(
        parseError instanceof Error
          ? parseError.message
          : 'Selling price is invalid.',
      )
      return
    }

    lotPriceMutation.mutate()
  }

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="product-lots-dialog">
          <DialogHeader>
            <DialogTitle>Stock Lots</DialogTitle>
            <DialogDescription>
              FIFO inventory evidence for {product.name}. API order is
              preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="stock-dialog-body">
            {product.variantsEnabled ? (
              <label className="product-field product-lots-variant">
                <span className="product-field-label">Variant</span>
                <Select
                  onValueChange={(value) =>
                    setVariantId(value === SELECT_NONE ? '' : value)
                  }
                  value={variantId || SELECT_NONE}
                >
                  <SelectTrigger
                    aria-label="Variant"
                    className="product-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={SELECT_NONE}>
                        Select Variant
                      </SelectItem>
                      {variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {stockTargetLabel(variant)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            ) : null}

            {product.variantsEnabled && !variantId ? (
              <div className="stock-lots-state">
                Select a Variant to inspect its FIFO lots.
              </div>
            ) : lotsQuery.isPending ? (
              <div className="stock-lots-state">Loading lots...</div>
            ) : lotsQuery.isError ? (
              <div className="product-form-error" role="alert">
                {lotsQuery.error instanceof Error
                  ? lotsQuery.error.message
                  : 'Could not load stock lots.'}
              </div>
            ) : lots.length === 0 ? (
              <div className="stock-lots-state">
                No stock lots for this Product.
              </div>
            ) : (
              <>
                <div className="stock-lots-summary">
                  <span>
                    Total remaining:{' '}
                    {formatNumber(totalRemaining.toString(), {
                      maximumFractionDigits: 8,
                    })}
                  </span>
                  <span>
                    Total stock value: ৳
                    {formatPaisaToTaka(totalStockValuePaisa)}
                  </span>
                </div>

                <div className="stock-lots-table-wrap">
                  <table className="stock-lots-table">
                    <thead>
                      <tr>
                        <th>Lot ID</th>
                        <th>Source</th>
                        <th>Supplier</th>
                        <th>Date</th>
                        <th className="stock-number-column">
                          Purchase Price
                        </th>
                        <th className="stock-number-column">
                          Selling Price
                        </th>
                        <th className="stock-number-column">
                          Original Qty
                        </th>
                        <th className="stock-number-column">
                          Remaining Qty
                        </th>
                        <th className="stock-number-column">Value</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((lot, index) => {
                        const valuePaisa = inventoryValuePaisa(
                          lot.remainingBaseQty,
                          lot.unitCostPaisa,
                        )

                        return (
                          <tr key={lot.id}>
                            <td>
                              <code
                                className="stock-lot-id"
                                title={lot.id}
                              >
                                {'LOT-' +
                                  String(index + 1).padStart(6, '0')}
                              </code>
                            </td>
                            <td>{lotSourceLabel(lot.sourceType)}</td>
                            <td>Unattributed</td>
                            <td>{lot.receivedOn}</td>
                            <td className="stock-number-column">
                              ৳{formatPaisaToTaka(lot.unitCostPaisa)}
                            </td>
                            <td className="stock-number-column">
                              <div className="stock-lot-selling-price">
                                <span>
                                  ৳
                                  {formatPaisaToTaka(
                                    lot.defaultSellingPricePaisa,
                                  )}
                                </span>
                                {canEditLotSellingPrice &&
                                lot.status === 'ACTIVE' ? (
                                  <Button
                                    aria-label="Edit Selling Price"
                                    className="stock-lot-price-edit"
                                    onClick={() =>
                                      openLotPriceEditor(lot)
                                    }
                                    size="xs"
                                    variant="ghost"
                                  >
                                    Edit
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                            <td className="stock-number-column">
                              {formatNumber(lot.originalBaseQty, {
                                maximumFractionDigits: 8,
                              })}
                            </td>
                            <td className="stock-number-column">
                              {formatNumber(lot.remainingBaseQty, {
                                maximumFractionDigits: 8,
                              })}
                            </td>
                            <td className="stock-number-column">
                              ৳{formatPaisaToTaka(valuePaisa)}
                            </td>
                            <td>
                              <Badge
                                className={
                                  lot.status === 'ACTIVE'
                                    ? 'sher-badge-success'
                                    : 'sher-badge-neutral'
                                }
                                variant="outline"
                              >
                                {lot.status === 'ACTIVE'
                                  ? 'Active'
                                  : 'Depleted'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              variant="secondary"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingLot(null)
            setLotPriceError('')
          }
        }}
        open={Boolean(editingLot)}
      >
        <DialogContent className="lot-selling-price-dialog">
          <DialogHeader>
            <DialogTitle>Edit Selling Price</DialogTitle>
            <DialogDescription>
              <BilingualLabel
                en="This changes the selling price for future sales from this lot. Previous invoices will not change."
                bn="এটি এই লটের ভবিষ্যৎ বিক্রির দাম পরিবর্তন করবে। আগের ইনভয়েস পরিবর্তন হবে না।"
                layout="stacked"
              />
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitLotSellingPrice}>
            <div className="stock-dialog-body">
              <label className="product-field">
                <BilingualLabel
                  en="Selling Price"
                  bn="বিক্রির দাম"
                />
                <Input
                  aria-label="Lot Selling Price"
                  autoFocus
                  inputMode="decimal"
                  onChange={(event) => {
                    setLotSellingPrice(event.target.value)
                    setLotPriceError('')
                  }}
                  value={lotSellingPrice}
                />
              </label>

              {lotPriceError ? (
                <div className="product-form-error" role="alert">
                  {lotPriceError}
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                onClick={() => setEditingLot(null)}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={lotPriceMutation.isPending}
                type="submit"
              >
                {lotPriceMutation.isPending
                  ? 'Saving...'
                  : 'Save Selling Price'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
