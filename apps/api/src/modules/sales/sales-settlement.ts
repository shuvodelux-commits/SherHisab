import {
  SalesValidationError,
} from './sales.errors'
import type {
  SalesPaymentInput,
  SalesPaymentMethod,
  SalesSettlementStatus,
} from './sales.types'

export interface DiscountAllocation {
  grossAmountPaisa: string
  allocatedDiscountPaisa: string
  netAmountPaisa: string
}

export interface PlannedPayment {
  clientLineId: string
  method: SalesPaymentMethod
  accountId: string | null
  tenderedAmountPaisa: string
  appliedAmountPaisa: string
  reference: string
  note: string
}

export interface SettlementPlan {
  payments: PlannedPayment[]
  paidAmountPaisa: string
  duePaisa: string
  changePaisa: string
  status: SalesSettlementStatus
}

export function wholePaisa(
  raw: string,
  label: string,
  allowZero = true,
): bigint {
  const value = raw.trim()
  if (!/^\d+$/.test(value)) {
    throw new SalesValidationError(
      `${label} must be a non-negative whole paisa amount.`,
    )
  }
  const amount = BigInt(value)
  if (!allowZero && amount === 0n) {
    throw new SalesValidationError(`${label} must be greater than zero.`)
  }
  return amount
}

export function allocateHeaderDiscount(
  grossAmounts: string[],
  rawDiscount: string,
): DiscountAllocation[] {
  const gross = grossAmounts.map((value) =>
    wholePaisa(value, 'Line gross amount'),
  )
  const subtotal = gross.reduce((sum, value) => sum + value, 0n)
  const discount = wholePaisa(rawDiscount, 'Discount')

  if (discount > subtotal) {
    throw new SalesValidationError(
      'Discount cannot exceed the Invoice subtotal.',
    )
  }
  if (subtotal === 0n) {
    if (discount !== 0n) {
      throw new SalesValidationError(
        'Discount cannot make Grand Total negative.',
      )
    }
    return gross.map(() => ({
      grossAmountPaisa: '0',
      allocatedDiscountPaisa: '0',
      netAmountPaisa: '0',
    }))
  }

  const allocations = gross.map(
    (amount) => (discount * amount) / subtotal,
  )
  let remainder =
    discount - allocations.reduce((sum, value) => sum + value, 0n)

  for (let index = 0; remainder > 0n; index += 1) {
    allocations[index % allocations.length]! += 1n
    remainder -= 1n
  }

  return gross.map((amount, index) => {
    const allocated = allocations[index]!
    return {
      grossAmountPaisa: amount.toString(),
      allocatedDiscountPaisa: allocated.toString(),
      netAmountPaisa: (amount - allocated).toString(),
    }
  })
}

function normalizePayment(input: SalesPaymentInput): Omit<
  PlannedPayment,
  'appliedAmountPaisa'
> {
  const clientLineId = input.clientLineId.trim()
  if (!clientLineId) {
    throw new SalesValidationError('Payment clientLineId is required.')
  }
  const method = input.method
  if (
    method !== 'CASH' &&
    method !== 'BANK' &&
    method !== 'MOBILE_BANKING' &&
    method !== 'CUSTOMER_CREDIT'
  ) {
    throw new SalesValidationError('Unsupported payment method.')
  }

  return {
    clientLineId,
    method,
    accountId: input.accountId?.trim() || null,
    tenderedAmountPaisa: wholePaisa(
      input.amountPaisa,
      'Payment amount',
      false,
    ).toString(),
    reference: input.reference?.trim() ?? '',
    note: input.note?.trim() ?? '',
  }
}

export function planSettlement(
  rawPayments: SalesPaymentInput[],
  rawGrandTotal: string,
): SettlementPlan {
  const grandTotal = wholePaisa(rawGrandTotal, 'Grand Total')
  const normalized = rawPayments.map(normalizePayment)
  const ids = new Set<string>()
  for (const payment of normalized) {
    if (ids.has(payment.clientLineId)) {
      throw new SalesValidationError(
        'Payment clientLineId must be unique within the Invoice.',
      )
    }
    ids.add(payment.clientLineId)
  }

  const totalTendered = normalized.reduce(
    (sum, payment) => sum + BigInt(payment.tenderedAmountPaisa),
    0n,
  )
  const cashTendered = normalized
    .filter((payment) => payment.method === 'CASH')
    .reduce(
      (sum, payment) => sum + BigInt(payment.tenderedAmountPaisa),
      0n,
    )
  const change =
    totalTendered > grandTotal ? totalTendered - grandTotal : 0n

  if (change > cashTendered) {
    throw new SalesValidationError(
      'Overpayment requires enough Cash tender to return Change.',
    )
  }

  let remainingChange = change
  const payments: PlannedPayment[] = normalized.map((payment) => ({
    ...payment,
    appliedAmountPaisa: payment.tenderedAmountPaisa,
  }))

  for (let index = payments.length - 1; index >= 0 && remainingChange > 0n; index -= 1) {
    const payment = payments[index]!
    if (payment.method !== 'CASH') {
      continue
    }
    const tendered = BigInt(payment.tenderedAmountPaisa)
    const reduction = tendered < remainingChange ? tendered : remainingChange
    payment.appliedAmountPaisa = (tendered - reduction).toString()
    remainingChange -= reduction
  }

  const paid = payments.reduce(
    (sum, payment) => sum + BigInt(payment.appliedAmountPaisa),
    0n,
  )
  const due = grandTotal > paid ? grandTotal - paid : 0n
  const status: SalesSettlementStatus =
    paid === 0n ? 'DUE' : due > 0n ? 'PARTIAL' : 'PAID'

  return {
    payments,
    paidAmountPaisa: paid.toString(),
    duePaisa: due.toString(),
    changePaisa: change.toString(),
    status,
  }
}
