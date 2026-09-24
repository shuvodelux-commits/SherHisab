ALTER TABLE users
  ADD COLUMN role TEXT;

UPDATE users
SET role = 'OWNER'
WHERE role IS NULL;

ALTER TABLE users
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN role SET DEFAULT 'STAFF';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('OWNER', 'ADMIN', 'STAFF'));

CREATE TABLE user_permission_grants (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  permission_key TEXT NOT NULL
    CHECK (
      permission_key IN (
        'SALES_OVERRIDE_SELLING_PRICE',
        'INVENTORY_EDIT_LOT_SELLING_PRICE'
      )
    ),
  granted_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, permission_key),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, granted_by_user_id)
    REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX user_permission_grants_user_idx
  ON user_permission_grants (tenant_id, user_id);

CREATE TABLE inventory_lot_selling_price_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lot_id UUID NOT NULL,
  old_selling_price_paisa BIGINT NOT NULL
    CHECK (old_selling_price_paisa >= 0),
  new_selling_price_paisa BIGINT NOT NULL
    CHECK (new_selling_price_paisa >= 0),
  changed_by_user_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, lot_id)
    REFERENCES inventory_lots (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, changed_by_user_id)
    REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX inventory_lot_selling_price_audit_lot_idx
  ON inventory_lot_selling_price_audit
    (tenant_id, lot_id, changed_at DESC, id DESC);
