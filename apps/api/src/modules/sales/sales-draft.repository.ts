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
}
