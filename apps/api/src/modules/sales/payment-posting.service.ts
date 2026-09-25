import type { DatabaseClient } from '../../db/request-database'
import { FinanceRepository } from '../finance/finance.repository'
import type { CustomerRecord } from '../customers/customer.types'
import {
  SalesValidationError,
} from './sales.errors'
import type { PlannedPayment } from './sales-settlement'

export interface PreparedPayment extends PlannedPayment {
  cashSessionId: string | null
}

export class PaymentPostingService {
  private readonly finance: FinanceRepository

  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient,
  ) {
    this.finance = new FinanceRepository(database)
  }

  async prepare(
    payments: PlannedPayment[],
    customer: CustomerRecord | null,
  ): Promise<PreparedPayment[]> {
    const creditApplied = payments
      .filter((payment) => payment.method === 'CUSTOMER_CREDIT')
      .reduce(
        (sum, payment) => sum + BigInt(payment.appliedAmountPaisa),
        0n,
      )

    if (creditApplied > 0n) {
      if (!customer) {
        throw new SalesValidationError(
          'Customer Credit requires a resolved Customer.',
        )
      }
      const balance = await this.database.query<{ balance: string }>(
        `SELECT COALESCE(SUM(amount_paisa), 0)::text AS balance
         FROM customer_ledger_entries
         WHERE tenant_id = $1 AND customer_id = $2`,
        [this.tenantId, customer.id],
      )
      const current = BigInt(balance.rows[0]?.balance ?? '0')
      const availableCredit = current < 0n ? -current : 0n
      if (creditApplied > availableCredit) {
        throw new SalesValidationError(
          'Customer Credit is insufficient for this payment.',
        )
      }
    }

    const activeCashSession =
      await this.finance.findActiveCashSession(this.tenantId)

    const prepared: PreparedPayment[] = []
    for (const payment of payments) {
      if (
        payment.method === 'BANK' ||
        payment.method === 'MOBILE_BANKING'
      ) {
        if (!payment.accountId) {
          throw new SalesValidationError(
            `${payment.method} account is required.`,
          )
        }
        const account = await this.finance.findAccount(
          this.tenantId,
          payment.accountId,
        )
        if (
          !account ||
          !account.isActive ||
          account.type !== payment.method
        ) {
          throw new SalesValidationError(
            `${payment.method} account is invalid or inactive.`,
          )
        }
      } else if (payment.accountId) {
        throw new SalesValidationError(
          `${payment.method} must not use a financial account.`,
        )
      }

      prepared.push({
        ...payment,
        cashSessionId:
          payment.method === 'CASH'
            ? activeCashSession?.id ?? null
            : null,
      })
    }
    return prepared
  }

  async post(
    saleId: string,
    businessDate: string,
    actorUserId: string,
    customer: CustomerRecord | null,
    payments: PreparedPayment[],
  ): Promise<void> {
    for (const payment of payments) {
      await this.database.query(
        `INSERT INTO sales_payments
         (
           tenant_id,
           sale_id,
           client_line_id,
           method,
           financial_account_id,
           tendered_amount_paisa,
           applied_amount_paisa,
           reference,
           note,
           cash_session_id,
           created_by_user_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          this.tenantId,
          saleId,
          payment.clientLineId,
          payment.method,
          payment.accountId,
          payment.tenderedAmountPaisa,
          payment.appliedAmountPaisa,
          payment.reference,
          payment.note,
          payment.cashSessionId,
          actorUserId,
        ],
      )

      const applied = BigInt(payment.appliedAmountPaisa)
      if (applied === 0n) {
        continue
      }

      if (payment.method === 'CUSTOMER_CREDIT') {
        if (!customer) {
          throw new Error('Resolved Customer disappeared')
        }
        await this.database.query(
          `INSERT INTO customer_ledger_entries
           (
             tenant_id,
             customer_id,
             business_date,
             entry_type,
             amount_paisa,
             source_type,
             source_id,
             notes
           )
           VALUES ($1,$2,$3,'CREDIT_APPLIED',$4,'SALE',$5,$6)`,
          [
            this.tenantId,
            customer.id,
            businessDate,
            payment.appliedAmountPaisa,
            saleId,
            payment.note,
          ],
        )
        continue
      }

      await this.database.query(
        `INSERT INTO financial_movements
         (
           tenant_id,
           channel,
           financial_account_id,
           cash_session_id,
           business_date,
           amount_paisa,
           source_type,
           source_id,
           notes
         )
         VALUES ($1,$2,$3,$4,$5,$6,'SALE',$7,$8)`,
        [
          this.tenantId,
          payment.method,
          payment.accountId,
          payment.cashSessionId,
          businessDate,
          payment.appliedAmountPaisa,
          saleId,
          payment.note,
        ],
      )
    }
  }
}
