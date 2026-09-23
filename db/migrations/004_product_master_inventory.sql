CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX product_categories_active_name_uidx
  ON product_categories (tenant_id, lower(btrim(name)))
  WHERE is_active;

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  symbol TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX units_active_name_uidx
  ON units (tenant_id, lower(btrim(name)))
  WHERE is_active;

INSERT INTO units (tenant_id, name, symbol)
SELECT id, 'Piece', 'pcs'
FROM tenants
ON CONFLICT DO NOTHING;

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  brand TEXT NOT NULL DEFAULT '',
  category_id UUID,
  base_unit_id UUID NOT NULL,
  tracking_mode TEXT NOT NULL DEFAULT 'SIMPLE'
    CHECK (tracking_mode IN ('SIMPLE', 'LOT', 'BATCH')),
  variants_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id)
    REFERENCES product_categories (tenant_id, id),
  FOREIGN KEY (tenant_id, base_unit_id)
    REFERENCES units (tenant_id, id)
);

CREATE UNIQUE INDEX products_active_name_uidx
  ON products (tenant_id, lower(btrim(name)))
  WHERE is_active;

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  display_name TEXT,
  sku TEXT,
  default_purchase_price_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (default_purchase_price_paisa >= 0),
  default_selling_price_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (default_selling_price_paisa >= 0),
  minimum_stock_base_qty NUMERIC(24, 8) NOT NULL DEFAULT 0
    CHECK (minimum_stock_base_qty >= 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX product_variants_one_default_uidx
  ON product_variants (tenant_id, product_id)
  WHERE is_default;

CREATE UNIQUE INDEX product_variants_active_sku_uidx
  ON product_variants (tenant_id, lower(btrim(sku)))
  WHERE is_active AND sku IS NOT NULL AND btrim(sku) <> '';

CREATE TABLE product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  conversion_mode TEXT NOT NULL
    CHECK (conversion_mode IN ('FIXED', 'VARIABLE')),
  conversion_to_base NUMERIC(24, 8),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES units (tenant_id, id),
  CHECK (
    (conversion_mode = 'FIXED' AND conversion_to_base > 0)
    OR
    (conversion_mode = 'VARIABLE' AND conversion_to_base IS NULL)
  )
);

CREATE UNIQUE INDEX product_units_active_product_unit_uidx
  ON product_units (tenant_id, product_id, unit_id)
  WHERE is_active;

CREATE TABLE product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  unit_id UUID,
  barcode TEXT NOT NULL CHECK (length(btrim(barcode)) > 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES units (tenant_id, id)
);

CREATE UNIQUE INDEX product_barcodes_active_barcode_uidx
  ON product_barcodes (tenant_id, btrim(barcode))
  WHERE is_active;

CREATE UNIQUE INDEX product_barcodes_one_primary_uidx
  ON product_barcodes (tenant_id, variant_id)
  WHERE is_active AND is_primary;

CREATE TABLE product_option_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX product_option_definitions_name_uidx
  ON product_option_definitions (tenant_id, product_id, lower(btrim(name)));

CREATE TABLE product_option_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  option_definition_id UUID NOT NULL,
  value TEXT NOT NULL CHECK (length(btrim(value)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, option_definition_id)
    REFERENCES product_option_definitions (tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX product_option_values_value_uidx
  ON product_option_values
     (tenant_id, option_definition_id, lower(btrim(value)));

CREATE TABLE product_variant_option_values (
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  option_value_id UUID NOT NULL,
  PRIMARY KEY (tenant_id, variant_id, option_value_id),
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, option_value_id)
    REFERENCES product_option_values (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE product_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  value TEXT NOT NULL CHECK (length(btrim(value)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('OPENING', 'ADJUSTMENT')),
  received_on DATE NOT NULL,
  unit_cost_paisa BIGINT NOT NULL CHECK (unit_cost_paisa >= 0),
  default_sell_price_paisa BIGINT NOT NULL DEFAULT 0
    CHECK (default_sell_price_paisa >= 0),
  original_base_qty NUMERIC(24, 8) NOT NULL CHECK (original_base_qty > 0),
  remaining_base_qty NUMERIC(24, 8) NOT NULL,
  lot_code TEXT,
  batch_code TEXT,
  expires_on DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DEPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id)
);

CREATE INDEX inventory_lots_fifo_idx
  ON inventory_lots (tenant_id, variant_id, received_on, id)
  WHERE remaining_base_qty > 0;

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('OPENING', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
  business_date DATE NOT NULL,
  base_qty_delta NUMERIC(24, 8) NOT NULL CHECK (base_qty_delta <> 0),
  balance_after_base_qty NUMERIC(24, 8) NOT NULL,
  reference_type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, id)
);

CREATE INDEX inventory_movements_variant_idx
  ON inventory_movements (tenant_id, variant_id, business_date, created_at, id);

CREATE TABLE inventory_movement_lot_allocations (
  tenant_id UUID NOT NULL,
  movement_id UUID NOT NULL,
  lot_id UUID NOT NULL,
  base_qty NUMERIC(24, 8) NOT NULL CHECK (base_qty > 0),
  unit_cost_paisa BIGINT NOT NULL CHECK (unit_cost_paisa >= 0),
  PRIMARY KEY (tenant_id, movement_id, lot_id),
  FOREIGN KEY (tenant_id, movement_id)
    REFERENCES inventory_movements (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, lot_id)
    REFERENCES inventory_lots (tenant_id, id)
);
