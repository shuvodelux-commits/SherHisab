import type { DatabaseClient } from '../../db/request-database'
import type { CustomerRecord } from './customer.types'

interface CustomerRow {
  id: string
  customer_code: string
  name: string
  phone: string
  normalized_phone: string
  guardian_name: string
  address: string
  is_active: boolean
}

function mapCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    customerCode: row.customer_code,
    name: row.name,
    phone: row.phone,
    normalizedPhone: row.normalized_phone,
    guardianName: row.guardian_name,
    address: row.address,
    isActive: row.is_active,
  }
}

export class CustomerRepository {
  constructor(private readonly db: DatabaseClient) {}

  async allocateCustomerCode(tenantId: string): Promise<string> {
    const result = await this.db.query<{ value: string }>(
      `INSERT INTO tenant_document_counters
       (tenant_id, document_type, next_value)
       VALUES ($1, 'CUSTOMER', 2)
       ON CONFLICT (tenant_id, document_type)
       DO UPDATE SET
         next_value = tenant_document_counters.next_value + 1,
         updated_at = NOW()
       RETURNING (next_value - 1)::text AS value`,
      [tenantId],
    )
    const value = result.rows[0]?.value
    if (!value) {
      throw new Error('Failed to allocate Customer code')
    }

    return `CUS-${value.padStart(5, '0')}`
  }

  async insertCustomer(input: {
    tenantId: string
    customerCode: string
    name: string
    phone: string
    normalizedPhone: string
    guardianName: string
    address: string
  }): Promise<CustomerRecord> {
    const result = await this.db.query<CustomerRow>(
      `INSERT INTO customers
       (
         tenant_id,
         customer_code,
         name,
         phone,
         normalized_phone,
         guardian_name,
         address
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING
         id,
         customer_code,
         name,
         phone,
         normalized_phone,
         guardian_name,
         address,
         is_active`,
      [
        input.tenantId,
        input.customerCode,
        input.name,
        input.phone,
        input.normalizedPhone,
        input.guardianName,
        input.address,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create Customer')
    }

    return mapCustomer(row)
  }

  async findActiveById(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerRecord | null> {
    const result = await this.db.query<CustomerRow>(
      `SELECT
         id,
         customer_code,
         name,
         phone,
         normalized_phone,
         guardian_name,
         address,
         is_active
       FROM customers
       WHERE tenant_id = $1
         AND id = $2
         AND is_active
       LIMIT 1`,
      [tenantId, customerId],
    )
    const row = result.rows[0]
    return row ? mapCustomer(row) : null
  }

  async findActiveByNormalizedPhone(
    tenantId: string,
    normalizedPhone: string,
  ): Promise<CustomerRecord[]> {
    const result = await this.db.query<CustomerRow>(
      `SELECT
         id,
         customer_code,
         name,
         phone,
         normalized_phone,
         guardian_name,
         address,
         is_active
       FROM customers
       WHERE tenant_id = $1
         AND normalized_phone = $2
         AND is_active
       ORDER BY customer_code, id`,
      [tenantId, normalizedPhone],
    )

    return result.rows.map(mapCustomer)
  }

  async search(
    tenantId: string,
    query: string,
    normalizedPhone: string,
  ): Promise<CustomerRecord[]> {
    const result = await this.db.query<CustomerRow>(
      `SELECT
         id,
         customer_code,
         name,
         phone,
         normalized_phone,
         guardian_name,
         address,
         is_active
       FROM customers
       WHERE tenant_id = $1
         AND is_active
         AND (
           customer_code ILIKE '%' || $2 || '%'
           OR name ILIKE '%' || $2 || '%'
           OR (
             $3 <> ''
             AND normalized_phone ILIKE '%' || $3 || '%'
           )
         )
       ORDER BY lower(name), customer_code, id
       LIMIT 50`,
      [tenantId, query, normalizedPhone],
    )

    return result.rows.map(mapCustomer)
  }

  async balance(
    tenantId: string,
    customerId: string,
  ): Promise<string | null> {
    const result = await this.db.query<{ balance_paisa: string }>(
      `SELECT
         COALESCE(SUM(l.amount_paisa), 0)::text AS balance_paisa
       FROM customers c
       LEFT JOIN customer_ledger_entries l
         ON l.tenant_id = c.tenant_id
        AND l.customer_id = c.id
       WHERE c.tenant_id = $1
         AND c.id = $2
       GROUP BY c.id`,
      [tenantId, customerId],
    )

    return result.rows[0]?.balance_paisa ?? null
  }
}
