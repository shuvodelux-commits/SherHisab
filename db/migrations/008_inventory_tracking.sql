ALTER TABLE products
  DROP CONSTRAINT products_tracking_mode_check;

UPDATE products
SET tracking_mode = CASE
  WHEN tracking_mode = 'LOT' THEN 'SIMPLE'
  WHEN tracking_mode = 'BATCH' THEN 'BATCH_EXPIRY'
  ELSE tracking_mode
END;

ALTER TABLE products
  ADD CONSTRAINT products_tracking_mode_check
  CHECK (tracking_mode IN ('SIMPLE', 'SERIAL', 'BATCH_EXPIRY'));

ALTER TABLE products
  ADD COLUMN allocation_policy TEXT NOT NULL DEFAULT 'FIFO'
  CHECK (allocation_policy IN ('FIFO', 'FEFO'));

CREATE INDEX inventory_lots_fefo_idx
  ON inventory_lots
    (tenant_id, variant_id, expires_on ASC, received_on ASC, id ASC)
  WHERE remaining_base_qty > 0
    AND status = 'ACTIVE';

CREATE TABLE inventory_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  lot_id UUID,
  serial_number TEXT NOT NULL
    CHECK (length(btrim(serial_number)) > 0),
  status TEXT NOT NULL DEFAULT 'IN_STOCK'
    CHECK (status IN ('IN_STOCK', 'SOLD', 'RETURNED')),
  received_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, lot_id)
    REFERENCES inventory_lots (tenant_id, id)
);

CREATE UNIQUE INDEX inventory_serials_variant_serial_uidx
  ON inventory_serials (tenant_id, variant_id, btrim(serial_number));

CREATE INDEX inventory_serials_sellable_idx
  ON inventory_serials
    (tenant_id, variant_id, status, received_on, id)
  WHERE status IN ('IN_STOCK', 'RETURNED');

CREATE TABLE sales_line_serials (
  tenant_id UUID NOT NULL,
  sales_line_id UUID NOT NULL,
  serial_id UUID NOT NULL,
  serial_number_snapshot TEXT NOT NULL
    CHECK (length(btrim(serial_number_snapshot)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, sales_line_id, serial_id),
  FOREIGN KEY (tenant_id, sales_line_id)
    REFERENCES sales_lines (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, serial_id)
    REFERENCES inventory_serials (tenant_id, id)
);

CREATE INDEX sales_line_serials_serial_idx
  ON sales_line_serials (tenant_id, serial_id, created_at, sales_line_id);

CREATE TABLE product_warranty_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  duration_value INTEGER,
  duration_unit TEXT
    CHECK (
      duration_unit IS NULL
      OR duration_unit IN ('DAY', 'MONTH', 'YEAR')
    ),
  provider TEXT NOT NULL DEFAULT '',
  warranty_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id),
  FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id) ON DELETE CASCADE,
  CHECK (
    (NOT is_enabled)
    OR (
      duration_value IS NOT NULL
      AND duration_value > 0
      AND duration_unit IS NOT NULL
    )
  )
);

CREATE TABLE warranty_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sales_line_id UUID NOT NULL,
  serial_id UUID,
  source_policy_id UUID,
  duration_value INTEGER NOT NULL CHECK (duration_value > 0),
  duration_unit TEXT NOT NULL
    CHECK (duration_unit IN ('DAY', 'MONTH', 'YEAR')),
  provider_snapshot TEXT NOT NULL DEFAULT '',
  warranty_text_snapshot TEXT NOT NULL DEFAULT '',
  starts_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, sales_line_id)
    REFERENCES sales_lines (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, serial_id)
    REFERENCES inventory_serials (tenant_id, id),
  FOREIGN KEY (tenant_id, source_policy_id)
    REFERENCES product_warranty_policies (tenant_id, id)
);

CREATE INDEX warranty_snapshots_sales_line_idx
  ON warranty_snapshots (tenant_id, sales_line_id, id);

CREATE TABLE product_capture_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  field_key TEXT NOT NULL CHECK (length(btrim(field_key)) > 0),
  label TEXT NOT NULL CHECK (length(btrim(label)) > 0),
  field_type TEXT NOT NULL
    CHECK (field_type IN ('text', 'number', 'date', 'select')),
  select_options JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(select_options) = 'array'),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id) ON DELETE CASCADE,
  CHECK (
    (field_type = 'select' AND jsonb_array_length(select_options) > 0)
    OR
    (field_type <> 'select' AND select_options = '[]'::jsonb)
  )
);

CREATE UNIQUE INDEX product_capture_fields_active_key_uidx
  ON product_capture_field_definitions
    (tenant_id, product_id, lower(btrim(field_key)))
  WHERE is_active;

CREATE INDEX product_capture_fields_product_idx
  ON product_capture_field_definitions
    (tenant_id, product_id, sort_order, id)
  WHERE is_active;

CREATE TABLE sales_line_capture_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sales_line_id UUID NOT NULL,
  definition_id UUID,
  field_key_snapshot TEXT NOT NULL
    CHECK (length(btrim(field_key_snapshot)) > 0),
  label_snapshot TEXT NOT NULL
    CHECK (length(btrim(label_snapshot)) > 0),
  field_type_snapshot TEXT NOT NULL
    CHECK (field_type_snapshot IN ('text', 'number', 'date', 'select')),
  value_snapshot TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sales_line_id, field_key_snapshot),
  FOREIGN KEY (tenant_id, sales_line_id)
    REFERENCES sales_lines (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, definition_id)
    REFERENCES product_capture_field_definitions (tenant_id, id)
);

CREATE INDEX sales_line_capture_values_line_idx
  ON sales_line_capture_values (tenant_id, sales_line_id, id);
