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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
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
  getPosProductByVariant,
  getSalesDraft,
  createSalesDraft,
  updateSalesDraft,
  postSalesDraft,
} from './pos-api'
import type {
  CommittedSaleDto,
  CommitSalePayload,
  PosPaymentLineDraft,
  PosLineQuoteDto,
  PosProductSearchDto,
  PosVendorSearchDto,
  SalesDraftDto,
  SalesDraftLineDto,
  SalesTemplateLineInputDto,
  SalesTemplateLoadedDto,
} from './pos-types'
import {
  cartReducer,
  cartLinesFromTemplate,
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
    reference: '',
    note: '',
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

type DraftMutationInput = Pick<
  SalesDraftDto,
  'customer' | 'discountPaisa' | 'payments' | 'note' | 'lines'
>

function sameDraftState(
  draft: SalesDraftDto,
  input: DraftMutationInput,
): boolean {
  const stableJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stableJson)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, stableJson(item)]),
      )
    }
    return value
  }
  return JSON.stringify(stableJson({
    customer: draft.customer,
    discountPaisa: draft.discountPaisa,
    payments: draft.payments,
    note: draft.note,
    lines: draft.lines,
  })) === JSON.stringify(stableJson(input))
}

function sameBaseQuantity(left: string, right: string): boolean {
  const canonical = (value: string) => {
    if (!/^\d+(?:\.\d+)?$/.test(value)) return null
    const [whole, fraction = ''] = value.split('.')
    const normalizedWhole = whole!.replace(/^0+(?=\d)/, '')
    const normalizedFraction = fraction.replace(/0+$/, '')
    return normalizedFraction
      ? `${normalizedWhole}.${normalizedFraction}`
      : normalizedWhole
  }
  const normalizedLeft = canonical(left)
  return normalizedLeft !== null && normalizedLeft === canonical(right)
}

function cartQuantity(quote: PosLineQuoteDto): string {
  return quote.conversion.snapshot || quote.conversion.fixedUnitSnapshot
    ? quote.baseQty
    : quote.displayQty
}

function lineQuantityInput(line: CartLineState) {
  if (line.fixedUnitInput) return { kind: 'FIXED_UNIT' as const, ...line.fixedUnitInput }
  const profile = line.quote.conversion.snapshot
  if (profile?.type === 'COMPOUND') return {
    kind: 'COMPONENTS' as const, profileId: profile.id,
    profileVersion: profile.version, components: line.conversionComponents,
  }
  return { kind: 'SIMPLE' as const, baseQty: line.quote.baseQty }
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
  const [discountInput, setDiscountInput] = useState('')
  const [saleNote, setSaleNote] = useState('')
  const [activeDraft, setActiveDraft] = useState<Pick<SalesDraftDto, 'id' | 'version'> | null>(null)
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
    mutationFn: async () => {
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
        discountPaisa: paymentAmountPaisa(discountInput),
        note: saleNote,
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
          quantityInput: lineQuantityInput(line),
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

      if (activeDraft) {
        const requestedDraft = buildDraftInput()
        let stored = await getSalesDraft(activeDraft.id)
        const isSameState = sameDraftState(stored, requestedDraft)
        if (
          stored.status !== 'POSTED' &&
          stored.version !== activeDraft.version &&
          !isSameState
        ) {
          throw new Error(`This draft changed elsewhere. Current version is ${stored.version}. Reload it before completing the sale.`)
        }
        if (stored.status !== 'POSTED' && !isSameState) {
          try {
            stored = await updateSalesDraft(
              activeDraft.id,
              activeDraft.version,
              requestedDraft,
            )
          } catch (error) {
            const latest = await getSalesDraft(activeDraft.id)
            if (!sameDraftState(latest, requestedDraft)) throw error
            stored = latest
          }
        }
        setActiveDraft({ id: stored.id, version: stored.version })
        return postSalesDraft(activeDraft.id, stored.version, {
          operationId: intent.operationId,
          businessDate: payload.businessDate,
        })
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
      setDiscountInput('')
      setSaleNote('')
      setActiveDraft(null)
      setSearch('')
      setSearchOpen(false)
      setActiveResultIndex(-1)
      setPageError('')
      setSaleMessage('Sale completed')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales-drafts'] }),
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

  const draftMutation = useMutation({
    mutationFn: () => {
      const input = buildDraftInput()
      return activeDraft
        ? updateSalesDraft(activeDraft.id, activeDraft.version, input)
        : createSalesDraft(input)
    },
    onSuccess: (draft) => {
      setActiveDraft({ id: draft.id, version: draft.version })
      setPageError('')
      setSaleMessage(`Draft ${draft.draftNumber} saved`)
      void queryClient.invalidateQueries({ queryKey: ['sales-drafts'] })
    },
    onError: (error) => {
      setSaleMessage('')
      setPageError(error instanceof Error ? error.message : 'Could not save the draft.')
    },
  })

  const products = productsQuery.data ?? []

  const cartTotalPaisa = sumPaisa(
    cart.map((line) => lineTotalPaisa(line)),
  )
  const grandTotalPaisa = (
    BigInt(cartTotalPaisa) > BigInt(paymentAmountPaisa(discountInput))
      ? BigInt(cartTotalPaisa) - BigInt(paymentAmountPaisa(discountInput))
      : 0n
  ).toString()

  const paidPaisa = sumPaisa(
    payments.map((payment) =>
      paymentAmountPaisa(payment.amountInput),
    ),
  )
  const duePaisa = (
    BigInt(grandTotalPaisa) > BigInt(paidPaisa)
      ? BigInt(grandTotalPaisa) - BigInt(paidPaisa)
      : 0n
  ).toString()

  function addPayment() {
    setPayments((current) => [...current, newPaymentLine()])
  }

  function buildDraftInput() {
    return {
      customer: {
        selectedCustomerId: customer.selectedCustomerId,
        name: customer.name,
        phone: customer.phone,
        guardianName: customer.guardianName,
        address: customer.address,
      },
      discountPaisa: paymentAmountPaisa(discountInput),
      payments: payments.map((payment) => ({
        clientLineId: payment.clientLineId,
        method: payment.method,
        accountId: payment.accountId,
        amountPaisa: paymentAmountPaisa(payment.amountInput),
        reference: payment.reference ?? '',
        note: payment.note ?? '',
      })),
      note: saleNote,
      lines: cart.map((line): SalesDraftLineDto => {
        const savedLine = line.savedDraftLine
        if (savedLine && !line.draftLineEdited) {
          return savedLine
        }
        const quantityInput = lineQuantityInput(line)
        let shortageResolution: SalesDraftLineDto['shortageResolution'] = null
        if (line.shortageResolution === 'NEGATIVE_STOCK') {
          shortageResolution = { type: 'NEGATIVE_STOCK' }
        } else if (line.shortageResolution === 'VENDOR' && line.vendorId) {
          shortageResolution = {
            type: 'VENDOR',
            vendorId: line.vendorId,
            unitCostPaisa: paymentAmountPaisa(line.vendorUnitCostInput),
          }
        }
        return {
          ...(savedLine ?? {}),
          variantId: line.product.variantId,
          quantityInput,
          normalizedQuantitySnapshot: line.quote.conversion,
          pricingMode: line.manualUnitSellingPricePaisa ? 'MANUAL' : 'AUTO',
          manualUnitSellingPricePaisa: line.manualUnitSellingPricePaisa,
          shortageResolution,
          serialIds: savedLine?.serialIds ?? [],
          batchSelection: savedLine?.batchSelection ?? null,
          warrantySnapshot: savedLine?.warrantySnapshot ?? null,
          captureValues: savedLine?.captureValues ?? {},
        }
      }),
    }
  }

  async function openDraft(draftId: string) {
    try {
      const draft = await getSalesDraft(draftId)
      const restoredLines = await Promise.all(draft.lines.map(async (savedLine) => {
        const product = await getPosProductByVariant(savedLine.variantId)
        let conversionError = ''
        let currentConversionProfile: CartLineState['currentConversionProfile']
        let currentFixedUnitQuote: CartLineState['currentFixedUnitQuote']
        let quote: PosLineQuoteDto
        try {
          // Validate the stored components against the current Product profile.
          quote = await quoteSaleLine(
            savedLine.variantId,
            savedLine.quantityInput.kind === 'SIMPLE'
              ? savedLine.quantityInput.baseQty
              : undefined,
            savedLine.quantityInput.kind === 'COMPONENTS' || savedLine.quantityInput.kind === 'FIXED_UNIT'
              ? savedLine.quantityInput
              : undefined,
          )
          if (savedLine.quantityInput.kind === 'FIXED_UNIT') {
            const saved = savedLine.normalizedQuantitySnapshot.fixedUnitSnapshot
            const current = quote.conversion.fixedUnitSnapshot
            if (!saved || !current ||
                saved.conversionToBase !== current.conversionToBase ||
                !sameBaseQuantity(savedLine.normalizedQuantitySnapshot.baseQty, quote.baseQty) ||
                !sameBaseQuantity(savedLine.normalizedQuantitySnapshot.pricingQty, quote.pricingQty)) {
              currentFixedUnitQuote = quote
              conversionError = 'Draft fixed-unit conversion ratio changed. Use the current unit ratio to correct it.'
              const historical = await quoteSaleLine(savedLine.variantId, savedLine.normalizedQuantitySnapshot.baseQty)
              quote = { ...historical, conversion: savedLine.normalizedQuantitySnapshot,
                fixedUnitOptions: currentFixedUnitQuote.fixedUnitOptions }
            }
          }
        } catch (error) {
          if (savedLine.quantityInput.kind === 'SIMPLE') throw error
          conversionError = error instanceof Error
            ? error.message
            : 'Conversion profile changed. Review this quantity before posting.'
          // Keep the old component snapshot visible and block posting. The
          // fallback quote only paints the last normalized base quantity.
          const fallback = await quoteSaleLine(
            savedLine.variantId,
            savedLine.normalizedQuantitySnapshot.baseQty,
          )
          quote = {
            ...fallback,
            conversion: savedLine.normalizedQuantitySnapshot,
          }
        }
        if (savedLine.quantityInput.kind === 'COMPONENTS') {
          try {
            const activeQuote = await quoteSaleLine(
              savedLine.variantId,
              savedLine.normalizedQuantitySnapshot.baseQty,
            )
            const activeProfile = activeQuote.conversion.snapshot
            if (!activeProfile || activeProfile.productId !== product.productId) {
              throw new Error('Draft conversion profile is no longer compatible with this Product.')
            }
            currentConversionProfile = activeProfile
            if (activeProfile.id !== savedLine.quantityInput.profileId ||
                activeProfile.version !== savedLine.quantityInput.profileVersion) {
              conversionError ||= 'Draft conversion profile changed. Review quantity details under the current profile.'
            }
            const currentQuote = await quoteSaleLine(
              savedLine.variantId,
              undefined,
              {
                kind: 'COMPONENTS',
                profileId: activeProfile.id,
                profileVersion: activeProfile.version,
                components: savedLine.quantityInput.components,
              },
            )
            if (!sameBaseQuantity(
              currentQuote.conversion.baseQty,
              savedLine.normalizedQuantitySnapshot.baseQty,
            )) {
              throw new Error('Draft conversion changed; reload the Draft and review its quantity before posting.')
            }
            if (!conversionError) currentConversionProfile = undefined
          } catch (error) {
            conversionError ||= error instanceof Error
              ? error.message
              : 'Draft conversion components are no longer compatible with this Product.'
          }
        }
        const vendor = savedLine.shortageResolution?.type === 'VENDOR'
          ? savedLine.shortageResolution
          : null
        return {
          product,
          quantity: cartQuantity(quote),
          quote,
          priceInput: formatPaisaToTaka(
            savedLine.manualUnitSellingPricePaisa ?? quote.effectiveUnitSellingPricePaisa,
          ),
          manualUnitSellingPricePaisa: savedLine.manualUnitSellingPricePaisa,
          showBreakdown: false,
          conversionExpanded: false,
          conversionComponents: { ...savedLine.normalizedQuantitySnapshot.components },
          ...(savedLine.quantityInput.kind === 'FIXED_UNIT' ? {
            fixedUnitInput: {
              unitId: savedLine.quantityInput.unitId,
              quantity: savedLine.quantityInput.quantity,
            },
          } : {}),
          shortageResolution: savedLine.shortageResolution?.type ?? null,
          vendorId: vendor?.vendorId ?? null,
          vendorName: '',
          vendorUnitCostInput: vendor ? formatPaisaToTaka(vendor.unitCostPaisa) : '',
          isQuoting: false,
          error: conversionError,
          currentConversionProfile,
          currentFixedUnitQuote,
          savedDraftLine: savedLine,
        }
      }))
      setCart(restoredLines)
      setCustomer({
        ...emptyCustomerDraft(),
        selectedCustomerId: draft.customer.selectedCustomerId,
        name: draft.customer.name,
        phone: draft.customer.phone,
        guardianName: draft.customer.guardianName,
        address: draft.customer.address,
      })
      setPayments(draft.payments.map((payment) => ({
        clientLineId: payment.clientLineId,
        method: payment.method,
        accountId: payment.accountId,
        amountInput: formatPaisaToTaka(payment.amountPaisa),
        reference: payment.reference,
        note: payment.note,
      })))
      setDiscountInput(formatPaisaToTaka(draft.discountPaisa))
      setSaleNote(draft.note)
      setActiveDraft({ id: draft.id, version: draft.version })
      setCompletedSale(null)
      setPageError('')
      setSaleMessage(`Loaded ${draft.draftNumber} into POS`)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not load the draft.')
    }
  }

  function loadTemplate(template: SalesTemplateLoadedDto) {
    setCart(cartLinesFromTemplate(template))
    setCustomer(emptyCustomerDraft())
    setPayments([newPaymentLine()])
    setDiscountInput('')
    setSaleNote('')
    setActiveDraft(null)
    setCompletedSale(null)
    submissionIntentRef.current = null
    setSearch('')
    setSearchOpen(false)
    setActiveResultIndex(-1)
    setPageError('')
    setSaleMessage(`Loaded ${template.name} into a new cart`)
  }

  const currentTemplateLines: SalesTemplateLineInputDto[] = cart.map((line) => ({
    variantId: line.product.variantId,
    productName: line.product.productName,
    variantName: line.product.variantName,
    quantityInput: lineQuantityInput(line),
    pricingStrategy: 'CURRENT_AUTO',
    ...(line.manualUnitSellingPricePaisa
      ? { manualUnitSellingPricePaisa: line.manualUnitSellingPricePaisa }
      : {}),
  }))

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
          quantity: cartQuantity(quote),
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
              draftLineEdited: true,
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
            quantity: cartQuantity(quote),
            conversionComponents: quote.conversion.components,
            draftLineEdited: true,
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

  async function updateFixedUnitInput(
    variantId: string,
    patch: Partial<{ unitId: string; quantity: string }>,
  ) {
    const target = cart.find((line) => line.product.variantId === variantId)
    if (!target) return
    const entered = {
      unitId: target.fixedUnitInput?.unitId ?? '',
      quantity: target.fixedUnitInput?.quantity ?? '1',
      ...patch,
    }
    setCart((lines) => lines.map((line) => line.product.variantId === variantId
      ? { ...line, fixedUnitInput: entered.unitId ? entered : undefined, draftLineEdited: true, isQuoting: true, error: '' }
      : line))
    try {
      const quote = entered.unitId
        ? await quoteSaleLine(variantId, undefined, { kind: 'FIXED_UNIT', ...entered })
        : await quoteSaleLine(variantId, entered.quantity)
      setCart((lines) => lines.map((line) => line.product.variantId === variantId
        ? { ...line, quote, quantity: cartQuantity(quote), isQuoting: false,
            priceInput: line.manualUnitSellingPricePaisa ? line.priceInput
              : formatPaisaToTaka(quote.effectiveUnitSellingPricePaisa), error: '' }
        : line))
    } catch (error) {
      setCart((lines) => lines.map((line) => line.product.variantId === variantId
        ? { ...line, isQuoting: false, error: error instanceof Error ? error.message : 'Could not quote this unit.' }
        : line))
    }
  }

  async function adoptCurrentConversionProfile(variantId: string) {
    const target = cart.find((line) => line.product.variantId === variantId)
    if (!target?.currentConversionProfile) return
    setCart((lines) => lines.map((line) => line.product.variantId === variantId
      ? { ...line, isQuoting: true }
      : line))
    try {
      const active = await quoteSaleLine(variantId, target.quote.baseQty)
      const profile = active.conversion.snapshot
      if (!profile || profile.type !== 'COMPOUND' || profile.productId !== target.product.productId) {
        throw new Error('Current conversion profile is unavailable. Reload the Draft.')
      }
      const components = Object.fromEntries(
        profile.components.map(({ key }) => [
          key,
          target.conversionComponents[key] ?? '0',
        ]),
      )
      try {
        const quote = await quoteSaleLine(variantId, undefined, {
          kind: 'COMPONENTS', profileId: profile.id,
          profileVersion: profile.version, components,
        })
        setCart((lines) => lines.map((line) => line.product.variantId === variantId
          ? { ...line, quote, quantity: cartQuantity(quote),
              conversionComponents: quote.conversion.components,
              currentConversionProfile: undefined, draftLineEdited: true,
              conversionExpanded: true, isQuoting: false, error: '' }
          : line))
      } catch {
        // Keep the entered components visible while the cashier corrects them.
        setCart((lines) => lines.map((line) => line.product.variantId === variantId
          ? { ...line, quote: { ...line.quote, conversion: { ...line.quote.conversion, snapshot: profile } },
              conversionComponents: components,
              currentConversionProfile: undefined, conversionExpanded: true,
              isQuoting: false, error: 'Review quantity details under the current conversion profile.' }
          : line))
      }
    } catch (error) {
      setCart((lines) => lines.map((line) => line.product.variantId === variantId
        ? { ...line, isQuoting: false, error: error instanceof Error ? error.message : 'Could not load current conversion profile.' }
        : line))
    }
  }

  function adoptCurrentFixedUnitRatio(variantId: string) {
    setCart((lines) => lines.map((line) => {
      if (line.product.variantId !== variantId || !line.currentFixedUnitQuote) return line
      const quote = line.currentFixedUnitQuote
      return { ...line, quote, quantity: cartQuantity(quote), currentFixedUnitQuote: undefined,
        draftLineEdited: true, conversionExpanded: true, error: '' }
    }))
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
              draftLineEdited: true,
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
            draftLineEdited: true,
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
              draftLineEdited: true,
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
              draftLineEdited: true,
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
              draftLineEdited: true,
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
            draftLineEdited: true,
            error: '',
          }
        } catch {
          return {
            ...line,
            priceInput: value,
            manualUnitSellingPricePaisa: null,
            draftLineEdited: true,
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
        onOpenDraft={(draftId) => void openDraft(draftId)}
        onLoadTemplate={loadTemplate}
        canViewTemplates={sessionQuery.data?.permissions.includes('SALES_TEMPLATE_VIEW') ?? false}
        canManageTemplates={sessionQuery.data?.permissions.includes('SALES_TEMPLATE_MANAGE') ?? false}
        canOverrideSellingPrice={canOverrideSellingPrice}
        cartHasLines={cart.length > 0}
        currentTemplateLines={currentTemplateLines}
        onArchiveDraft={(draftId) => {
          if (activeDraft?.id === draftId) {
            setActiveDraft(null)
            submissionIntentRef.current = null
          }
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
                                'COMPOUND' || Boolean(line.fixedUnitInput)
                              }
                              value={line.quantity}
                            />
                            {line.quote.conversion.snapshot?.type === 'COMPOUND' ||
                              Boolean(line.quote.fixedUnitOptions?.length) ||
                              Boolean(line.fixedUnitInput) ? (
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
                            {line.currentConversionProfile ? (
                              <Button
                                aria-label={`Use current conversion profile for ${line.product.productName}`}
                                disabled={line.isQuoting}
                                onClick={() => void adoptCurrentConversionProfile(line.product.variantId)}
                                size="xs"
                                type="button"
                                variant="link"
                              >
                                Use current conversion profile
                              </Button>
                            ) : null}
                            {line.currentFixedUnitQuote ? (
                              <Button aria-label={`Use current unit ratio for ${line.product.productName}`}
                                onClick={() => adoptCurrentFixedUnitRatio(line.product.variantId)}
                                size="xs" type="button" variant="link">
                                Use current unit ratio
                              </Button>
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

                    if (line.conversionExpanded && conversionProfile?.type !== 'COMPOUND' &&
                        (line.quote.fixedUnitOptions?.length || line.fixedUnitInput)) {
                      detailRows.push(
                        <tr aria-label={`Quantity details for ${line.product.productName}`}
                          className="pos-conversion-row" key={`${line.product.variantId}-fixed-unit`}>
                          <td colSpan={6}>
                            <div className="pos-conversion-editor">
                              <label className="pos-conversion-field">
                                <span>Unit</span>
                                <Select value={line.fixedUnitInput?.unitId || '__base__'}
                                  onValueChange={(value) => { if (value) void updateFixedUnitInput(line.product.variantId, { unitId: value === '__base__' ? '' : value }) }}>
                                  <SelectTrigger aria-label={`Unit for ${line.product.productName}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__base__">{line.product.unitName}</SelectItem>
                                    {line.quote.fixedUnitOptions?.map((unit) => (
                                      <SelectItem key={unit.unitId} value={unit.unitId}>{unit.unitName}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>
                              <label className="pos-conversion-field">
                                <span>Entered quantity</span>
                                <Input aria-label={`Entered quantity for ${line.product.productName}`}
                                  inputMode="decimal" value={line.fixedUnitInput?.quantity ?? '1'}
                                  onChange={(event) => void updateFixedUnitInput(line.product.variantId, { quantity: event.target.value })} />
                              </label>
                            </div>
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
            <div className="pos-draft-fields">
              <Input
                aria-label="Discount"
                inputMode="decimal"
                onChange={(event) => setDiscountInput(event.target.value)}
                placeholder="0.00"
                value={discountInput}
              />
              <Input
                aria-label="Sale note"
                onChange={(event) => setSaleNote(event.target.value)}
                placeholder="Sale note"
                value={saleNote}
              />
            </div>
            <CheckoutSummary
              duePaisa={duePaisa}
              grandTotalPaisa={grandTotalPaisa}
              paidPaisa={paidPaisa}
            />
            <Button
              disabled={draftMutation.isPending || cart.length === 0}
              onClick={() => draftMutation.mutate()}
              type="button"
              variant="outline"
            >
              {draftMutation.isPending
                ? 'Saving Draft…'
                : activeDraft
                  ? 'Update Draft'
                  : 'Save Draft'}
            </Button>
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
