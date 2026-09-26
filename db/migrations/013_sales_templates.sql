CREATE TABLE sales_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, id)
);

CREATE INDEX sales_templates_active_idx
  ON sales_templates (tenant_id, status, updated_at DESC, id DESC);

CREATE TABLE sales_template_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  variant_id UUID NOT NULL,
  quantity_input_snapshot JSONB NOT NULL
    CHECK (jsonb_typeof(quantity_input_snapshot) = 'object'),
  normalized_quantity_snapshot JSONB NOT NULL
    CHECK (jsonb_typeof(normalized_quantity_snapshot) = 'object'),
  pricing_strategy TEXT NOT NULL DEFAULT 'CURRENT_AUTO'
    CHECK (pricing_strategy IN ('CURRENT_AUTO', 'FIXED_MANUAL')),
  manual_unit_selling_price_paisa BIGINT
    CHECK (manual_unit_selling_price_paisa IS NULL
      OR manual_unit_selling_price_paisa >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, template_id, sort_order),
  UNIQUE (tenant_id, template_id, variant_id),
  FOREIGN KEY (tenant_id, template_id)
    REFERENCES sales_templates (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id),
  CHECK (
    (pricing_strategy = 'CURRENT_AUTO'
      AND manual_unit_selling_price_paisa IS NULL)
    OR
    (pricing_strategy = 'FIXED_MANUAL'
      AND manual_unit_selling_price_paisa IS NOT NULL)
  )
);

CREATE INDEX sales_template_lines_template_idx
  ON sales_template_lines (tenant_id, template_id, sort_order);
