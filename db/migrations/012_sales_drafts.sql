CREATE TABLE sales_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_number TEXT NOT NULL
    CHECK (length(btrim(draft_number)) > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED', 'POSTED')),
  owner_user_id UUID NOT NULL,
  customer_id UUID,
  customer_name_snapshot TEXT NOT NULL DEFAULT '',
  customer_phone_snapshot TEXT NOT NULL DEFAULT '',
  customer_guardian_name_snapshot TEXT NOT NULL DEFAULT '',
  customer_address_snapshot TEXT NOT NULL DEFAULT '',
  discount_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (discount_paisa >= 0),
  payments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(payments_snapshot) = 'array'),
  note TEXT NOT NULL DEFAULT '',
  posted_sale_id UUID,
  posted_operation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, draft_number),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES users (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id),
  FOREIGN KEY (tenant_id, posted_sale_id)
    REFERENCES sales_invoices (tenant_id, id),
  CHECK (
    (status = 'POSTED' AND posted_sale_id IS NOT NULL)
    OR
    (status <> 'POSTED' AND posted_sale_id IS NULL)
  )
);

CREATE INDEX sales_drafts_recent_idx
  ON sales_drafts
    (tenant_id, status, updated_at DESC, id DESC);

CREATE INDEX sales_drafts_owner_idx
  ON sales_drafts
    (tenant_id, owner_user_id, status, updated_at DESC, id DESC);

CREATE TABLE sales_draft_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  variant_id UUID NOT NULL,
  base_qty NUMERIC(24, 8) NOT NULL CHECK (base_qty > 0),
  pricing_qty NUMERIC(24, 8) NOT NULL CHECK (pricing_qty > 0),
  display_qty TEXT NOT NULL DEFAULT '',
  quantity_input_snapshot JSONB NOT NULL
    CHECK (jsonb_typeof(quantity_input_snapshot) = 'object'),
  normalized_quantity_snapshot JSONB NOT NULL
    CHECK (jsonb_typeof(normalized_quantity_snapshot) = 'object'),
  pricing_mode TEXT NOT NULL
    CHECK (pricing_mode IN ('AUTO', 'MANUAL')),
  manual_unit_selling_price_paisa BIGINT
    CHECK (
      manual_unit_selling_price_paisa IS NULL
      OR manual_unit_selling_price_paisa >= 0
    ),
  shortage_resolution_type TEXT
    CHECK (
      shortage_resolution_type IS NULL
      OR shortage_resolution_type IN ('VENDOR', 'NEGATIVE_STOCK')
    ),
  vendor_id UUID,
  vendor_unit_cost_paisa BIGINT
    CHECK (
      vendor_unit_cost_paisa IS NULL
      OR vendor_unit_cost_paisa >= 0
    ),
  serial_ids_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(serial_ids_snapshot) = 'array'),
  batch_selection_snapshot JSONB,
  warranty_snapshot JSONB,
  capture_values_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(capture_values_snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, draft_id, sort_order),
  FOREIGN KEY (tenant_id, draft_id)
    REFERENCES sales_drafts (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id),
  FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES vendors (tenant_id, id),
  CHECK (
    (pricing_mode = 'AUTO' AND manual_unit_selling_price_paisa IS NULL)
    OR
    (pricing_mode = 'MANUAL' AND manual_unit_selling_price_paisa IS NOT NULL)
  ),
  CHECK (
    (
      shortage_resolution_type = 'VENDOR'
      AND vendor_id IS NOT NULL
      AND vendor_unit_cost_paisa IS NOT NULL
    )
    OR
    (
      shortage_resolution_type = 'NEGATIVE_STOCK'
      AND vendor_id IS NULL
      AND vendor_unit_cost_paisa IS NULL
    )
    OR
    (
      shortage_resolution_type IS NULL
      AND vendor_id IS NULL
      AND vendor_unit_cost_paisa IS NULL
    )
  ),
  CHECK (
    batch_selection_snapshot IS NULL
    OR jsonb_typeof(batch_selection_snapshot) = 'object'
  ),
  CHECK (
    warranty_snapshot IS NULL
    OR jsonb_typeof(warranty_snapshot) = 'object'
  )
);

CREATE INDEX sales_draft_lines_draft_idx
  ON sales_draft_lines
    (tenant_id, draft_id, sort_order, id);

CREATE INDEX sales_draft_lines_variant_idx
  ON sales_draft_lines
    (tenant_id, variant_id, draft_id, id);

CREATE TABLE sales_draft_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL,
  draft_version INTEGER NOT NULL CHECK (draft_version > 0),
  action TEXT NOT NULL
    CHECK (action IN ('CREATED', 'UPDATED', 'ARCHIVED', 'POSTED')),
  state_snapshot JSONB NOT NULL
    CHECK (jsonb_typeof(state_snapshot) = 'object'),
  actor_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, draft_id)
    REFERENCES sales_drafts (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES users (tenant_id, id)
);

CREATE INDEX sales_draft_audit_draft_idx
  ON sales_draft_audit
    (tenant_id, draft_id, draft_version, created_at, id);
