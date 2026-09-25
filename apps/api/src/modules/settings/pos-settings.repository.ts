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

  async update(
    tenantId: string,
    settings: PosSettingsRecord,
  ): Promise<PosSettingsRecord> {
    const result = await this.db.query<PosSettingsRow>(
      `INSERT INTO tenant_pos_settings
       (
         tenant_id,
         show_purchase_price,
         require_cash_session,
         invoice_share_enabled
       )
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id)
       DO UPDATE SET
         show_purchase_price = EXCLUDED.show_purchase_price,
         require_cash_session = EXCLUDED.require_cash_session,
         invoice_share_enabled = EXCLUDED.invoice_share_enabled,
         updated_at = NOW()
       RETURNING
         show_purchase_price,
         require_cash_session,
         invoice_share_enabled`,
      [
        tenantId,
        settings.showPurchasePrice,
        settings.requireCashSession,
        settings.invoiceShareEnabled,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to update POS settings')
    }

    return {
      showPurchasePrice: row.show_purchase_price,
      requireCashSession: row.require_cash_session,
      invoiceShareEnabled: row.invoice_share_enabled,
    }
  }

}
