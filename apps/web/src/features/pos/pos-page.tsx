import { useState, type ChangeEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Eye,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { BilingualLabel } from '../../components/ui/bilingual-label'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Separator } from '../../components/ui/separator'
import { formatNumber } from '../../lib/format-number'
import {
  formatPaisaToTaka,
  parseTakaToPaisa,
} from '../../lib/money'
import { getSession, type AuthSession } from '../auth-api'
import {
  commitSale,
  quoteSaleLine,
  searchPosProducts,
} from './pos-api'
import type {
  PosLineQuoteDto,
  PosProductSearchDto,
} from './pos-types'

interface CartLineState {
  product: PosProductSearchDto
  quantity: string
  quote: PosLineQuoteDto
  priceInput: string
  manualUnitSellingPricePaisa: string | null
  showBreakdown: boolean
  isQuoting: boolean
  error: string
}

function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function quantityTimesPaisa(
  quantity: string,
  unitPaisa: string,
): string {
  const normalized = quantity.trim()

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return '0'
  }

  const [whole = '0', fraction = ''] = normalized.split('.')
  const scale = 10n ** BigInt(fraction.length)
  const quantityUnits = BigInt(`${whole}${fraction}`)
  const numerator = quantityUnits * BigInt(unitPaisa)

  return ((numerator + scale / 2n) / scale).toString()
}

function sumPaisa(values: string[]): string {
  return values
    .reduce((total, value) => total + BigInt(value), 0n)
    .toString()
}

function lineTotalPaisa(line: CartLineState): string {
  return line.manualUnitSellingPricePaisa
    ? quantityTimesPaisa(
        line.quantity,
        line.manualUnitSellingPricePaisa,
      )
    : line.quote.automaticSalesTotalPaisa
}

export function PosPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLineState[]>([])
  const [pageError, setPageError] = useState('')
  const [saleMessage, setSaleMessage] = useState('')

  const sessionQuery = useQuery<AuthSession | null>({
    queryKey: ['auth', 'session'],
    queryFn: getSession,
    enabled: false,
  })
  const canOverrideSellingPrice =
    sessionQuery.data?.permissions.includes(
      'SALES_OVERRIDE_SELLING_PRICE',
    ) ?? false

  const normalizedSearch = search.trim()
  const productsQuery = useQuery({
    queryKey: ['pos-products', normalizedSearch],
    queryFn: () => searchPosProducts(normalizedSearch, 20),
    enabled: normalizedSearch.length > 0,
  })

  const saleMutation = useMutation({
    mutationFn: () =>
      commitSale({
        businessDate: todayLocalDate(),
        lines: cart.map((line) => ({
          variantId: line.product.variantId,
          baseQty: line.quantity,
          ...(line.manualUnitSellingPricePaisa
            ? {
                manualUnitSellingPricePaisa:
                  line.manualUnitSellingPricePaisa,
              }
            : {}),
        })),
      }),
    onSuccess: async () => {
      setCart([])
      setPageError('')
      setSaleMessage('Sale completed')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
        queryClient.invalidateQueries({ queryKey: ['product-lots'] }),
      ])
    },
    onError: (error) => {
      setSaleMessage('')
      setPageError(
        error instanceof Error
          ? error.message
          : 'Could not complete the sale.',
      )
    },
  })

  const products = productsQuery.data ?? []

  const cartTotalPaisa = sumPaisa(
    cart.map((line) => lineTotalPaisa(line)),
  )

  async function addProduct(product: PosProductSearchDto) {
    setPageError('')
    setSaleMessage('')

    const existing = cart.find(
      (line) => line.product.variantId === product.variantId,
    )

    if (existing) {
      const nextQuantity = (
        Number(existing.quantity) + 1
      ).toString()
      await updateQuantity(product.variantId, nextQuantity)
      return
    }

    try {
      const quote = await quoteSaleLine(
        product.variantId,
        '1',
      )
      setCart((lines) => [
        ...lines,
        {
          product,
          quantity: '1',
          quote,
          priceInput: formatPaisaToTaka(
            quote.effectiveUnitSellingPricePaisa,
          ),
          manualUnitSellingPricePaisa: null,
          showBreakdown: false,
          isQuoting: false,
          error: '',
        },
      ])
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Could not add the Product.',
      )
    }
  }

  async function updateQuantity(
    productId: string,
    quantity: string,
  ) {
    const target = cart.find(
      (line) => line.product.variantId === productId,
    )

    if (!target) {
      return
    }

    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === productId
          ? {
              ...line,
              quantity,
              isQuoting: true,
              error: '',
            }
          : line,
      ),
    )

    if (
      !/^\d+(?:\.\d+)?$/.test(quantity) ||
      Number(quantity) <= 0
    ) {
      setCart((lines) =>
        lines.map((line) =>
          line.product.variantId === productId
            ? {
                ...line,
                isQuoting: false,
                error: 'Quantity must be greater than zero.',
              }
            : line,
        ),
      )
      return
    }

    try {
      const quote = await quoteSaleLine(
        target.product.variantId,
        quantity,
      )

      setCart((lines) =>
        lines.map((line) => {
          if (line.product.variantId !== productId) {
            return line
          }

          return {
            ...line,
            quote,
            quantity,
            priceInput: line.manualUnitSellingPricePaisa
              ? line.priceInput
              : formatPaisaToTaka(
                  quote.effectiveUnitSellingPricePaisa,
                ),
            isQuoting: false,
            error: '',
          }
        }),
      )
    } catch (error) {
      setCart((lines) =>
        lines.map((line) =>
          line.product.variantId === productId
            ? {
                ...line,
                isQuoting: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Could not price this quantity.',
              }
            : line,
        ),
      )
    }
  }

  function changeSellingPrice(
    productId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    if (!canOverrideSellingPrice) {
      return
    }

    const value = event.target.value

    setCart((lines) =>
      lines.map((line) => {
        if (line.product.variantId !== productId) {
          return line
        }

        try {
          const manualUnitSellingPricePaisa =
            parseTakaToPaisa(value)

          return {
            ...line,
            priceInput: value,
            manualUnitSellingPricePaisa,
            error: '',
          }
        } catch {
          return {
            ...line,
            priceInput: value,
            manualUnitSellingPricePaisa: null,
            error: 'Enter a valid selling price.',
          }
        }
      }),
    )
  }

  function resetLotPrice(productId: string) {
    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === productId
          ? {
              ...line,
              manualUnitSellingPricePaisa: null,
              priceInput: formatPaisaToTaka(
                line.quote.effectiveUnitSellingPricePaisa,
              ),
              error: '',
            }
          : line,
      ),
    )
  }

  function removeLine(productId: string) {
    setCart((lines) =>
      lines.filter((line) => line.product.variantId !== productId),
    )
  }

  return (
    <main className="pos-page">
      <div className="page-heading pos-page-heading">
        <div>
          <h1>POS</h1>
          <p lang="bn">ক্যাশ কাউন্টার</p>
        </div>
      </div>

      {pageError ? (
        <div className="pos-feedback pos-feedback-error" role="alert">
          {pageError}
        </div>
      ) : null}
      {saleMessage ? (
        <div className="pos-feedback pos-feedback-success" role="status">
          {saleMessage}
        </div>
      ) : null}

      <div className="pos-workspace">
        <section className="pos-panel pos-catalog-panel">
          <div className="pos-panel-heading">
            <BilingualLabel en="Add Product" bn="পণ্য যোগ করুন" />
          </div>

          <div className="pos-search-wrap">
            <Search aria-hidden="true" />
            <Input
              aria-label="Search products"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, barcode, SKU, variant, brand or category"
              value={search}
            />
          </div>

          <div className="pos-product-list">
            {!normalizedSearch ? (
              <p className="pos-muted">Search to find Products.</p>
            ) : productsQuery.isPending ? (
              <p className="pos-muted">Searching products…</p>
            ) : productsQuery.isError ? (
              <p className="pos-error" role="alert">
                {productsQuery.error.message}
              </p>
            ) : products.length === 0 ? (
              <p className="pos-muted">No matching Products.</p>
            ) : (
              products.map((product) => (
                <Button
                  aria-label={`Add ${product.productName}`}
                  className="pos-product-card"
                  key={product.variantId}
                  onClick={() => addProduct(product)}
                  variant="outline"
                >
                  <span className="pos-product-card-name">
                    {product.productName}
                  </span>
                  <span className="pos-product-card-meta">
                    {product.variantName
                      ? `${product.categoryName ?? 'Uncategorized'} · ${product.variantName}`
                      : product.categoryName ?? 'Uncategorized'}
                  </span>
                  <span className="pos-product-card-price">
                    ৳
                    {formatPaisaToTaka(
                      product.currentSellingPricePaisa,
                    )}
                  </span>
                  <span className="pos-product-card-stock">
                    {formatNumber(product.availableOwnBaseQty, {
                      maximumFractionDigits: 8,
                    })}{' '}
                    {product.unitSymbol ?? product.unitName}{' '}
                    in stock
                  </span>
                </Button>
              ))
            )}
          </div>
        </section>

        <section className="pos-panel pos-cart-panel">
          <div className="pos-cart-heading">
            <div className="pos-cart-title">
              <BilingualLabel en="Cart" bn="কার্ট" />
              <Badge variant="secondary">{cart.length}</Badge>
            </div>
            {cart.length > 0 ? (
              <Button
                onClick={() => setCart([])}
                size="sm"
                variant="ghost"
              >
                Clear Cart
              </Button>
            ) : null}
          </div>

          <div className="pos-cart-table-wrap">
            <table className="pos-cart-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th className="pos-number-column">Qty</th>
                  <th className="pos-number-column">Price (৳)</th>
                  <th className="pos-number-column">Total (৳)</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td className="pos-cart-empty" colSpan={6}>
                      Add a Product to start a sale.
                    </td>
                  </tr>
                ) : (
                  cart.flatMap((line) => {
                    const row = (
                      <tr key={line.product.variantId}>
                        <td>
                          <div className="pos-cart-product">
                            <span>{line.product.productName}</span>
                            <Button
                              aria-label={`${
                                line.showBreakdown ? 'Hide' : 'Show'
                              } lot price breakdown for ${
                                line.product.productName
                              }`}
                              onClick={() =>
                                setCart((lines) =>
                                  lines.map((item) =>
                                    item.product.variantId === line.product.variantId
                                      ? {
                                          ...item,
                                          showBreakdown:
                                            !item.showBreakdown,
                                        }
                                      : item,
                                  ),
                                )
                              }
                              size="icon-xs"
                              variant="ghost"
                            >
                              <Eye aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                        <td>
                          {line.product.unitSymbol ?? line.product.unitName}
                        </td>
                        <td className="pos-number-column">
                          <Input
                            aria-label={`Quantity for ${line.product.productName}`}
                            className="pos-cart-input pos-cart-qty"
                            inputMode="decimal"
                            onChange={(event) =>
                              void updateQuantity(
                                line.product.variantId,
                                event.target.value,
                              )
                            }
                            value={line.quantity}
                          />
                        </td>
                        <td className="pos-number-column">
                          <div className="pos-price-cell">
                            <Input
                              aria-label={`Selling price for ${line.product.productName}`}
                              className="pos-cart-input pos-cart-price"
                              inputMode="decimal"
                              onChange={(event) =>
                                changeSellingPrice(
                                  line.product.variantId,
                                  event,
                                )
                              }
                              readOnly={!canOverrideSellingPrice}
                              value={line.priceInput}
                            />
                            {line.manualUnitSellingPricePaisa ? (
                              <div className="pos-manual-price-note">
                                <span>Manual selling price</span>
                                <Button
                                  onClick={() =>
                                    resetLotPrice(line.product.variantId)
                                  }
                                  size="xs"
                                  variant="link"
                                >
                                  <RotateCcw aria-hidden="true" />
                                  Reset to Lot Price
                                </Button>
                              </div>
                            ) : null}
                            {line.error ? (
                              <span className="pos-line-error">
                                {line.error}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="pos-number-column">
                          ৳{formatPaisaToTaka(lineTotalPaisa(line))}
                        </td>
                        <td className="pos-actions-column">
                          <Button
                            aria-label={`Remove ${line.product.productName}`}
                            onClick={() =>
                              removeLine(line.product.variantId)
                            }
                            size="icon-xs"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    )

                    if (!line.showBreakdown) {
                      return [row]
                    }

                    const breakdown = (
                      <tr
                        className="pos-lot-breakdown-row"
                        key={`${line.product.variantId}-lots`}
                      >
                        <td colSpan={6}>
                          <div className="pos-lot-breakdown">
                            {line.quote.sellingSegments.map(
                              (allocation, index) => (
                                <span key={allocation.lotId}>
                                  {index > 0 ? ' + ' : ''}
                                  {formatNumber(allocation.baseQty, {
                                    maximumFractionDigits: 8,
                                  })}{' '}
                                  × ৳
                                  {formatPaisaToTaka(
                                    allocation.unitSellingPricePaisa,
                                  )}
                                </span>
                              ),
                            )}
                          </div>
                        </td>
                      </tr>
                    )

                    return [row, breakdown]
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pos-cart-footer">
            <Separator />
            <div className="pos-total-row">
              <span>Grand Total</span>
              <strong>৳{formatPaisaToTaka(cartTotalPaisa)}</strong>
            </div>
            <Button
              disabled={
                cart.length === 0 ||
                cart.some(
                  (line) =>
                    line.isQuoting ||
                    Boolean(line.error),
                ) ||
                saleMutation.isPending
              }
              onClick={() => saleMutation.mutate()}
            >
              {saleMutation.isPending
                ? 'Saving…'
                : 'Complete Sale'}
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
