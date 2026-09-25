ALTER TABLE user_permission_grants
  DROP CONSTRAINT IF EXISTS user_permission_grants_permission_key_check;

ALTER TABLE user_permission_grants
  ADD CONSTRAINT user_permission_grants_permission_key_check
  CHECK (
    permission_key IN (
      'POS_VIEW',
      'POS_SELL',
      'SALES_VIEW',
      'SALES_EDIT',
      'SALES_RETURN',
      'SALES_OVERRIDE_SELLING_PRICE',
      'POS_COST_VIEW',
      'SALES_TEMPLATE_VIEW',
      'SALES_TEMPLATE_MANAGE',
      'SALES_BACKDATE',
      'INVENTORY_EDIT_LOT_SELLING_PRICE'
    )
  );

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_code TEXT NOT NULL CHECK (length(btrim(customer_code)) > 0),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  phone TEXT NOT NULL DEFAULT '',
  normalized_phone TEXT NOT NULL DEFAULT '',
  guardian_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, customer_code)
);

CREATE INDEX customers_phone_idx
  ON customers (tenant_id, normalized_phone, id)
  WHERE is_active AND normalized_phone <> '';

CREATE INDEX customers_name_idx
  ON customers (tenant_id, lower(name), id)
  WHERE is_active;

CREATE TABLE customer_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  business_date DATE NOT NULL,
  entry_type TEXT NOT NULL CHECK (length(btrim(entry_type)) > 0),
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa <> 0),
  source_type TEXT NOT NULL CHECK (length(btrim(source_type)) > 0),
  source_id UUID,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX customer_ledger_customer_idx
  ON customer_ledger_entries
    (tenant_id, customer_id, business_date, created_at, id);

CREATE INDEX customer_ledger_source_idx
  ON customer_ledger_entries
    (tenant_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_code TEXT NOT NULL CHECK (length(btrim(vendor_code)) > 0),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, vendor_code)
);

CREATE INDEX vendors_name_idx
  ON vendors (tenant_id, lower(name), id)
  WHERE is_active;

CREATE TABLE vendor_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL,
  business_date DATE NOT NULL,
  entry_type TEXT NOT NULL CHECK (length(btrim(entry_type)) > 0),
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa <> 0),
  source_type TEXT NOT NULL CHECK (length(btrim(source_type)) > 0),
  source_id UUID,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES vendors (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX vendor_ledger_vendor_idx
  ON vendor_ledger_entries
    (tenant_id, vendor_id, business_date, created_at, id);

CREATE INDEX vendor_ledger_source_idx
  ON vendor_ledger_entries
    (tenant_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL
    CHECK (account_type IN ('BANK', 'MOBILE_BANKING')),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  provider TEXT NOT NULL DEFAULT '',
  account_reference TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX financial_accounts_active_idx
  ON financial_accounts (tenant_id, account_type, lower(name), id)
  WHERE is_active;

CREATE TABLE cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED')),
  opening_cash_paisa BIGINT NOT NULL
    CHECK (opening_cash_paisa >= 0),
  expected_cash_paisa BIGINT
    CHECK (expected_cash_paisa IS NULL OR expected_cash_paisa >= 0),
  counted_cash_paisa BIGINT
    CHECK (counted_cash_paisa IS NULL OR counted_cash_paisa >= 0),
  variance_paisa BIGINT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  opened_by_user_id UUID NOT NULL,
  closed_by_user_id UUID,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, opened_by_user_id)
    REFERENCES users (tenant_id, id),
  FOREIGN KEY (tenant_id, closed_by_user_id)
    REFERENCES users (tenant_id, id),
  CHECK (
    (status = 'OPEN'
      AND closed_at IS NULL
      AND expected_cash_paisa IS NULL
      AND counted_cash_paisa IS NULL
      AND variance_paisa IS NULL
      AND closed_by_user_id IS NULL)
    OR
    (status = 'CLOSED'
      AND closed_at IS NOT NULL
      AND expected_cash_paisa IS NOT NULL
      AND counted_cash_paisa IS NOT NULL
      AND variance_paisa IS NOT NULL
      AND closed_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX cash_sessions_one_open_uidx
  ON cash_sessions (tenant_id)
  WHERE status = 'OPEN';

CREATE INDEX cash_sessions_history_idx
  ON cash_sessions (tenant_id, opened_at DESC, id DESC);

CREATE TABLE financial_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL
    CHECK (channel IN ('CASH', 'BANK', 'MOBILE_BANKING')),
  financial_account_id UUID,
  cash_session_id UUID,
  business_date DATE NOT NULL,
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa <> 0),
  source_type TEXT NOT NULL CHECK (length(btrim(source_type)) > 0),
  source_id UUID,
  reversal_of_movement_id UUID,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, financial_account_id)
    REFERENCES financial_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, cash_session_id)
    REFERENCES cash_sessions (tenant_id, id),
  FOREIGN KEY (tenant_id, reversal_of_movement_id)
    REFERENCES financial_movements (tenant_id, id),
  CHECK (
    (channel = 'CASH' AND financial_account_id IS NULL)
    OR
    (channel IN ('BANK', 'MOBILE_BANKING')
      AND financial_account_id IS NOT NULL)
  )
);

CREATE INDEX financial_movements_account_idx
  ON financial_movements
    (tenant_id, financial_account_id, business_date, created_at, id)
  WHERE financial_account_id IS NOT NULL;

CREATE INDEX financial_movements_cash_session_idx
  ON financial_movements
    (tenant_id, cash_session_id, created_at, id)
  WHERE channel = 'CASH' AND cash_session_id IS NOT NULL;

CREATE INDEX financial_movements_source_idx
  ON financial_movements (tenant_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE tenant_pos_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  show_purchase_price BOOLEAN NOT NULL DEFAULT FALSE,
  require_cash_session BOOLEAN NOT NULL DEFAULT FALSE,
  invoice_share_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenant_pos_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE tenant_document_counters (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (length(btrim(document_type)) > 0),
  next_value BIGINT NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, document_type)
);
