import { formatPaisaToTaka } from '../../../lib/money'
import type { CommittedSaleDto } from '../pos-types'

interface InvoiceResultProps {
  sale: CommittedSaleDto
}

export function InvoiceResult({ sale }: InvoiceResultProps) {
  const totalPaisa =
    sale.grandTotalPaisa ?? sale.totalSalesPaisa
  const paidPaisa =
    sale.paidAmountPaisa ?? sale.totalSalesPaisa
  const duePaisa = sale.duePaisa ?? '0'

  return (
    <section
      aria-label={`Invoice ${sale.invoiceNumber}`}
      className="pos-invoice-result"
    >
      <strong>Invoice {sale.invoiceNumber}</strong>
      <span>Total ৳{formatPaisaToTaka(totalPaisa)}</span>
      <span>Paid ৳{formatPaisaToTaka(paidPaisa)}</span>
      <span>Due ৳{formatPaisaToTaka(duePaisa)}</span>
    </section>
  )
}
