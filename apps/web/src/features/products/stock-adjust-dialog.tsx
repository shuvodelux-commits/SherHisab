import { useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Badge } from '../../components/ui/badge'
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
} from './product-api'
import type {
  ProductDetailDto,
  ProductStockTargetDto,
} from './product-types'

const SELECT_NONE = '__select_none__'

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
  const [cost, setCost] = useState('')
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
        ...(isPositive && cost.trim()
          ? { unitCostPaisa: parseTakaToPaisa(cost) }
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
      if (isPositive && cost.trim()) {
        parseTakaToPaisa(cost)
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
                    setVariantId(value === SELECT_NONE ? '' : value)
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
              <label className="product-field">
                <span className="product-field-label">Cost</span>
                <Input
                  aria-label="Cost"
                  inputMode="decimal"
                  onChange={(event) => {
                    setCost(event.target.value)
                    setError('')
                  }}
                  placeholder="Optional — uses default purchase cost"
                  value={cost}
                />
              </label>
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
  const variants = activeStockTargets(product)
  const [variantId, setVariantId] = useState('')

  const effectiveVariantId = product.variantsEnabled
    ? variantId
    : undefined

  const lotsQuery = useQuery({
    queryKey: ['product-lots', product.id, effectiveVariantId ?? 'default'],
    queryFn: () =>
      listProductLots(product.id, effectiveVariantId),
    enabled:
      open &&
      (!product.variantsEnabled || Boolean(effectiveVariantId)),
  })

  return (
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
          ) : (lotsQuery.data ?? []).length === 0 ? (
            <div className="stock-lots-state">
              No stock lots for this Product.
            </div>
          ) : (
            <div className="stock-lots-table-wrap">
              <table className="stock-lots-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Received</th>
                    <th className="stock-number-column">Remaining</th>
                    <th className="stock-number-column">Purchase Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(lotsQuery.data ?? []).map((lot) => (
                    <tr key={lot.id}>
                      <td>
                        <code className="stock-lot-id">{lot.id}</code>
                      </td>
                      <td>{lot.receivedOn}</td>
                      <td className="stock-number-column">
                        {formatNumber(lot.remainingBaseQty, {
                          maximumFractionDigits: 8,
                        })}
                      </td>
                      <td className="stock-number-column">
                        ৳{formatPaisaToTaka(lot.unitCostPaisa)}
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
                  ))}
                </tbody>
              </table>
            </div>
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
  )
}
