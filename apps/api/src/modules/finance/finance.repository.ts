import type { DatabaseClient } from '../../db/request-database'
import type {
  CreateFinancialAccountInput,
  FinancialAccountRecord,
  FinancialAccountType,
  UpdateFinancialAccountInput,
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

function requiredName(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Financial account name is required')
  }
  return normalized
}

export class FinanceRepository {
  constructor(private readonly db: DatabaseClient) {}

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
}
