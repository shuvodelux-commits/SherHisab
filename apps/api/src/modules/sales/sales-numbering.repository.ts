import type { DatabaseClient } from '../../db/request-database'

export class SalesNumberingRepository {
  constructor(private readonly db: DatabaseClient) {}

  async allocateInvoiceNumber(tenantId: string): Promise<string> {
    const result = await this.db.query<{ sequence_value: string }>(
      `INSERT INTO tenant_document_counters
       (tenant_id, document_type, next_value)
       VALUES ($1, 'INV', 2)
       ON CONFLICT (tenant_id, document_type)
       DO UPDATE
       SET next_value = tenant_document_counters.next_value + 1,
           updated_at = NOW()
       RETURNING (next_value - 1)::text AS sequence_value`,
      [tenantId],
    )
    const sequence = result.rows[0]?.sequence_value
    if (!sequence) {
      throw new Error('Failed to allocate Invoice Number')
    }

    return `INV-${sequence.padStart(6, '0')}`
  }
}
