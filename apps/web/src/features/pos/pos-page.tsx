import {
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type SetStateAction,
} from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  RotateCcw,
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
  getPosBootstrap,
  quoteSaleLine,
  searchPosProducts,
} from './pos-api'
import type {
  CommittedSaleDto,
  CommitSalePayload,
  PosPaymentLineDraft,
  PosProductSearchDto,
  PosVendorSearchDto,
} from './pos-types'
import {
  cartReducer,
  type CartLineState,
} from './pos-state'
import {
  CustomerPanel,
  type PosCustomerDraft,
} from './components/customer-panel'
import { CheckoutSummary } from './components/checkout-summary'
import { Cart } from './components/cart'
import { CartLine } from './components/cart-line'
import { ConversionEditor } from './components/conversion-editor'
import { CostReveal } from './components/cost-reveal'
import { InvoiceResult } from './components/invoice-result'
import { PaymentLines } from './components/payment-lines'
import { ProductCatalog } from './components/product-catalog'
import { ShortageResolution } from './components/shortage-resolution'


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
        line.quote.pricingQty,
        line.manualUnitSellingPricePaisa,
      )
    : line.quote.automaticSalesTotalPaisa
}

let fallbackPaymentId = 0

function newPaymentLine(): PosPaymentLineDraft {
  fallbackPaymentId += 1
  const clientLineId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `payment-${fallbackPaymentId}`

  return {
    clientLineId,
    method: 'CASH',
    accountId: null,
    amountInput: '',
  }
}

function paymentAmountPaisa(value: string): string {
  if (!value.trim()) {
    return '0'
  }

  try {
    return parseTakaToPaisa(value)
  } catch {
    return '0'
  }
}

function emptyCustomerDraft(): PosCustomerDraft {
  return {
    selectedCustomerId: null,
    selectedCustomerCode: null,
    name: '',
    phone: '',
    guardianName: '',
    address: '',
    balancePaisa: null,
  }
}

function newOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Secure random UUID is unavailable.')
  }

  return globalThis.crypto.randomUUID()
}

export function PosPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(-1)
  const [cart, dispatchCart] = useReducer(cartReducer, [])
  function setCart(value: SetStateAction<CartLineState[]>) {
    dispatchCart({ type: 'set', value })
  }
  const [customer, setCustomer] = useState<PosCustomerDraft>(
    emptyCustomerDraft,
  )
  const [payments, setPayments] = useState<PosPaymentLineDraft[]>(
    () => [newPaymentLine()],
  )
  const [completedSale, setCompletedSale] =
    useState<CommittedSaleDto | null>(null)
  const submissionIntentRef = useRef<{
    fingerprint: string
    operationId: string
  } | null>(null)
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

  const bootstrapQuery = useQuery({
    queryKey: ['pos-bootstrap'],
    queryFn: getPosBootstrap,
  })

  const normalizedSearch = search.trim()
  const productsQuery = useQuery({
    queryKey: ['pos-products', normalizedSearch],
    queryFn: () => searchPosProducts(normalizedSearch, 20),
    enabled: normalizedSearch.length > 0,
  })

  const saleMutation = useMutation({
    mutationFn: () => {
      const committedPayments = payments.flatMap((payment) => {
        const amountPaisa = paymentAmountPaisa(payment.amountInput)
        if (BigInt(amountPaisa) <= 0n) {
          return []
        }

        return [
          {
            clientLineId: payment.clientLineId,
            method: payment.method,
            ...(payment.accountId
              ? { accountId: payment.accountId }
              : {}),
            amountPaisa,
          },
        ]
      })

      const payload: CommitSalePayload = {
        businessDate: todayLocalDate(),
        ...(committedPayments.length > 0
          ? {
              customer: {
                ...(customer.selectedCustomerId
                  ? {
                      selectedCustomerId:
                        customer.selectedCustomerId,
                    }
                  : {}),
                name: customer.name,
                phone: customer.phone,
                guardianName: customer.guardianName,
                address: customer.address,
              },
              payments: committedPayments,
            }
          : {}),
        lines: cart.map((line) => ({
          variantId: line.product.variantId,
          baseQty: line.quote.baseQty,
          ...(line.manualUnitSellingPricePaisa
            ? {
                manualUnitSellingPricePaisa:
                  line.manualUnitSellingPricePaisa,
              }
            : {}),
          ...(line.shortageResolution === 'NEGATIVE_STOCK'
            ? {
                shortageResolution: {
                  type: 'NEGATIVE_STOCK' as const,
                },
              }
            : line.shortageResolution === 'VENDOR' &&
                line.vendorId &&
                line.vendorUnitCostInput.trim()
              ? {
                  shortageResolution: {
                    type: 'VENDOR' as const,
                    vendorId: line.vendorId,
                    unitCostPaisa: parseTakaToPaisa(
                      line.vendorUnitCostInput,
                    ),
                  },
                }
              : {}),
        })),
      }

      const fingerprint = JSON.stringify(payload)
      let intent = submissionIntentRef.current

      if (!intent || intent.fingerprint !== fingerprint) {
        intent = {
          fingerprint,
          operationId: newOperationId(),
        }
        submissionIntentRef.current = intent
      }

      return commitSale({
        ...payload,
        operationId: intent.operationId,
      })
    },
    onSuccess: async (sale) => {
      submissionIntentRef.current = null
      setCompletedSale(sale)
      setCart([])
      setCustomer(emptyCustomerDraft())
      setPayments([newPaymentLine()])
      setSearch('')
      setSearchOpen(false)
      setActiveResultIndex(-1)
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

  const paidPaisa = sumPaisa(
    payments.map((payment) =>
      paymentAmountPaisa(payment.amountInput),
    ),
  )
  const duePaisa = (
    BigInt(cartTotalPaisa) > BigInt(paidPaisa)
      ? BigInt(cartTotalPaisa) - BigInt(paidPaisa)
      : 0n
  ).toString()

  function addPayment() {
    setPayments((current) => [...current, newPaymentLine()])
  }

  function changePayment(
    clientLineId: string,
    patch: Partial<PosPaymentLineDraft>,
  ) {
    setPayments((current) =>
      current.map((payment) =>
        payment.clientLineId === clientLineId
          ? { ...payment, ...patch }
          : payment,
      ),
    )
  }

  function removePayment(clientLineId: string) {
    setPayments((current) =>
      current.filter(
        (payment) => payment.clientLineId !== clientLineId,
      ),
    )
  }

  function changeProductSearch(value: string) {
    setSearch(value)
    setSearchOpen(value.trim().length > 0)
    setActiveResultIndex(-1)
  }

  function clearProductSearch() {
    setSearch('')
    setSearchOpen(false)
    setActiveResultIndex(-1)
  }

  function handleProductSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setSearchOpen(false)
      setActiveResultIndex(-1)
      return
    }

    if (products.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSearchOpen(true)
      setActiveResultIndex((current) =>
        current < products.length - 1 ? current + 1 : 0,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSearchOpen(true)
      setActiveResultIndex((current) =>
        current <= 0 ? products.length - 1 : current - 1,
      )
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const target =
        products[activeResultIndex >= 0 ? activeResultIndex : 0]
      if (target) {
        setSearchOpen(false)
        setActiveResultIndex(-1)
        void addProduct(target)
      }
    }
  }

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
          quantity: quote.displayQty,
          quote,
          priceInput: formatPaisaToTaka(
            quote.effectiveUnitSellingPricePaisa,
          ),
          manualUnitSellingPricePaisa: null,
          showBreakdown: false,
          conversionExpanded: false,
          conversionComponents: quote.conversion.components,
          shortageResolution: null,
          vendorId: null,
          vendorName: '',
          vendorUnitCostInput: '',
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

  async function updateConversionComponent(
    variantId: string,
    key: string,
    value: string,
  ) {
    const target = cart.find(
      (line) => line.product.variantId === variantId,
    )
    const profile = target?.quote.conversion.snapshot

    if (!target || !profile || profile.type !== 'COMPOUND') {
      return
    }

    const components = {
      ...target.conversionComponents,
      [key]: value,
    }

    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === variantId
          ? {
              ...line,
              conversionComponents: components,
              isQuoting: true,
              error: '',
            }
          : line,
      ),
    )

    try {
      const quote = await quoteSaleLine(
        target.product.variantId,
        undefined,
        {
          kind: 'COMPONENTS',
          profileId: profile.id,
          profileVersion: profile.version,
          components,
        },
      )

      setCart((lines) =>
        lines.map((line) => {
          if (line.product.variantId !== variantId) {
            return line
          }

          return {
            ...line,
            quote,
            quantity: quote.displayQty,
            conversionComponents: quote.conversion.components,
            ...(Number(quote.shortfallBaseQty) <= 0
              ? {
                  shortageResolution: null,
                  vendorId: null,
                  vendorName: '',
                  vendorUnitCostInput: '',
                }
              : {}),
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
          line.product.variantId === variantId
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

  function toggleConversionEditor(variantId: string) {
    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === variantId
          ? {
              ...line,
              conversionExpanded: !line.conversionExpanded,
            }
          : line,
      ),
    )
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
            ...(Number(quote.shortfallBaseQty) <= 0
              ? {
                  shortageResolution: null,
                  vendorId: null,
                  vendorName: '',
                  vendorUnitCostInput: '',
                }
              : {}),
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

  async function chooseOwnStock(variantId: string) {
    const target = cart.find(
      (line) => line.product.variantId === variantId,
    )
    if (!target) {
      return
    }

    const ownBaseQty = target.quote.availableOwnBaseQty
    if (Number(ownBaseQty) <= 0) {
      setCart((lines) =>
        lines.filter(
          (line) => line.product.variantId !== variantId,
        ),
      )
      setPageError('No own stock available. Product removed from cart.')
      return
    }

    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === variantId
          ? {
              ...line,
              shortageResolution: null,
              vendorId: null,
              vendorName: '',
              vendorUnitCostInput: '',
            }
          : line,
      ),
    )
    await updateQuantity(variantId, ownBaseQty)
  }

  function chooseShortageResolution(
    variantId: string,
    resolution: 'VENDOR' | 'NEGATIVE_STOCK',
  ) {
    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === variantId
          ? {
              ...line,
              shortageResolution: resolution,
              ...(resolution === 'NEGATIVE_STOCK'
                ? {
                    vendorId: null,
                    vendorName: '',
                    vendorUnitCostInput: '',
                  }
                : {}),
            }
          : line,
      ),
    )
  }

  function selectShortageVendor(
    variantId: string,
    vendor: PosVendorSearchDto,
  ) {
    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === variantId
          ? {
              ...line,
              vendorId: vendor.id || null,
              vendorName: vendor.name,
            }
          : line,
      ),
    )
  }

  function changeVendorUnitCost(
    variantId: string,
    value: string,
  ) {
    setCart((lines) =>
      lines.map((line) =>
        line.product.variantId === variantId
          ? {
              ...line,
              vendorUnitCostInput: value,
            }
          : line,
      ),
    )
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
      {completedSale ? <InvoiceResult sale={completedSale} /> : null}

      <div className="pos-workspace">
        <ProductCatalog
          activeResultIndex={activeResultIndex}
          errorMessage={
            productsQuery.isError
              ? productsQuery.error.message
              : ''
          }
          isOpen={searchOpen}
          isPending={productsQuery.isPending}
          onAdd={(product) => {
            setSearchOpen(false)
            setActiveResultIndex(-1)
            void addProduct(product)
          }}
          onClear={clearProductSearch}
          onKeyDown={handleProductSearchKeyDown}
          onSearchChange={changeProductSearch}
          products={products}
          search={search}
        />

        <Cart>
          <CustomerPanel
            onChange={setCustomer}
            value={customer}
          />
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
                      <CartLine key={line.product.variantId}>
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
                            <CostReveal
                              productName={line.product.productName}
                              purchasePricePaisa={
                                line.product.configuredPurchasePricePaisa
                              }
                            />
                          </div>
                        </td>
                        <td>
                          {line.product.unitSymbol ?? line.product.unitName}
                        </td>
                        <td className="pos-number-column">
                          <div className="pos-qty-cell">
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
                              readOnly={
                                line.quote.conversion.snapshot?.type ===
                                'COMPOUND'
                              }
                              value={line.quantity}
                            />
                            {line.quote.conversion.snapshot?.type ===
                            'COMPOUND' ? (
                              <Button
                                aria-label={`Edit quantity details for ${line.product.productName}`}
                                onClick={() =>
                                  toggleConversionEditor(
                                    line.product.variantId,
                                  )
                                }
                                size="icon-xs"
                                type="button"
                                variant="ghost"
                              >
                                {line.conversionExpanded ? (
                                  <ChevronDown aria-hidden="true" />
                                ) : (
                                  <ChevronRight aria-hidden="true" />
                                )}
                              </Button>
                            ) : null}
                          </div>
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
                      </CartLine>
                    )

                    const detailRows = [row]
                    const conversionProfile =
                      line.quote.conversion.snapshot

                    if (
                      line.conversionExpanded &&
                      conversionProfile?.type === 'COMPOUND'
                    ) {
                      detailRows.push(
                        <tr
                          aria-label={`Quantity details for ${line.product.productName}`}
                          className="pos-conversion-row"
                          key={`${line.product.variantId}-conversion`}
                        >
                          <td colSpan={6}>
                            <ConversionEditor
                              disabled={line.isQuoting}
                              onChange={(key, value) =>
                                void updateConversionComponent(
                                  line.product.variantId,
                                  key,
                                  value,
                                )
                              }
                              productName={line.product.productName}
                              profile={conversionProfile}
                              values={line.conversionComponents}
                            />
                          </td>
                        </tr>,
                      )
                    }

                    if (Number(line.quote.shortfallBaseQty) > 0) {
                      const vendorTotalPaisa = (() => {
                        try {
                          const vendorCostPaisa =
                            line.vendorUnitCostInput.trim()
                              ? parseTakaToPaisa(
                                  line.vendorUnitCostInput,
                                )
                              : '0'
                          return quantityTimesPaisa(
                            line.quote.shortfallBaseQty,
                            vendorCostPaisa,
                          )
                        } catch {
                          return '0'
                        }
                      })()

                      detailRows.push(
                        <tr
                          aria-label={`Shortage resolution for ${line.product.productName}`}
                          className="pos-shortage-row"
                          key={`${line.product.variantId}-shortage`}
                        >
                          <td colSpan={6}>
                            <ShortageResolution
                              onOwnStock={() =>
                                void chooseOwnStock(
                                  line.product.variantId,
                                )
                              }
                              onResolutionChange={(resolution) =>
                                chooseShortageResolution(
                                  line.product.variantId,
                                  resolution,
                                )
                              }
                              onVendorCostChange={(value) =>
                                changeVendorUnitCost(
                                  line.product.variantId,
                                  value,
                                )
                              }
                              onVendorSelect={(vendor) =>
                                selectShortageVendor(
                                  line.product.variantId,
                                  vendor,
                                )
                              }
                              ownBaseQty={
                                line.quote.availableOwnBaseQty
                              }
                              productName={line.product.productName}
                              resolution={line.shortageResolution}
                              shortfallBaseQty={
                                line.quote.shortfallBaseQty
                              }
                              unitLabel={
                                line.product.unitSymbol ??
                                line.product.unitName
                              }
                              vendorId={line.vendorId}
                              vendorName={line.vendorName}
                              vendorTotalPaisa={vendorTotalPaisa}
                              vendorUnitCostInput={
                                line.vendorUnitCostInput
                              }
                            />
                          </td>
                        </tr>,
                      )
                    }

                    if (line.showBreakdown) {
                      detailRows.push(
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
                        </tr>,
                      )
                    }

                    return detailRows
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pos-cart-footer">
            <Separator />
            <PaymentLines
              accounts={bootstrapQuery.data?.financialAccounts ?? []}
              lines={payments}
              onAdd={addPayment}
              onChange={changePayment}
              onRemove={removePayment}
            />
            <CheckoutSummary
              duePaisa={duePaisa}
              grandTotalPaisa={cartTotalPaisa}
              paidPaisa={paidPaisa}
            />
            <Button
              disabled={
                cart.length === 0 ||
                cart.some(
                  (line) =>
                    line.isQuoting ||
                    Boolean(line.error) ||
                    (Number(line.quote.shortfallBaseQty) > 0 &&
                      (line.shortageResolution === null ||
                        (line.shortageResolution === 'VENDOR' &&
                          (!line.vendorId ||
                            !line.vendorUnitCostInput.trim())))),
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
        </Cart>
      </div>
    </main>
  )
}
