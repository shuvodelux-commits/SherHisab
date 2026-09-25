import type { DatabaseClient } from '../../db/request-database'
import type {
  SalesDraftInput,
  SalesDraftLineInput,
  SalesDraftRecord,
  SalesDraftStatus,
} from './sales-draft.types'

interface DraftHeaderRow {
  id: string
  draft_number: string
  version: number
  status: SalesDraftStatus
  owner_user_id: string
  posted_sale_id: string | null
  created_at: Date
  updated_at: Date
}

interface StoredDraftHeaderRow extends DraftHeaderRow {
  customer_id: string | null
  customer_name_snapshot: string
  customer_phone_snapshot: string
  customer_guardian_name_snapshot: string
  customer_address_snapshot: string
  discount_paisa: string
  payments_snapshot: SalesDraftInput['payments']
  note: string
}

interface StoredDraftLineRow {
  variant_id: string
  quantity_input_snapshot: SalesDraftLineInput['quantityInput']
  normalized_quantity_snapshot: SalesDraftLineInput['normalizedQuantitySnapshot']
  pricing_mode: SalesDraftLineInput['pricingMode']
  manual_unit_selling_price_paisa: string | null
  shortage_resolution_type: 'VENDOR' | 'NEGATIVE_STOCK' | null
  vendor_id: string | null
  vendor_unit_cost_paisa: string | null
  serial_ids_snapshot: string[]
  batch_selection_snapshot: SalesDraftLineInput['batchSelection']
  warranty_snapshot: unknown | null
  capture_values_snapshot: Record<string, string>
}

export class SalesDraftRepository {
  constructor(private readonly db: DatabaseClient) {}

  async allocateDraftNumber(tenantId: string): Promise<string> {
    const result = await this.db.query<{ sequence_value: string }>(
      `INSERT INTO tenant_document_counters
       (tenant_id, document_type, next_value)
       VALUES ($1, 'DRAFT', 2)
       ON CONFLICT (tenant_id, document_type)
       DO UPDATE SET
         next_value = tenant_document_counters.next_value + 1,
         updated_at = NOW()
       RETURNING (next_value - 1)::text AS sequence_value`,
      [tenantId],
    )
    const sequence = result.rows[0]?.sequence_value
    if (!sequence) {
      throw new Error('Failed to allocate Draft Number')
    }
    return `DRAFT-${sequence.padStart(6, '0')}`
  }

  async insertDraft(input: {
    tenantId: string
    draftNumber: string
    ownerUserId: string
    state: SalesDraftInput
  }): Promise<DraftHeaderRow> {
    const result = await this.db.query<DraftHeaderRow>(
      `INSERT INTO sales_drafts
       (
         tenant_id,
         draft_number,
         owner_user_id,
         customer_id,
         customer_name_snapshot,
         customer_phone_snapshot,
         customer_guardian_name_snapshot,
         customer_address_snapshot,
         discount_paisa,
         payments_snapshot,
         note
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       RETURNING
         id,
         draft_number,
         version,
         status,
         owner_user_id,
         posted_sale_id,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.draftNumber,
        input.ownerUserId,
        input.state.customer.selectedCustomerId,
        input.state.customer.name,
        input.state.customer.phone,
        input.state.customer.guardianName,
        input.state.customer.address,
        input.state.discountPaisa,
        JSON.stringify(input.state.payments),
        input.state.note,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to save Draft')
    }
    return row
  }

  async insertLine(input: {
    tenantId: string
    draftId: string
    sortOrder: number
    line: SalesDraftLineInput
  }): Promise<void> {
    const source = input.line.shortageResolution
    await this.db.query(
      `INSERT INTO sales_draft_lines
       (
         tenant_id,
         draft_id,
         sort_order,
         variant_id,
         base_qty,
         pricing_qty,
         display_qty,
         quantity_input_snapshot,
         normalized_quantity_snapshot,
         pricing_mode,
         manual_unit_selling_price_paisa,
         shortage_resolution_type,
         vendor_id,
         vendor_unit_cost_paisa,
         serial_ids_snapshot,
         batch_selection_snapshot,
         warranty_snapshot,
         capture_values_snapshot
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,
         $15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb
       )`,
      [
        input.tenantId,
        input.draftId,
        input.sortOrder,
        input.line.variantId,
        input.line.normalizedQuantitySnapshot.baseQty,
        input.line.normalizedQuantitySnapshot.pricingQty,
        input.line.normalizedQuantitySnapshot.displayQty,
        JSON.stringify(input.line.quantityInput),
        JSON.stringify(input.line.normalizedQuantitySnapshot),
        input.line.pricingMode,
        input.line.manualUnitSellingPricePaisa,
        source?.type ?? null,
        source?.type === 'VENDOR' ? source.vendorId : null,
        source?.type === 'VENDOR' ? source.unitCostPaisa : null,
        JSON.stringify(input.line.serialIds),
        input.line.batchSelection === null
          ? null
          : JSON.stringify(input.line.batchSelection),
        input.line.warrantySnapshot === null
          ? null
          : JSON.stringify(input.line.warrantySnapshot),
        JSON.stringify(input.line.captureValues),
      ],
    )
  }

  async insertAudit(input: {
    tenantId: string
    draftId: string
    version: number
    actorUserId: string
    state: SalesDraftInput
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO sales_draft_audit
       (
         tenant_id,
         draft_id,
         draft_version,
         action,
         state_snapshot,
         actor_user_id
       )
       VALUES ($1,$2,$3,'CREATED',$4::jsonb,$5)`,
      [
        input.tenantId,
        input.draftId,
        input.version,
        JSON.stringify(input.state),
        input.actorUserId,
      ],
    )
  }

  toCreatedRecord(
    tenantId: string,
    header: DraftHeaderRow,
    state: SalesDraftInput,
  ): SalesDraftRecord {
    return {
      id: header.id,
      tenantId,
      draftNumber: header.draft_number,
      version: header.version,
      status: header.status,
      ownerUserId: header.owner_user_id,
      postedSaleId: header.posted_sale_id,
      createdAt: header.created_at,
      updatedAt: header.updated_at,
      ...state,
    }
  }

  async findById(
    tenantId: string,
    draftId: string,
  ): Promise<SalesDraftRecord | null> {
    const headerResult = await this.db.query<StoredDraftHeaderRow>(
      `SELECT
         id,
         draft_number,
         version,
         status,
         owner_user_id,
         posted_sale_id,
         customer_id,
         customer_name_snapshot,
         customer_phone_snapshot,
         customer_guardian_name_snapshot,
         customer_address_snapshot,
         discount_paisa::text,
         payments_snapshot,
         note,
         created_at,
         updated_at
       FROM sales_drafts
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [tenantId, draftId],
    )
    const header = headerResult.rows[0]
    if (!header) {
      return null
    }

    const linesResult = await this.db.query<StoredDraftLineRow>(
      `SELECT
         variant_id,
         quantity_input_snapshot,
         normalized_quantity_snapshot,
         pricing_mode,
         manual_unit_selling_price_paisa::text,
         shortage_resolution_type,
         vendor_id,
         vendor_unit_cost_paisa::text,
         serial_ids_snapshot,
         batch_selection_snapshot,
         warranty_snapshot,
         capture_values_snapshot
       FROM sales_draft_lines
       WHERE tenant_id = $1
         AND draft_id = $2
       ORDER BY sort_order, id`,
      [tenantId, draftId],
    )

    const lines: SalesDraftLineInput[] = linesResult.rows.map((row) => {
      const shortageResolution =
        row.shortage_resolution_type === 'VENDOR'
          ? {
              type: 'VENDOR' as const,
              vendorId: row.vendor_id!,
              unitCostPaisa: row.vendor_unit_cost_paisa!,
            }
          : row.shortage_resolution_type === 'NEGATIVE_STOCK'
            ? { type: 'NEGATIVE_STOCK' as const }
            : null

      return {
        variantId: row.variant_id,
        quantityInput: row.quantity_input_snapshot,
        normalizedQuantitySnapshot:
          row.normalized_quantity_snapshot,
        pricingMode: row.pricing_mode,
        manualUnitSellingPricePaisa:
          row.manual_unit_selling_price_paisa,
        shortageResolution,
        serialIds: row.serial_ids_snapshot,
        batchSelection: row.batch_selection_snapshot,
        warrantySnapshot: row.warranty_snapshot,
        captureValues: row.capture_values_snapshot,
      }
    })

    return {
      id: header.id,
      tenantId,
      draftNumber: header.draft_number,
      version: header.version,
      status: header.status,
      ownerUserId: header.owner_user_id,
      postedSaleId: header.posted_sale_id,
      createdAt: header.created_at,
      updatedAt: header.updated_at,
      customer: {
        selectedCustomerId: header.customer_id,
        name: header.customer_name_snapshot,
        phone: header.customer_phone_snapshot,
        guardianName: header.customer_guardian_name_snapshot,
        address: header.customer_address_snapshot,
      },
      discountPaisa: header.discount_paisa,
      payments: header.payments_snapshot,
      note: header.note,
      lines,
    }
  }

  async replaceState(input: {
    tenantId: string
    draftId: string
    state: SalesDraftInput
  }): Promise<DraftHeaderRow | null> {
    const result = await this.db.query<DraftHeaderRow>(
      `UPDATE sales_drafts
       SET customer_id = $3,
           customer_name_snapshot = $4,
           customer_phone_snapshot = $5,
           customer_guardian_name_snapshot = $6,
           customer_address_snapshot = $7,
           discount_paisa = $8,
           payments_snapshot = $9::jsonb,
           note = $10,
           version = version + 1,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'ACTIVE'
       RETURNING
         id,
         draft_number,
         version,
         status,
         owner_user_id,
         posted_sale_id,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.draftId,
        input.state.customer.selectedCustomerId,
        input.state.customer.name,
        input.state.customer.phone,
        input.state.customer.guardianName,
        input.state.customer.address,
        input.state.discountPaisa,
        JSON.stringify(input.state.payments),
        input.state.note,
      ],
    )
    return result.rows[0] ?? null
  }

  async deleteLines(
    tenantId: string,
    draftId: string,
  ): Promise<void> {
    await this.db.query(
      `DELETE FROM sales_draft_lines
       WHERE tenant_id = $1 AND draft_id = $2`,
      [tenantId, draftId],
    )
  }

}
