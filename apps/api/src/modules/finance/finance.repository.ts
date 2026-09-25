import type { DatabaseClient } from '../../db/request-database'
import type {
  CreateFinancialAccountInput,
  FinancialAccountRecord,
  FinancialAccountType,
  UpdateFinancialAccountInput,
  CashSessionRecord,
  CashSessionStatus,
} from './finance.types'

interface FinancialAccountRow {
  id: string
  account_type: FinancialAccountType
  name: string
  provider: string
  account_reference: string
  is_active: boolean
}

function mapAccount(
  row: FinancialAccountRow,
): FinancialAccountRecord {
  return {
    id: row.id,
    type: row.account_type,
    name: row.name,
    provider: row.provider,
    accountReference: row.account_reference,
    isActive: row.is_active,
  }
}



interface CashSessionRow {
  id: string
  status: CashSessionStatus
  opening_cash_paisa: string
  expected_cash_paisa: string | null
  counted_cash_paisa: string | null
  variance_paisa: string | null
  opened_at: Date
  closed_at: Date | null
  notes: string
  opened_by_user_id: string
  closed_by_user_id: string | null
  projected_expected_cash_paisa: string
}

function mapCashSession(row: CashSessionRow): CashSessionRecord {
  return {
    id: row.id,
    status: row.status,
    openingCashPaisa: row.opening_cash_paisa,
    expectedCashPaisa:
      row.expected_cash_paisa ?? row.projected_expected_cash_paisa,
    countedCashPaisa: row.counted_cash_paisa,
    variancePaisa: row.variance_paisa,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    notes: row.notes,
    openedByUserId: row.opened_by_user_id,
    closedByUserId: row.closed_by_user_id,
  }
}

function requiredName(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Financial account name is required')
  }
  return normalized
}

export class FinanceRepository {
  constructor(private readonly db: DatabaseClient) {}



  async listAccounts(
    tenantId: string,
    includeInactive = false,
  ): Promise<FinancialAccountRecord[]> {
    const result = await this.db.query<FinancialAccountRow>(
      `SELECT
         id,
         account_type,
         name,
         provider,
         account_reference,
         is_active
       FROM financial_accounts
       WHERE tenant_id = $1
         AND ($2::boolean OR is_active)
       ORDER BY account_type, lower(name), id`,
      [tenantId, includeInactive],
    )

    return result.rows.map(mapAccount)
  }

  async createAccount(
    input: CreateFinancialAccountInput,
  ): Promise<FinancialAccountRecord> {
    const result = await this.db.query<FinancialAccountRow>(
      `INSERT INTO financial_accounts
       (
         tenant_id,
         account_type,
         name,
         provider,
         account_reference
       )
       VALUES ($1,$2,$3,$4,$5)
       RETURNING
         id,
         account_type,
         name,
         provider,
         account_reference,
         is_active`,
      [
        input.tenantId,
        input.type,
        requiredName(input.name),
        input.provider?.trim() ?? '',
        input.accountReference?.trim() ?? '',
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create financial account')
    }

    return mapAccount(row)
  }

  async findAccount(
    tenantId: string,
    accountId: string,
  ): Promise<FinancialAccountRecord | null> {
    const result = await this.db.query<FinancialAccountRow>(
      `SELECT
         id,
         account_type,
         name,
         provider,
         account_reference,
         is_active
       FROM financial_accounts
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, accountId],
    )
    const row = result.rows[0]

    return row ? mapAccount(row) : null
  }

  async updateAccount(
    tenantId: string,
    accountId: string,
    input: UpdateFinancialAccountInput,
  ): Promise<FinancialAccountRecord | null> {
    const result = await this.db.query<FinancialAccountRow>(
      `UPDATE financial_accounts
       SET name = $3,
           provider = $4,
           account_reference = $5,
           is_active = $6,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING
         id,
         account_type,
         name,
         provider,
         account_reference,
         is_active`,
      [
        tenantId,
        accountId,
        requiredName(input.name),
        input.provider?.trim() ?? '',
        input.accountReference?.trim() ?? '',
        input.isActive,
      ],
    )
    const row = result.rows[0]

    return row ? mapAccount(row) : null
  }

  async createCashSession(input: {
    tenantId: string
    openingCashPaisa: string
    actorUserId: string
    notes: string
  }): Promise<CashSessionRecord> {
    const result = await this.db.query<CashSessionRow>(
      `INSERT INTO cash_sessions
       (
         tenant_id,
         opening_cash_paisa,
         notes,
         opened_by_user_id
       )
       VALUES ($1,$2,$3,$4)
       RETURNING
         id,
         status,
         opening_cash_paisa::text,
         expected_cash_paisa::text,
         counted_cash_paisa::text,
         variance_paisa::text,
         opened_at,
         closed_at,
         notes,
         opened_by_user_id,
         closed_by_user_id,
         opening_cash_paisa::text AS projected_expected_cash_paisa`,
      [
        input.tenantId,
        input.openingCashPaisa,
        input.notes,
        input.actorUserId,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to open cash session')
    }

    return mapCashSession(row)
  }

  async findActiveCashSession(
    tenantId: string,
    forUpdate = false,
  ): Promise<CashSessionRecord | null> {
    const result = await this.db.query<CashSessionRow>(
      `SELECT
         session.id,
         session.status,
         session.opening_cash_paisa::text,
         session.expected_cash_paisa::text,
         session.counted_cash_paisa::text,
         session.variance_paisa::text,
         session.opened_at,
         session.closed_at,
         session.notes,
         session.opened_by_user_id,
         session.closed_by_user_id,
         (
           session.opening_cash_paisa
           + COALESCE(
               (
                 SELECT SUM(movement.amount_paisa)
                 FROM financial_movements movement
                 WHERE movement.tenant_id = session.tenant_id
                   AND movement.cash_session_id = session.id
                   AND movement.channel = 'CASH'
               ),
               0
             )
         )::text AS projected_expected_cash_paisa
       FROM cash_sessions session
       WHERE session.tenant_id = $1
         AND session.status = 'OPEN'
       ORDER BY session.opened_at DESC, session.id DESC
       LIMIT 1
       ${forUpdate ? 'FOR UPDATE OF session' : ''}`,
      [tenantId],
    )

    const row = result.rows[0]
    return row ? mapCashSession(row) : null
  }

  async closeCashSession(input: {
    tenantId: string
    sessionId: string
    expectedCashPaisa: string
    countedCashPaisa: string
    variancePaisa: string
    actorUserId: string
    notes: string
  }): Promise<CashSessionRecord> {
    const result = await this.db.query<CashSessionRow>(
      `UPDATE cash_sessions
       SET status = 'CLOSED',
           expected_cash_paisa = $3,
           counted_cash_paisa = $4,
           variance_paisa = $5,
           closed_at = NOW(),
           closed_by_user_id = $6,
           notes = $7
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'OPEN'
       RETURNING
         id,
         status,
         opening_cash_paisa::text,
         expected_cash_paisa::text,
         counted_cash_paisa::text,
         variance_paisa::text,
         opened_at,
         closed_at,
         notes,
         opened_by_user_id,
         closed_by_user_id,
         expected_cash_paisa::text AS projected_expected_cash_paisa`,
      [
        input.tenantId,
        input.sessionId,
        input.expectedCashPaisa,
        input.countedCashPaisa,
        input.variancePaisa,
        input.actorUserId,
        input.notes,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Cash session is no longer open')
    }

    return mapCashSession(row)
  }

}
