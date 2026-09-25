import type { DatabaseClient } from '../../db/request-database'

export interface PosSettingsRecord {
  showPurchasePrice: boolean
  requireCashSession: boolean
  invoiceShareEnabled: boolean
}

interface PosSettingsRow {
  show_purchase_price: boolean
  require_cash_session: boolean
  invoice_share_enabled: boolean
}

export class PosSettingsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getOrCreate(tenantId: string): Promise<PosSettingsRecord> {
    const result = await this.db.query<PosSettingsRow>(
      `INSERT INTO tenant_pos_settings (tenant_id)
       VALUES ($1)
       ON CONFLICT (tenant_id)
       DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING
         show_purchase_price,
         require_cash_session,
         invoice_share_enabled`,
      [tenantId],
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to load POS settings')
    }

    return {
      showPurchasePrice: row.show_purchase_price,
      requireCashSession: row.require_cash_session,
      invoiceShareEnabled: row.invoice_share_enabled,
    }
  }
}
