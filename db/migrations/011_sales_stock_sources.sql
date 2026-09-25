ALTER TABLE inventory_lots
  DROP CONSTRAINT inventory_lots_source_type_check;

ALTER TABLE inventory_lots
  ADD CONSTRAINT inventory_lots_source_type_check
  CHECK (source_type IN ('OPENING', 'ADJUSTMENT', 'PURCHASE'));

ALTER TABLE inventory_movements
  DROP CONSTRAINT inventory_movements_movement_type_check;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (
    movement_type IN (
      'OPENING',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'SALE',
      'PURCHASE',
      'RETURN'
    )
  );

CREATE TABLE inventory_shortfalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_line_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  original_shortfall_base_qty NUMERIC(24, 8) NOT NULL
    CHECK (original_shortfall_base_qty > 0),
  outstanding_base_qty NUMERIC(24, 8) NOT NULL
    CHECK (
      outstanding_base_qty >= 0
      AND outstanding_base_qty <= original_shortfall_base_qty
    ),
  provisional_unit_cost_paisa BIGINT NOT NULL
    CHECK (provisional_unit_cost_paisa >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_at TIMESTAMPTZ,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, sales_line_id)
    REFERENCES sales_lines (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id),
  CHECK (
    (outstanding_base_qty = 0 AND reconciled_at IS NOT NULL)
    OR
    (outstanding_base_qty > 0 AND reconciled_at IS NULL)
  )
);

CREATE INDEX inventory_shortfalls_oldest_outstanding_idx
  ON inventory_shortfalls
    (tenant_id, variant_id, created_at, id)
  WHERE outstanding_base_qty > 0;

CREATE TABLE inventory_shortfall_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shortfall_id UUID NOT NULL,
  purchase_lot_id UUID NOT NULL,
  reconciled_base_qty NUMERIC(24, 8) NOT NULL
    CHECK (reconciled_base_qty > 0),
  provisional_unit_cost_paisa BIGINT NOT NULL
    CHECK (provisional_unit_cost_paisa >= 0),
  actual_unit_cost_paisa BIGINT NOT NULL
    CHECK (actual_unit_cost_paisa >= 0),
  cogs_adjustment_paisa BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, shortfall_id)
    REFERENCES inventory_shortfalls (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_lot_id)
    REFERENCES inventory_lots (tenant_id, id)
);

CREATE INDEX inventory_shortfall_reconciliations_shortfall_idx
  ON inventory_shortfall_reconciliations
    (tenant_id, shortfall_id, created_at, id);

CREATE TABLE vendor_sourcing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_line_id UUID NOT NULL,
  vendor_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  business_date DATE NOT NULL,
  base_qty NUMERIC(24, 8) NOT NULL CHECK (base_qty > 0),
  unit_cost_paisa BIGINT NOT NULL CHECK (unit_cost_paisa >= 0),
  total_cost_paisa BIGINT NOT NULL CHECK (total_cost_paisa >= 0),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'SETTLED', 'RETURNED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, sales_line_id)
    REFERENCES sales_lines (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES vendors (tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id)
);

CREATE INDEX vendor_sourcing_vendor_idx
  ON vendor_sourcing
    (tenant_id, vendor_id, status, business_date, created_at, id);

CREATE INDEX vendor_sourcing_sales_line_idx
  ON vendor_sourcing
    (tenant_id, sales_line_id, id);

CREATE TABLE sales_line_vendor_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_line_id UUID NOT NULL,
  vendor_sourcing_id UUID NOT NULL,
  vendor_id UUID NOT NULL,
  base_qty NUMERIC(24, 8) NOT NULL CHECK (base_qty > 0),
  unit_cost_paisa BIGINT NOT NULL CHECK (unit_cost_paisa >= 0),
  total_cost_paisa BIGINT NOT NULL CHECK (total_cost_paisa >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sales_line_id, vendor_sourcing_id),
  FOREIGN KEY (tenant_id, sales_line_id)
    REFERENCES sales_lines (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, vendor_sourcing_id)
    REFERENCES vendor_sourcing (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES vendors (tenant_id, id)
);

CREATE INDEX sales_line_vendor_allocations_line_idx
  ON sales_line_vendor_allocations
    (tenant_id, sales_line_id, created_at, id);
