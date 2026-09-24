import type { DatabaseClient } from '../../db/request-database'
import type {
  InventorySerialRecord,
  WarrantyDurationUnit,
  WarrantyPolicyRecord,
  WarrantySnapshotRecord,
} from './tracking.types'

interface SerialRow {
  id: string
  variant_id: string
  lot_id: string | null
  serial_number: string
  status: InventorySerialRecord['status']
  received_on: string
}

function mapSerial(row: SerialRow): InventorySerialRecord {
  return {
    id: row.id,
    variantId: row.variant_id,
    lotId: row.lot_id,
    serialNumber: row.serial_number,
    status: row.status,
    receivedOn: row.received_on,
  }
}

interface WarrantyPolicyRow {
  id: string
  product_id: string
  is_enabled: boolean
  duration_value: number | null
  duration_unit: WarrantyDurationUnit | null
  provider: string
  warranty_text: string
}

function mapWarrantyPolicy(
  row: WarrantyPolicyRow,
): WarrantyPolicyRecord {
  return {
    id: row.id,
    productId: row.product_id,
    enabled: row.is_enabled,
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    provider: row.provider,
    text: row.warranty_text,
  }
}

interface WarrantySnapshotRow {
  id: string
  sales_line_id: string
  serial_id: string | null
  source_policy_id: string | null
  duration_value: number
  duration_unit: WarrantyDurationUnit
  provider_snapshot: string
  warranty_text_snapshot: string
  starts_on: string
  expires_on: string
}

function mapWarrantySnapshot(
  row: WarrantySnapshotRow,
): WarrantySnapshotRecord {
  return {
    id: row.id,
    salesLineId: row.sales_line_id,
    serialId: row.serial_id,
    sourcePolicyId: row.source_policy_id,
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    provider: row.provider_snapshot,
    text: row.warranty_text_snapshot,
    startsOn: row.starts_on,
    expiresOn: row.expires_on,
  }
}

export class TrackingRepository {
  constructor(private readonly db: DatabaseClient) {}

  async listSellableSerials(
    tenantId: string,
    variantId: string,
  ): Promise<InventorySerialRecord[]> {
    const result = await this.db.query<SerialRow>(
      `SELECT
         id,
         variant_id,
         lot_id,
         serial_number,
         status,
         received_on::text
       FROM inventory_serials
       WHERE tenant_id = $1
         AND variant_id = $2
         AND status IN ('IN_STOCK', 'RETURNED')
       ORDER BY received_on ASC, serial_number ASC, id ASC`,
      [tenantId, variantId],
    )

    return result.rows.map(mapSerial)
  }

  async lockSellableSerialsByIds(
    tenantId: string,
    variantId: string,
    serialIds: string[],
  ): Promise<InventorySerialRecord[]> {
    const result = await this.db.query<SerialRow>(
      `SELECT
         id,
         variant_id,
         lot_id,
         serial_number,
         status,
         received_on::text
       FROM inventory_serials
       WHERE tenant_id = $1
         AND variant_id = $2
         AND id = ANY($3::uuid[])
         AND status IN ('IN_STOCK', 'RETURNED')
       ORDER BY id
       FOR UPDATE`,
      [tenantId, variantId, serialIds],
    )

    return result.rows.map(mapSerial)
  }

  async productExists(
    tenantId: string,
    productId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM products
         WHERE tenant_id = $1 AND id = $2
       ) AS exists`,
      [tenantId, productId],
    )

    return result.rows[0]?.exists ?? false
  }

  async upsertWarrantyPolicy(input: {
    tenantId: string
    productId: string
    enabled: boolean
    durationValue: number | null
    durationUnit: WarrantyDurationUnit | null
    provider: string
    text: string
  }): Promise<WarrantyPolicyRecord> {
    const result = await this.db.query<WarrantyPolicyRow>(
      `INSERT INTO product_warranty_policies
       (
         tenant_id,
         product_id,
         is_enabled,
         duration_value,
         duration_unit,
         provider,
         warranty_text
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, product_id)
       DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         duration_value = EXCLUDED.duration_value,
         duration_unit = EXCLUDED.duration_unit,
         provider = EXCLUDED.provider,
         warranty_text = EXCLUDED.warranty_text,
         updated_at = NOW()
       RETURNING
         id,
         product_id,
         is_enabled,
         duration_value,
         duration_unit,
         provider,
         warranty_text`,
      [
        input.tenantId,
        input.productId,
        input.enabled,
        input.durationValue,
        input.durationUnit,
        input.provider,
        input.text,
      ],
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to save warranty policy')
    }

    return mapWarrantyPolicy(row)
  }

  async findWarrantyPolicy(
    tenantId: string,
    productId: string,
  ): Promise<WarrantyPolicyRecord | null> {
    const result = await this.db.query<WarrantyPolicyRow>(
      `SELECT
         id,
         product_id,
         is_enabled,
         duration_value,
         duration_unit,
         provider,
         warranty_text
       FROM product_warranty_policies
       WHERE tenant_id = $1
         AND product_id = $2`,
      [tenantId, productId],
    )

    const row = result.rows[0]
    return row ? mapWarrantyPolicy(row) : null
  }

  async salesLineBelongsToProduct(
    tenantId: string,
    salesLineId: string,
    productId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ belongs: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM sales_lines sl
         JOIN product_variants pv
           ON pv.tenant_id = sl.tenant_id
          AND pv.id = sl.variant_id
         WHERE sl.tenant_id = $1
           AND sl.id = $2
           AND pv.product_id = $3
       ) AS belongs`,
      [tenantId, salesLineId, productId],
    )

    return result.rows[0]?.belongs ?? false
  }

  async serialBelongsToSalesLineVariant(input: {
    tenantId: string
    salesLineId: string
    serialId: string
  }): Promise<boolean> {
    const result = await this.db.query<{ belongs: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM sales_lines sl
         JOIN inventory_serials serial
           ON serial.tenant_id = sl.tenant_id
          AND serial.variant_id = sl.variant_id
         WHERE sl.tenant_id = $1
           AND sl.id = $2
           AND serial.id = $3
       ) AS belongs`,
      [input.tenantId, input.salesLineId, input.serialId],
    )

    return result.rows[0]?.belongs ?? false
  }

  async createWarrantySnapshot(input: {
    tenantId: string
    salesLineId: string
    serialId: string | null
    sourcePolicyId: string
    durationValue: number
    durationUnit: WarrantyDurationUnit
    provider: string
    text: string
    startsOn: string
  }): Promise<WarrantySnapshotRecord> {
    const result = await this.db.query<WarrantySnapshotRow>(
      `INSERT INTO warranty_snapshots
       (
         tenant_id,
         sales_line_id,
         serial_id,
         source_policy_id,
         duration_value,
         duration_unit,
         provider_snapshot,
         warranty_text_snapshot,
         starts_on,
         expires_on
       )
       VALUES (
         $1,$2,$3,$4,$5::integer,$6,$7,$8,$9::date,
         CASE $6
           WHEN 'DAY' THEN ($9::date + ($5::integer * INTERVAL '1 day'))::date
           WHEN 'MONTH' THEN ($9::date + ($5::integer * INTERVAL '1 month'))::date
           WHEN 'YEAR' THEN ($9::date + ($5::integer * INTERVAL '1 year'))::date
         END
       )
       RETURNING
         id,
         sales_line_id,
         serial_id,
         source_policy_id,
         duration_value,
         duration_unit,
         provider_snapshot,
         warranty_text_snapshot,
         starts_on::text,
         expires_on::text`,
      [
        input.tenantId,
        input.salesLineId,
        input.serialId,
        input.sourcePolicyId,
        input.durationValue,
        input.durationUnit,
        input.provider,
        input.text,
        input.startsOn,
      ],
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create warranty snapshot')
    }

    return mapWarrantySnapshot(row)
  }

  async listWarrantySnapshots(
    tenantId: string,
    salesLineId: string,
  ): Promise<WarrantySnapshotRecord[]> {
    const result = await this.db.query<WarrantySnapshotRow>(
      `SELECT
         id,
         sales_line_id,
         serial_id,
         source_policy_id,
         duration_value,
         duration_unit,
         provider_snapshot,
         warranty_text_snapshot,
         starts_on::text,
         expires_on::text
       FROM warranty_snapshots
       WHERE tenant_id = $1
         AND sales_line_id = $2
       ORDER BY created_at, id`,
      [tenantId, salesLineId],
    )

    return result.rows.map(mapWarrantySnapshot)
  }
}
