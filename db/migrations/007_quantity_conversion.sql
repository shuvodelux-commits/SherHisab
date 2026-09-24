CREATE TABLE product_conversion_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  profile_type TEXT NOT NULL
    CHECK (
      profile_type IN (
        'SIMPLE',
        'PACK',
        'LENGTH',
        'COMPOUND',
        'CUSTOM_FIXED_RATIO'
      )
    ),
  version INTEGER NOT NULL CHECK (version > 0),
  base_unit_id UUID NOT NULL,
  pricing_unit_id UUID NOT NULL,
  pricing_base_factor_numerator BIGINT NOT NULL
    CHECK (pricing_base_factor_numerator > 0),
  pricing_base_factor_denominator BIGINT NOT NULL
    CHECK (pricing_base_factor_denominator > 0),
  display_precision SMALLINT NOT NULL DEFAULT 2
    CHECK (display_precision BETWEEN 0 AND 8),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, version),
  FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, base_unit_id)
    REFERENCES units (tenant_id, id),
  FOREIGN KEY (tenant_id, pricing_unit_id)
    REFERENCES units (tenant_id, id)
);

CREATE UNIQUE INDEX product_conversion_profiles_one_active_uidx
  ON product_conversion_profiles (tenant_id, product_id)
  WHERE is_active;

CREATE INDEX product_conversion_profiles_product_idx
  ON product_conversion_profiles
    (tenant_id, product_id, version DESC);

CREATE TABLE product_conversion_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  component_key TEXT NOT NULL
    CHECK (length(btrim(component_key)) > 0),
  label TEXT NOT NULL CHECK (length(btrim(label)) > 0),
  unit_id UUID NOT NULL,
  base_factor_numerator BIGINT NOT NULL
    CHECK (base_factor_numerator > 0),
  base_factor_denominator BIGINT NOT NULL
    CHECK (base_factor_denominator > 0),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  min_value NUMERIC(24, 8) NOT NULL DEFAULT 0,
  max_exclusive NUMERIC(24, 8),
  allow_fraction BOOLEAN NOT NULL DEFAULT FALSE,
  auto_normalize_remainder BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, profile_id, component_key),
  UNIQUE (tenant_id, profile_id, sort_order),
  FOREIGN KEY (tenant_id, profile_id)
    REFERENCES product_conversion_profiles (tenant_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES units (tenant_id, id),
  CHECK (max_exclusive IS NULL OR max_exclusive > min_value)
);

CREATE INDEX product_conversion_components_profile_idx
  ON product_conversion_components
    (tenant_id, profile_id, sort_order, id);
