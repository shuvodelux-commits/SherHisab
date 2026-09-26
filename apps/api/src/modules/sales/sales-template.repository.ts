import type { DatabaseClient } from '../../db/request-database'
import type {
  SalesTemplateRecord,
  SalesTemplateStoredLine,
  SalesTemplateSummary,
} from './sales-template.types'

interface HeaderRow {
  id: string
  name: string
  version: number
  status: 'ACTIVE' | 'ARCHIVED'
  created_by_user_id: string
  created_at: Date
  updated_at: Date
}

interface LineRow {
  variant_id: string
  quantity_input_snapshot: SalesTemplateStoredLine['quantityInput']
  normalized_quantity_snapshot: SalesTemplateStoredLine['normalizedQuantitySnapshot']
  pricing_strategy: SalesTemplateStoredLine['pricingStrategy']
  manual_unit_selling_price_paisa: string | null
}

function asRecord(header: HeaderRow, lines: LineRow[]): SalesTemplateRecord {
  return {
    id: header.id,
    name: header.name,
    version: header.version,
    status: header.status,
    createdByUserId: header.created_by_user_id,
    createdAt: header.created_at.toISOString(),
    updatedAt: header.updated_at.toISOString(),
    lines: lines.map((line) => ({
      variantId: line.variant_id,
      quantityInput: line.quantity_input_snapshot,
      normalizedQuantitySnapshot: line.normalized_quantity_snapshot,
      pricingStrategy: line.pricing_strategy,
      manualUnitSellingPricePaisa: line.manual_unit_selling_price_paisa,
    })),
  }
}

export class SalesTemplateRepository {
  constructor(private readonly db: DatabaseClient) {}

  async listActive(tenantId: string): Promise<SalesTemplateSummary[]> {
    const result = await this.db.query<{
      id: string
      name: string
      version: number
      line_count: number
      created_at: Date
      updated_at: Date
    }>(
      `SELECT t.id, t.name, t.version, COUNT(l.id)::integer AS line_count,
              t.created_at, t.updated_at
       FROM sales_templates t
       LEFT JOIN sales_template_lines l
         ON l.tenant_id = t.tenant_id AND l.template_id = t.id
       WHERE t.tenant_id = $1 AND t.status = 'ACTIVE'
       GROUP BY t.id
       ORDER BY t.updated_at DESC, t.id DESC`,
      [tenantId],
    )
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      lineCount: row.line_count,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }))
  }

  async findById(
    tenantId: string,
    id: string,
    forUpdate = false,
  ): Promise<SalesTemplateRecord | null> {
    const result = await this.db.query<HeaderRow>(
      `SELECT id, name, version, status, created_by_user_id,
              created_at, updated_at
       FROM sales_templates
       WHERE tenant_id = $1 AND id = $2
       ${forUpdate ? 'FOR UPDATE' : ''}`,
      [tenantId, id],
    )
    const header = result.rows[0]
    if (!header) return null
    const lines = await this.db.query<LineRow>(
      `SELECT variant_id, quantity_input_snapshot,
              normalized_quantity_snapshot, pricing_strategy,
              manual_unit_selling_price_paisa::text
       FROM sales_template_lines
       WHERE tenant_id = $1 AND template_id = $2
       ORDER BY sort_order, id`,
      [tenantId, id],
    )
    return asRecord(header, lines.rows)
  }

  async create(
    tenantId: string,
    actorUserId: string,
    name: string,
    lines: SalesTemplateStoredLine[],
  ): Promise<SalesTemplateRecord> {
    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO sales_templates
         (tenant_id, name, created_by_user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantId, name, actorUserId],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new Error('Template insert failed')
    await this.insertLines(tenantId, id, lines)
    const record = await this.findById(tenantId, id)
    if (!record) throw new Error('Template insert failed')
    return record
  }

  async update(
    tenantId: string,
    id: string,
    name: string,
    lines: SalesTemplateStoredLine[] | undefined,
  ): Promise<SalesTemplateRecord> {
    await this.db.query(
      `UPDATE sales_templates
       SET name = $3, version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, name],
    )
    if (lines) {
      await this.db.query(
        'DELETE FROM sales_template_lines WHERE tenant_id = $1 AND template_id = $2',
        [tenantId, id],
      )
      await this.insertLines(tenantId, id, lines)
    }
    const record = await this.findById(tenantId, id)
    if (!record) throw new Error('Template update failed')
    return record
  }

  async archive(tenantId: string, id: string): Promise<SalesTemplateRecord> {
    await this.db.query(
      `UPDATE sales_templates
       SET status = 'ARCHIVED', version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    )
    const record = await this.findById(tenantId, id)
    if (!record) throw new Error('Template archive failed')
    return record
  }

  private async insertLines(
    tenantId: string,
    id: string,
    lines: SalesTemplateStoredLine[],
  ): Promise<void> {
    for (const [index, line] of lines.entries()) {
      await this.db.query(
        `INSERT INTO sales_template_lines
           (tenant_id, template_id, sort_order, variant_id,
            quantity_input_snapshot, normalized_quantity_snapshot,
            pricing_strategy, manual_unit_selling_price_paisa)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          tenantId, id, index, line.variantId,
          JSON.stringify(line.quantityInput),
          JSON.stringify(line.normalizedQuantitySnapshot),
          line.pricingStrategy,
          line.manualUnitSellingPricePaisa,
        ],
      )
    }
  }
}
