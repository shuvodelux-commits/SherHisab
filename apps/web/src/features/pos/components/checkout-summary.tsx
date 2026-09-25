import { formatPaisaToTaka } from '../../../lib/money'

interface CheckoutSummaryProps {
  duePaisa: string
  grandTotalPaisa: string
  paidPaisa: string
}

export function CheckoutSummary({
  duePaisa,
  grandTotalPaisa,
  paidPaisa,
}: CheckoutSummaryProps) {
  return (
    <div className="pos-checkout-summary">
      <div className="pos-total-row">
        <span>Grand Total</span>
        <strong>৳{formatPaisaToTaka(grandTotalPaisa)}</strong>
      </div>
      <div className="pos-settlement-row">
        <span>Paid ৳{formatPaisaToTaka(paidPaisa)}</span>
        <span>Due ৳{formatPaisaToTaka(duePaisa)}</span>
      </div>
    </div>
  )
}
