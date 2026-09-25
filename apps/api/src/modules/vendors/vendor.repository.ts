import type { DatabaseClient } from '../../db/request-database'
import type { VendorRecord } from './vendor.types'

interface VendorRow {
  id: string
  vendor_code: string
  name: string
  phone: string
  address: string
  is_active: boolean
}

function mapVendor(row: VendorRow): VendorRecord {
  return {
    id: row.id,
    vendorCode: row.vendor_code,
    name: row.name,
    phone: row.phone,
    address: row.address,
    isActive: row.is_active,
  }
}

export class VendorRepository {
  constructor(private readonly db: DatabaseClient) {}

  async allocateVendorCode(tenantId: string): Promise<string> {
    const result = await this.db.query<{ value: string }>(
      `INSERT INTO tenant_document_counters
       (tenant_id, document_type, next_value)
       VALUES ($1, 'VENDOR', 2)
       ON CONFLICT (tenant_id, document_type)
       DO UPDATE SET
         next_value = tenant_document_counters.next_value + 1,
         updated_at = NOW()
       RETURNING (next_value - 1)::text AS value`,
      [tenantId],
    )
    const value = result.rows[0]?.value
    if (!value) {
      throw new Error('Failed to allocate Vendor code')
    }

    return `VEN-${value.padStart(5, '0')}`
  }

  async insertVendor(input: {
    tenantId: string
    vendorCode: string
    name: string
    phone: string
    address: string
  }): Promise<VendorRecord> {
    const result = await this.db.query<VendorRow>(
      `INSERT INTO vendors
       (tenant_id, vendor_code, name, phone, address)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING
         id,
         vendor_code,
         name,
         phone,
         address,
         is_active`,
      [
        input.tenantId,
        input.vendorCode,
        input.name,
        input.phone,
        input.address,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create Vendor')
    }

    return mapVendor(row)
  }

  async search(
    tenantId: string,
    query: string,
    limit: number,
  ): Promise<VendorRecord[]> {
    const result = await this.db.query<VendorRow>(
      `SELECT
         id,
         vendor_code,
         name,
         phone,
         address,
         is_active
       FROM vendors
       WHERE tenant_id = $1
         AND is_active
         AND (
           lower(vendor_code) LIKE '%' || lower($2) || '%'
           OR lower(name) LIKE '%' || lower($2) || '%'
           OR lower(phone) LIKE '%' || lower($2) || '%'
         )
       ORDER BY
         CASE
           WHEN lower(vendor_code) = lower($2) THEN 0
           WHEN lower(name) = lower($2) THEN 1
           WHEN lower(name) LIKE lower($2) || '%' THEN 2
           ELSE 3
         END,
         lower(name),
         id
       LIMIT $3`,
      [tenantId, query, limit],
    )

    return result.rows.map(mapVendor)
  }

  async findById(
    tenantId: string,
    vendorId: string,
  ): Promise<VendorRecord | null> {
    const result = await this.db.query<VendorRow>(
      `SELECT
         id,
         vendor_code,
         name,
         phone,
         address,
         is_active
       FROM vendors
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, vendorId],
    )

    const row = result.rows[0]
    return row ? mapVendor(row) : null
  }
}
