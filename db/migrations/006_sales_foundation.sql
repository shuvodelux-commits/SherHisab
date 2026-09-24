ALTER TABLE inventory_movements
  DROP CONSTRAINT inventory_movements_movement_type_check;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (
    movement_type IN (
      'OPENING',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'SALE'
    )
  );

CREATE TABLE sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  total_sales_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (total_sales_paisa >= 0),
  total_cogs_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (total_cogs_paisa >= 0),
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, id)
);

CREATE INDEX sales_invoices_date_idx
  ON sales_invoices (tenant_id, business_date DESC, created_at DESC, id DESC);

CREATE TABLE sales_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  base_qty NUMERIC(24, 8) NOT NULL
    CHECK (base_qty > 0),
  pricing_mode TEXT NOT NULL
    CHECK (pricing_mode IN ('LOT', 'MANUAL')),
  automatic_sales_total_paisa BIGINT NOT NULL
    CHECK (automatic_sales_total_paisa >= 0),
  manual_unit_selling_price_paisa BIGINT
    CHECK (
      manual_unit_selling_price_paisa IS NULL
      OR manual_unit_selling_price_paisa >= 0
    ),
  final_sales_total_paisa BIGINT NOT NULL
    CHECK (final_sales_total_paisa >= 0),
  cogs_paisa BIGINT NOT NULL
    CHECK (cogs_paisa >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales_invoices (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id),
  CHECK (
    (pricing_mode = 'LOT' AND manual_unit_selling_price_paisa IS NULL)
    OR
    (pricing_mode = 'MANUAL' AND manual_unit_selling_price_paisa IS NOT NULL)
  )
);

CREATE INDEX sales_lines_sale_idx
  ON sales_lines (tenant_id, sale_id, id);

CREATE TABLE sales_line_lot_allocations (
  tenant_id UUID NOT NULL,
  sales_line_id UUID NOT NULL,
  lot_id UUID NOT NULL,
  base_qty NUMERIC(24, 8) NOT NULL
    CHECK (base_qty > 0),
  unit_cost_paisa BIGINT NOT NULL
    CHECK (unit_cost_paisa >= 0),
  lot_selling_price_paisa BIGINT NOT NULL
    CHECK (lot_selling_price_paisa >= 0),
  automatic_sales_amount_paisa BIGINT NOT NULL
    CHECK (automatic_sales_amount_paisa >= 0),
  cogs_amount_paisa BIGINT NOT NULL
    CHECK (cogs_amount_paisa >= 0),
  PRIMARY KEY (tenant_id, sales_line_id, lot_id),
  FOREIGN KEY (tenant_id, sales_line_id)
    REFERENCES sales_lines (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, lot_id)
    REFERENCES inventory_lots (tenant_id, id)
);

CREATE INDEX sales_line_lot_allocations_lot_idx
  ON sales_line_lot_allocations (tenant_id, lot_id);
