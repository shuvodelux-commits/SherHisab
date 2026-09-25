ALTER TABLE sales_invoices
  ADD COLUMN invoice_number TEXT,
  ADD COLUMN operation_id UUID,
  ADD COLUMN customer_id UUID,
  ADD COLUMN customer_name_snapshot TEXT,
  ADD COLUMN customer_phone_snapshot TEXT,
  ADD COLUMN customer_normalized_phone_snapshot TEXT,
  ADD COLUMN customer_guardian_name_snapshot TEXT,
  ADD COLUMN customer_address_snapshot TEXT,
  ADD COLUMN subtotal_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (subtotal_paisa >= 0),
  ADD COLUMN discount_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (discount_paisa >= 0),
  ADD COLUMN grand_total_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (grand_total_paisa >= 0),
  ADD COLUMN settlement_status TEXT NOT NULL DEFAULT 'PAID'
    CHECK (settlement_status IN ('DUE', 'PARTIAL', 'PAID')),
  ADD COLUMN paid_amount_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (paid_amount_paisa >= 0),
  ADD COLUMN due_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (due_paisa >= 0),
  ADD COLUMN revision_no INTEGER NOT NULL DEFAULT 1
    CHECK (revision_no > 0),
  ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'VOIDED'));

ALTER TABLE sales_invoices
  ADD CONSTRAINT sales_invoices_customer_fk
  FOREIGN KEY (tenant_id, customer_id)
  REFERENCES customers (tenant_id, id);

WITH ranked AS (
  SELECT
    id,
    tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY business_date, created_at, id
    ) AS sequence_value
  FROM sales_invoices
)
UPDATE sales_invoices invoice
SET invoice_number =
      'INV-' || lpad(ranked.sequence_value::text, 6, '0'),
    subtotal_paisa = invoice.total_sales_paisa,
    discount_paisa = 0,
    grand_total_paisa = invoice.total_sales_paisa,
    settlement_status = 'PAID',
    paid_amount_paisa = invoice.total_sales_paisa,
    due_paisa = 0
FROM ranked
WHERE ranked.id = invoice.id;

INSERT INTO tenant_document_counters
  (tenant_id, document_type, next_value)
SELECT
  tenant_id,
  'INV',
  COUNT(*)::bigint + 1
FROM sales_invoices
GROUP BY tenant_id
ON CONFLICT (tenant_id, document_type)
DO UPDATE
SET next_value = GREATEST(
      tenant_document_counters.next_value,
      EXCLUDED.next_value
    ),
    updated_at = NOW();

ALTER TABLE sales_invoices
  ADD CONSTRAINT sales_invoices_invoice_number_format_check
  CHECK (
    invoice_number IS NULL
    OR invoice_number ~ '^INV-[0-9]+$'
  ),
  ADD CONSTRAINT sales_invoices_customer_name_snapshot_check
  CHECK (
    customer_name_snapshot IS NULL
    OR length(btrim(customer_name_snapshot)) > 0
  ),
  ADD CONSTRAINT sales_invoices_customer_phone_snapshot_check
  CHECK (
    customer_phone_snapshot IS NULL
    OR length(btrim(customer_phone_snapshot)) > 0
  ),
  ADD CONSTRAINT sales_invoices_totals_check
  CHECK (
    discount_paisa <= subtotal_paisa
    AND grand_total_paisa = subtotal_paisa - discount_paisa
    AND paid_amount_paisa + due_paisa = grand_total_paisa
  ),
  ADD CONSTRAINT sales_invoices_settlement_projection_check
  CHECK (
    (
      settlement_status = 'DUE'
      AND paid_amount_paisa = 0
      AND due_paisa = grand_total_paisa
    )
    OR
    (
      settlement_status = 'PARTIAL'
      AND paid_amount_paisa > 0
      AND due_paisa > 0
    )
    OR
    (
      settlement_status = 'PAID'
      AND due_paisa = 0
      AND paid_amount_paisa = grand_total_paisa
    )
  );

CREATE UNIQUE INDEX sales_invoices_number_uidx
  ON sales_invoices (tenant_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE UNIQUE INDEX sales_invoices_operation_uidx
  ON sales_invoices (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX sales_invoices_customer_idx
  ON sales_invoices
    (tenant_id, customer_id, business_date DESC, created_at DESC, id DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX sales_invoices_phone_history_idx
  ON sales_invoices
    (
      tenant_id,
      customer_normalized_phone_snapshot,
      business_date DESC,
      created_at DESC,
      id DESC
    )
  WHERE customer_normalized_phone_snapshot IS NOT NULL
    AND btrim(customer_normalized_phone_snapshot) <> '';

ALTER TABLE sales_lines
  ADD COLUMN product_id UUID,
  ADD COLUMN unit_id UUID,
  ADD COLUMN product_name_snapshot TEXT,
  ADD COLUMN variant_name_snapshot TEXT,
  ADD COLUMN unit_name_snapshot TEXT,
  ADD COLUMN unit_symbol_snapshot TEXT,
  ADD COLUMN pricing_qty NUMERIC(24, 8),
  ADD COLUMN display_components_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN conversion_snapshot JSONB,
  ADD COLUMN conversion_profile_version INTEGER,
  ADD COLUMN tracking_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN gross_amount_paisa BIGINT,
  ADD COLUMN allocated_discount_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (allocated_discount_paisa >= 0),
  ADD COLUMN net_amount_paisa BIGINT;

UPDATE sales_lines line
SET product_id = product.id,
    unit_id = product.base_unit_id,
    product_name_snapshot = product.name,
    variant_name_snapshot = COALESCE(variant.display_name, ''),
    unit_name_snapshot = unit.name,
    unit_symbol_snapshot = COALESCE(unit.symbol, ''),
    pricing_qty = line.base_qty,
    gross_amount_paisa = line.final_sales_total_paisa,
    allocated_discount_paisa = 0,
    net_amount_paisa = line.final_sales_total_paisa
FROM product_variants variant
JOIN products product
  ON product.tenant_id = variant.tenant_id
 AND product.id = variant.product_id
JOIN units unit
  ON unit.tenant_id = product.tenant_id
 AND unit.id = product.base_unit_id
WHERE variant.tenant_id = line.tenant_id
  AND variant.id = line.variant_id;

ALTER TABLE sales_lines
  ADD CONSTRAINT sales_lines_product_fk
  FOREIGN KEY (tenant_id, product_id)
  REFERENCES products (tenant_id, id),
  ADD CONSTRAINT sales_lines_unit_fk
  FOREIGN KEY (tenant_id, unit_id)
  REFERENCES units (tenant_id, id),
  ADD CONSTRAINT sales_lines_pricing_qty_check
  CHECK (pricing_qty IS NULL OR pricing_qty > 0),
  ADD CONSTRAINT sales_lines_conversion_profile_version_check
  CHECK (
    conversion_profile_version IS NULL
    OR conversion_profile_version > 0
  ),
  ADD CONSTRAINT sales_lines_display_components_object_check
  CHECK (jsonb_typeof(display_components_snapshot) = 'object'),
  ADD CONSTRAINT sales_lines_conversion_snapshot_object_check
  CHECK (
    conversion_snapshot IS NULL
    OR jsonb_typeof(conversion_snapshot) = 'object'
  ),
  ADD CONSTRAINT sales_lines_tracking_snapshot_object_check
  CHECK (jsonb_typeof(tracking_snapshot) = 'object'),
  ADD CONSTRAINT sales_lines_mature_amounts_check
  CHECK (
    (
      gross_amount_paisa IS NULL
      AND net_amount_paisa IS NULL
    )
    OR
    (
      gross_amount_paisa IS NOT NULL
      AND gross_amount_paisa >= 0
      AND net_amount_paisa IS NOT NULL
      AND net_amount_paisa >= 0
      AND allocated_discount_paisa <= gross_amount_paisa
      AND net_amount_paisa =
        gross_amount_paisa - allocated_discount_paisa
    )
  );

CREATE INDEX sales_lines_product_snapshot_idx
  ON sales_lines (tenant_id, product_id, sale_id, id)
  WHERE product_id IS NOT NULL;

CREATE TABLE sales_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  client_line_id TEXT NOT NULL
    CHECK (length(btrim(client_line_id)) > 0),
  method TEXT NOT NULL
    CHECK (
      method IN (
        'CASH',
        'BANK',
        'MOBILE_BANKING',
        'CUSTOMER_CREDIT'
      )
    ),
  financial_account_id UUID,
  tendered_amount_paisa BIGINT NOT NULL
    CHECK (tendered_amount_paisa > 0),
  applied_amount_paisa BIGINT NOT NULL
    CHECK (
      applied_amount_paisa >= 0
      AND applied_amount_paisa <= tendered_amount_paisa
    ),
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  cash_session_id UUID,
  created_by_user_id UUID NOT NULL,
  reversal_of_payment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sale_id, client_line_id),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales_invoices (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, financial_account_id)
    REFERENCES financial_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, cash_session_id)
    REFERENCES cash_sessions (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, id),
  FOREIGN KEY (tenant_id, reversal_of_payment_id)
    REFERENCES sales_payments (tenant_id, id),
  CHECK (
    (
      method IN ('CASH', 'CUSTOMER_CREDIT')
      AND financial_account_id IS NULL
    )
    OR
    (
      method IN ('BANK', 'MOBILE_BANKING')
      AND financial_account_id IS NOT NULL
    )
  ),
  CHECK (
    method = 'CASH'
    OR cash_session_id IS NULL
  )
);

CREATE INDEX sales_payments_sale_idx
  ON sales_payments (tenant_id, sale_id, created_at, id);

CREATE INDEX sales_payments_account_idx
  ON sales_payments
    (tenant_id, financial_account_id, created_at, id)
  WHERE financial_account_id IS NOT NULL;

CREATE INDEX sales_payments_cash_session_idx
  ON sales_payments
    (tenant_id, cash_session_id, created_at, id)
  WHERE cash_session_id IS NOT NULL;
