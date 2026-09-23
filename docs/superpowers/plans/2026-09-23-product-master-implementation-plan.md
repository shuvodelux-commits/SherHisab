# SherHisab Product Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tenant-safe, progressive Product Master that preserves the proven SherERP product/stock behavior while adding relational categories/units, a hidden default stock-bearing variant, exact FIFO inventory evidence, advanced product configuration foundations, and a compact bilingual Product UI.

**Architecture:** Product identity/configuration lives in relational master tables; every Product owns one hidden default `product_variant`, and all inventory evidence references `variant_id`. Inventory movements are quantity authority, lots are FIFO cost layers, and every multi-write operation runs in a PostgreSQL transaction using the request-scoped database connection so Cloudflare Hyperdrive never falls back to a module-global Worker pool.

**Tech Stack:** React 19, TypeScript 6, Vite 8, TanStack Router, TanStack Query, TanStack Table, Radix/shadcn-style UI primitives, Hono 4, PostgreSQL 17, `pg`, `decimal.js`, Vitest, pnpm 11.26.0.

**Spec:** `docs/superpowers/specs/2026-09-23-product-master-design.md`

## Global Constraints

- Preserve the working SherERP behavior from `shuvodelux-commits/sherERP_Mohim`; improve data integrity and UI, do not remove useful workflows.
- Product default form remains `Product Name → Brand → Category → Unit → Barcode → Purchase Price → Selling Price → Opening Stock → Minimum Stock`.
- Every Product has exactly one hidden/default stock-bearing Variant; operational inventory references `variant_id`.
- Every business-owned row contains `tenant_id`; trusted tenant identity comes from the authenticated session, never request bodies.
- Money is stored as integer paisa in PostgreSQL `BIGINT`; do not use floating-point money.
- Quantities and unit conversions are PostgreSQL `NUMERIC`; use `decimal.js` in backend business arithmetic.
- One Product has one base stock Unit. Fixed and variable alternative-unit conversions are supported.
- Inventory movements are quantity authority; lots are FIFO cost layers and must reconcile with movement-derived balances.
- FIFO ordering uses business date first and stable UUID/ID as deterministic tiebreak, never row-write time.
- Product Edit never silently changes stock. Stock changes use a dedicated Adjust Stock flow.
- Opening stock and positive manual adjustments require positive cost.
- Base unit changes are blocked after inventory evidence exists.
- Category/Unit/Product/Variant history survives archival/inactivation.
- Normal users do not see advanced variants, conversions, lots, batch policy, or specifications unless they enable/open advanced controls.
- Default UI language mode is English + Bangla helper; Full English and Full Bangla are supported for application copy only.
- English/UI font is Inter; Bangla font is Noto Sans Bengali.
- UI uses the committed `SHERHISAB_UI_CODING_INSTRUCTIONS.md`: compact 4px rhythm, 6px controls, hairline borders, restrained SherHisab blue, minimal shadow, no decorative SaaS card wall.
- Reuse TanStack Table and existing search-combobox utilities.
- Use Radix/shadcn-style Dialog and Dropdown Menu primitives rather than ad-hoc inaccessible modals/menus.
- Cloudflare database work must continue through `withRequestDatabase()`; never restore a module-global PostgreSQL Pool in Workers.
- Do not modify `legacy/`.
- TDD/RED first for behavior changes.
- Do not push or merge shared branches until verification passes and the user explicitly approves that action.

## Review Focus

- **Concurrent stock corrections:** two requests adjusting the same variant must serialize on the variant row and cannot double-consume the same FIFO lot; Task 5 adds a two-client concurrency test.
- **Decimal quantities:** values such as `2.5`, `0.125`, and `52.75` must remain exact through create, movement, and FIFO paths; Tasks 1 and 5 add schema/service tests.
- **Archived master reuse:** archiving a Category/Unit/Product must preserve historical references while allowing the old name to be created again; Tasks 1, 3, and 4 pin this behavior.
- **Variant reconfiguration with history:** a stock-bearing variant with inventory history cannot be removed or have its option combination silently changed; Task 6 tests both rejection paths.
- **Cross-tenant advanced references:** alternative units, barcodes, variants, category IDs, and option configuration from another tenant must be rejected even when IDs are syntactically valid; Tasks 3, 4, 6, and 7 exercise these paths.

---

## File Structure Map

### Database

- Create `db/migrations/004_product_master_inventory.sql` — relational Product Master, inventory evidence, tenant-safe constraints/indexes, and `pcs` backfill for existing tenants.

### API database/runtime utilities

- Modify `apps/api/src/db/transaction.ts` — add request-database-aware transaction execution without breaking existing `withTransaction()`.
- Modify `apps/api/src/modules/tenants/tenant.repository.ts` — seed the default `pcs` unit when a new tenant is created.

### API Product module

- Create `apps/api/src/modules/products/product.types.ts` — Product/Master/Inventory input and output contracts.
- Create `apps/api/src/modules/products/product.errors.ts` — predictable validation/not-found/conflict error classes.
- Create `apps/api/src/modules/products/product.validation.ts` — exact money/quantity/name/conversion validation helpers.
- Create `apps/api/src/modules/products/product-master.repository.ts` — categories, units, Products, Variants, units, barcodes, specs/options persistence.
- Create `apps/api/src/modules/products/inventory.repository.ts` — lot/movement/allocation persistence and row-locking queries.
- Create `apps/api/src/modules/products/product-master.service.ts` — Category/Unit/Product lifecycle and advanced configuration.
- Create `apps/api/src/modules/products/inventory.service.ts` — opening stock and Adjust Stock/FIFO behavior.
- Create `apps/api/src/modules/products/product.routes.ts` — authenticated Product/Master/Inventory HTTP routes.
- Modify `apps/api/src/app.ts` — mount Product routes under `/api/private`.

### API tests

- Create `apps/api/test/products/product-schema.test.ts`.
- Create `apps/api/test/products/product-masters.test.ts`.
- Create `apps/api/test/products/product-service.test.ts`.
- Create `apps/api/test/products/inventory-service.test.ts`.
- Create `apps/api/test/products/product-advanced.test.ts`.
- Create `apps/api/test/products/product-routes.test.ts`.
- Create `apps/api/test/products/product-test-helpers.ts` — tenant/user/product fixtures local to Product tests.

### Web shared UI/data utilities

- Modify `apps/web/package.json` and `pnpm-lock.yaml` — add Radix Dialog/Dropdown Menu and Lucide icons.
- Create `apps/web/src/components/ui/button.tsx`.
- Create `apps/web/src/components/ui/input.tsx`.
- Create `apps/web/src/components/ui/dialog.tsx`.
- Create `apps/web/src/components/ui/dropdown-menu.tsx`.
- Create `apps/web/src/components/ui/badge.tsx`.
- Create `apps/web/src/components/ui/bilingual-label.tsx`.
- Create `apps/web/src/app/language.tsx`.
- Create `apps/web/src/lib/money.ts`.
- Create `apps/web/src/lib/api-client.ts`.
- Modify `apps/web/src/main.tsx`.
- Modify `apps/web/src/components/topbar.tsx`.

### Web Product feature

- Create `apps/web/src/features/products/product-types.ts`.
- Create `apps/web/src/features/products/product-api.ts`.
- Create `apps/web/src/features/products/product-columns.tsx`.
- Create `apps/web/src/features/products/product-form-dialog.tsx`.
- Create `apps/web/src/features/products/product-advanced-fields.tsx`.
- Create `apps/web/src/features/products/stock-adjust-dialog.tsx`.
- Create `apps/web/src/features/products/product-page.tsx`.
- Create `apps/web/src/features/products/product-page.test.tsx`.
- Create `apps/web/src/features/products/product-form-dialog.test.tsx`.
- Create `apps/web/src/features/products/stock-adjust-dialog.test.tsx`.
- Create `apps/web/src/components/ui/bilingual-label.test.tsx`.
- Create `apps/web/src/lib/money.test.ts`.
- Modify `apps/web/src/app/router.tsx`.
- Modify `apps/web/src/components/sidebar.tsx`.
- Modify `apps/web/src/styles.css`.

---

### Task 1: Create the Product Master and Inventory Schema

**Files:**
- Create: `db/migrations/004_product_master_inventory.sql`
- Create: `apps/api/test/products/product-schema.test.ts`

**Interfaces:**
- Consumes: existing `tenants(id)`, `users(tenant_id,id)`.
- Produces: all Product/Master/Inventory tables and tenant-safe foreign-key/index contracts used by every later task.

- [ ] **Step 1: Write the failing schema integration test**

Create `apps/api/test/products/product-schema.test.ts` with database-gated tests that prove decimal quantity support, cross-tenant FK rejection, and archived-name reuse:

```ts
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const tenantIds: string[] = []

describe.skipIf(!hasDatabase)('product master schema', () => {
  afterEach(async () => {
    if (tenantIds.length) {
      await getPool().query(
        'DELETE FROM tenants WHERE id = ANY($1::uuid[])',
        [tenantIds.splice(0)],
      )
    }
  })

  afterAll(async () => {
    await closePool()
  })

  async function createTenant(name: string) {
    const result = await getPool().query<{ id: string }>(
      `INSERT INTO tenants (name, slug)
       VALUES ($1, $2)
       RETURNING id`,
      [name, `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}`],
    )
    const id = result.rows[0]!.id
    tenantIds.push(id)
    return id
  }

  it('stores exact decimal quantities', async () => {
    const tenantId = await createTenant('Decimal Tenant')
    const unit = await getPool().query<{ id: string }>(
      `INSERT INTO units (tenant_id, name, symbol)
       VALUES ($1, 'yard', 'yd') RETURNING id`,
      [tenantId],
    )
    const product = await getPool().query<{ id: string }>(
      `INSERT INTO products
       (tenant_id, name, base_unit_id, tracking_mode)
       VALUES ($1, 'Cotton Fabric', $2, 'SIMPLE') RETURNING id`,
      [tenantId, unit.rows[0]!.id],
    )
    const variant = await getPool().query<{ id: string }>(
      `INSERT INTO product_variants
       (tenant_id, product_id, is_default, minimum_stock_base_qty)
       VALUES ($1, $2, TRUE, '0.125') RETURNING id`,
      [tenantId, product.rows[0]!.id],
    )

    const row = await getPool().query<{ qty: string }>(
      `SELECT minimum_stock_base_qty::text AS qty
       FROM product_variants WHERE id = $1`,
      [variant.rows[0]!.id],
    )

    expect(row.rows[0]?.qty).toBe('0.125')
  })

  it('rejects a category from another tenant', async () => {
    const tenantA = await createTenant('Tenant A')
    const tenantB = await createTenant('Tenant B')
    const unitA = await getPool().query<{ id: string }>(
      `INSERT INTO units (tenant_id, name) VALUES ($1, 'pcs') RETURNING id`,
      [tenantA],
    )
    const categoryB = await getPool().query<{ id: string }>(
      `INSERT INTO product_categories (tenant_id, name)
       VALUES ($1, 'Foreign') RETURNING id`,
      [tenantB],
    )

    await expect(
      getPool().query(
        `INSERT INTO products
         (tenant_id, name, category_id, base_unit_id)
         VALUES ($1, 'Hammer', $2, $3)`,
        [tenantA, categoryB.rows[0]!.id, unitA.rows[0]!.id],
      ),
    ).rejects.toThrow()
  })

  it('allows an archived category name to be reused', async () => {
    const tenantId = await createTenant('Archive Tenant')
    await getPool().query(
      `INSERT INTO product_categories (tenant_id, name, is_active)
       VALUES ($1, 'Pipe', FALSE)`,
      [tenantId],
    )

    await expect(
      getPool().query(
        `INSERT INTO product_categories (tenant_id, name)
         VALUES ($1, 'pipe')`,
        [tenantId],
      ),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: Run the schema test and confirm RED**

Run from repository root:

```bash
export DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab_ci
pnpm --filter @sherhisab/api test -- test/products/product-schema.test.ts
```

This selects the local CI database and runs only the new schema test. Expected: FAIL because `units`, `product_categories`, `products`, and related tables do not exist.

- [ ] **Step 3: Create migration `004_product_master_inventory.sql`**

Implement the migration with these exact table responsibilities and constraints:

```sql
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
```

Use `IF NOT EXISTS` only where the repository's migration convention needs rerun safety; do not weaken constraints to make reruns succeed.

- [ ] **Step 4: Apply the migration to the local CI database**

```bash
export DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab_ci
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/004_product_master_inventory.sql
```

This applies only the new Product Master migration. Expected: PostgreSQL exits successfully.

- [ ] **Step 5: Run the schema test and verify GREEN**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the schema slice**

```bash
git add db/migrations/004_product_master_inventory.sql apps/api/test/products/product-schema.test.ts
git commit -m "feat: add product master inventory schema"
```

---

### Task 2: Add Request-Scoped Transactions and Default Unit Seeding

**Files:**
- Modify: `apps/api/src/db/transaction.ts`
- Modify: `apps/api/src/modules/tenants/tenant.repository.ts`
- Modify: `apps/api/test/db.test.ts`
- Modify: `apps/api/test/tenants/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: `DatabaseClient` from `request-database.ts`.
- Produces:
  - `withDatabaseTransaction<T>(database: DatabaseClient, work: (client: Client | PoolClient) => Promise<T>): Promise<T>`
  - every newly created tenant owns one active `Piece` / `pcs` Unit.

- [ ] **Step 1: Add RED tests for request-scoped rollback and tenant default Unit**

In `apps/api/test/db.test.ts`, add a test that passes `getPool()` into `withDatabaseTransaction()`, inserts a row, throws, and proves rollback.

In `apps/api/test/tenants/tenant-isolation.test.ts`, after creating a tenant, assert:

```ts
const units = await getPool().query<{ name: string; symbol: string | null }>(
  `SELECT name, symbol
   FROM units
   WHERE tenant_id = $1 AND is_active
   ORDER BY name`,
  [tenantA.id],
)

expect(units.rows).toContainEqual({
  name: 'Piece',
  symbol: 'pcs',
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm --filter @sherhisab/api test -- test/db.test.ts test/tenants/tenant-isolation.test.ts
```

Expected: FAIL because `withDatabaseTransaction` and future-tenant Unit seeding are not implemented.

- [ ] **Step 3: Implement `withDatabaseTransaction` without changing Worker connection strategy**

Keep existing `withTransaction()` for compatibility, then add:

```ts
import { Pool, type Client, type PoolClient } from 'pg'
import type { DatabaseClient } from './request-database'

type TransactionClient = Client | PoolClient

async function runTransaction<T>(
  client: TransactionClient,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export async function withDatabaseTransaction<T>(
  database: DatabaseClient,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  if (database instanceof Pool) {
    const client = await database.connect()
    try {
      return await runTransaction(client, work)
    } finally {
      client.release()
    }
  }

  return runTransaction(database, work)
}
```

Do not change `withRequestDatabase()` to a module-global Pool for Hyperdrive.

- [ ] **Step 4: Seed `Piece/pcs` atomically inside Tenant creation**

Update `TenantRepository.create()` to call `withDatabaseTransaction(this.db, ...)`, insert the tenant, then insert:

```sql
INSERT INTO units (tenant_id, name, symbol)
VALUES ($1, 'Piece', 'pcs')
```

Return the tenant only after both writes succeed.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
pnpm --filter @sherhisab/api test -- test/db.test.ts test/tenants/tenant-isolation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/transaction.ts apps/api/src/modules/tenants/tenant.repository.ts apps/api/test/db.test.ts apps/api/test/tenants/tenant-isolation.test.ts
git commit -m "feat: add request scoped transactions"
```

---

### Task 3: Implement Category and Unit Masters

**Files:**
- Create: `apps/api/src/modules/products/product.types.ts`
- Create: `apps/api/src/modules/products/product.errors.ts`
- Create: `apps/api/src/modules/products/product.validation.ts`
- Create: `apps/api/src/modules/products/product-master.repository.ts`
- Create: `apps/api/src/modules/products/product-master.service.ts`
- Create: `apps/api/test/products/product-masters.test.ts`
- Create: `apps/api/test/products/product-test-helpers.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces:
  - `MasterRecord { id, name, isActive }`
  - `UnitRecord { id, name, symbol, isActive }`
  - `ProductMasterService.listCategories()`
  - `createCategory(name)`, `setCategoryActive(id, active)`
  - `listUnits()`, `createUnit({ name, symbol })`, `setUnitActive(id, active)`
  - exact value helpers `parseMoneyPaisa()`, `parseQuantity()`, `parsePositiveConversion()`.

- [ ] **Step 1: Add `decimal.js`**

```bash
pnpm --filter @sherhisab/api add decimal.js
```

This adds exact decimal business arithmetic to the API and updates the lockfile.

- [ ] **Step 2: Define shared Product contracts**

In `product.types.ts`, define:

```ts
export type TrackingMode = 'SIMPLE' | 'LOT' | 'BATCH'
export type ConversionMode = 'FIXED' | 'VARIABLE'
export type ProductStatusFilter = 'active' | 'inactive' | 'all'

export interface CategoryRecord {
  id: string
  name: string
  isActive: boolean
}

export interface UnitRecord {
  id: string
  name: string
  symbol: string | null
  isActive: boolean
}

export interface CreateUnitInput {
  name: string
  symbol?: string | null
}

export interface CreateProductInput {
  name: string
  brand?: string
  categoryId?: string | null
  baseUnitId: string
  barcode?: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  openingStockBaseQty: string
  minimumStockBaseQty: string
  trackingMode?: TrackingMode
}

export interface UpdateProductInput {
  name: string
  brand?: string
  categoryId?: string | null
  baseUnitId: string
  barcode?: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  trackingMode: TrackingMode
}

export interface ProductListFilters {
  search?: string
  categoryId?: string
  brand?: string
  status?: ProductStatusFilter
  limit?: number
  offset?: number
}
```

Continue this file in later tasks rather than duplicating types elsewhere.

- [ ] **Step 3: Write RED master-service tests**

`product-masters.test.ts` must prove:

1. Tenant A cannot see Tenant B categories/units.
2. Active Category names are case-insensitively unique.
3. Archived Category name can be recreated.
4. Active Unit names are case-insensitively unique.
5. Archived Unit name can be recreated.
6. Empty/whitespace names are rejected.
7. Cross-tenant IDs never appear from list methods.

Use a helper that creates real tenants through `TenantService.createTenant()` and cleans them by tenant ID.

- [ ] **Step 4: Run master tests and verify RED**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-masters.test.ts
```

Expected: FAIL because Product master repository/service do not exist.

- [ ] **Step 5: Implement exact validation helpers**

`product.validation.ts` must use `Decimal` and `BigInt`, never `Number()` for authoritative money/quantity validation:

```ts
import Decimal from 'decimal.js'
import { ProductValidationError } from './product.errors'

export function requireName(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new ProductValidationError(`${label} is required`)
  return trimmed
}

export function parseMoneyPaisa(value: string, label: string): string {
  if (!/^\d+$/.test(value)) {
    throw new ProductValidationError(`${label} must be a non-negative integer paisa amount`)
  }
  return BigInt(value).toString()
}

export function parseQuantity(value: string, label: string): string {
  let decimal: Decimal
  try {
    decimal = new Decimal(value)
  } catch {
    throw new ProductValidationError(`${label} must be a valid quantity`)
  }
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new ProductValidationError(`${label} must be non-negative`)
  }
  return decimal.toFixed()
}

export function parsePositiveConversion(value: string, label: string): string {
  const parsed = new Decimal(value)
  if (!parsed.isFinite() || parsed.lte(0)) {
    throw new ProductValidationError(`${label} must be greater than zero`)
  }
  return parsed.toFixed()
}
```

Create `ProductValidationError`, `ProductNotFoundError`, and `ProductConflictError` classes in `product.errors.ts`.

- [ ] **Step 6: Implement repository master methods**

`ProductMasterRepository` receives `DatabaseClient` in its constructor and every query includes `tenant_id`.

Implement:

```ts
listCategories(tenantId: string, includeInactive = false)
findCategoryById(tenantId: string, categoryId: string)
createCategory(tenantId: string, name: string)
setCategoryActive(tenantId: string, categoryId: string, active: boolean)

listUnits(tenantId: string, includeInactive = false)
findUnitById(tenantId: string, unitId: string)
createUnit(tenantId: string, input: CreateUnitInput)
setUnitActive(tenantId: string, unitId: string, active: boolean)
```

Map PostgreSQL unique violations (`23505`) into `ProductConflictError` in the service boundary.

- [ ] **Step 7: Implement tenant-bound master service**

`ProductMasterService` constructor requires `tenantId` and a repository. Service methods trim names/symbols, verify IDs belong to the trusted tenant, and archive via `is_active = FALSE` rather than delete.

- [ ] **Step 8: Run master tests and verify GREEN**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-masters.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/modules/products apps/api/test/products/product-masters.test.ts apps/api/test/products/product-test-helpers.ts
git commit -m "feat: add product category and unit masters"
```

---

### Task 4: Implement Product Create/List/Edit with Atomic Opening Stock

**Files:**
- Modify: `apps/api/src/modules/products/product.types.ts`
- Modify: `apps/api/src/modules/products/product-master.repository.ts`
- Create: `apps/api/src/modules/products/inventory.repository.ts`
- Create: `apps/api/src/modules/products/inventory.service.ts`
- Modify: `apps/api/src/modules/products/product-master.service.ts`
- Create: `apps/api/test/products/product-service.test.ts`

**Interfaces:**
- Produces:
  - `ProductListItem`
  - `ProductDetail`
  - `ProductMasterService.createProduct(input, actorUserId)`
  - `listProducts(filters)`
  - `getProduct(productId)`
  - `updateProduct(productId, input)`
  - `setProductActive(productId, active)`
  - `InventoryService.createOpeningInventory(...)`.

- [ ] **Step 1: Extend Product output contracts**

Add exact response types:

```ts
export interface ProductListItem {
  id: string
  name: string
  brand: string
  category: CategoryRecord | null
  baseUnit: UnitRecord
  defaultVariantId: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  stockBaseQty: string
  minimumStockBaseQty: string
  trackingMode: TrackingMode
  variantsEnabled: boolean
  isActive: boolean
}

export interface ProductListResult {
  items: ProductListItem[]
  total: number
  limit: number
  offset: number
}

export interface ProductDetail extends ProductListItem {
  primaryBarcode: string | null
}
```

- [ ] **Step 2: Write RED Product service tests**

Cover these exact behaviors:

- simple create creates Product + one default Variant + one base `product_units` row;
- opening stock `2.5` creates one OPENING lot, movement, and allocation;
- opening stock greater than zero with zero purchase cost rejects before any Product row persists;
- invalid category/unit from another tenant rejects;
- duplicate active product name rejects case-insensitively;
- same Product name in another tenant succeeds;
- archived Product name can be recreated;
- list search/category/brand/status pagination returns only the trusted tenant;
- Product Edit does not accept or mutate stock;
- base-unit change succeeds before inventory history;
- base-unit change rejects after opening/adjustment history exists;
- failure injected after Product insert rolls back Product, Variant, Unit mapping, lot, and movement.

For rollback injection, construct `ProductMasterService` with an `InventoryService` test double whose opening method throws `new Error('force opening failure')`, while the Product service transaction still owns all earlier writes.

- [ ] **Step 3: Run Product tests and verify RED**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-service.test.ts
```

Expected: FAIL because Product lifecycle methods do not exist.

- [ ] **Step 4: Implement Product repository methods**

Repository methods must be explicit and tenant-scoped:

```ts
insertProduct(client, tenantId, fields)
insertDefaultVariant(client, tenantId, productId, fields)
upsertBaseProductUnit(client, tenantId, productId, unitId)
insertPrimaryBarcode(client, tenantId, variantId, unitId, barcode)
findProductDetail(tenantId, productId)
listProducts(tenantId, filters)
countProducts(tenantId, filters)
updateProductIdentity(client, tenantId, productId, fields)
setProductActive(tenantId, productId, active)
hasInventoryHistory(client, tenantId, variantId)
```

The Product list query calculates `stockBaseQty` from:

```sql
COALESCE(SUM(inventory_movements.base_qty_delta), 0)::text
```

grouped by default variant.

Do not add `current_stock` to `products`.

- [ ] **Step 5: Implement opening inventory repository primitives**

`InventoryRepository` must expose:

```ts
createLot(client, input): Promise<{ id: string }>
createMovement(client, input): Promise<{ id: string }>
createMovementLotAllocation(client, input): Promise<void>
getVariantBalance(client, tenantId, variantId): Promise<string>
```

All quantity values stay strings at repository boundaries.

- [ ] **Step 6: Implement atomic Product creation**

`ProductMasterService.createProduct()`:

1. validates name/prices/quantity/minimum stock/tracking mode;
2. verifies active same-tenant category and base Unit;
3. requires positive purchase cost when opening stock > 0;
4. calls `withDatabaseTransaction(repository.database, ...)`;
5. inserts Product;
6. inserts default Variant;
7. inserts base `product_units` mapping with `FIXED / 1`;
8. inserts primary barcode if present;
9. delegates opening stock to an `InventoryService` built on the same transaction client;
10. returns fully loaded Product detail after commit.

Opening inventory uses the current business date and:

```ts
{
  sourceType: 'OPENING',
  movementType: 'OPENING',
  baseQtyDelta: openingStockBaseQty,
  balanceAfterBaseQty: openingStockBaseQty,
  referenceType: 'PRODUCT_OPENING'
}
```

- [ ] **Step 7: Implement Product Edit and base-unit safety**

If `baseUnitId` changes, lock/read the default variant and reject when `hasInventoryHistory()` is true. When allowed, update `products.base_unit_id` and replace the active base `product_units` mapping with `FIXED / 1`.

Barcode update archives the old primary barcode and creates/activates the new one in the same transaction.

- [ ] **Step 8: Run Product tests and verify GREEN**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-service.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/products apps/api/test/products/product-service.test.ts
git commit -m "feat: add product master lifecycle"
```

---

### Task 5: Implement Exact FIFO Stock Adjustments and Concurrency Safety

**Files:**
- Modify: `apps/api/src/modules/products/inventory.repository.ts`
- Modify: `apps/api/src/modules/products/inventory.service.ts`
- Create: `apps/api/test/products/inventory-service.test.ts`

**Interfaces:**
- Produces:
  - `AdjustStockInput { deltaBaseQty, note, unitCostPaisa?, businessDate? }`
  - `InventoryService.adjustStock(tenantId, actorUserId, variantId, input)`
  - `InventoryService.listLots(tenantId, variantId)`.

- [ ] **Step 1: Add RED FIFO tests**

Tests must prove:

- positive `+0.125` adjustment creates a new ADJUSTMENT lot and exact movement;
- positive adjustment uses explicit `unitCostPaisa` when supplied;
- positive adjustment falls back to Variant default purchase price when cost omitted;
- positive adjustment rejects when both explicit/default cost are zero;
- negative `-2.5` adjustment consumes oldest positive lots by `received_on, id`;
- one negative movement can allocate across multiple lots;
- remaining lot quantities and movement-derived balance reconcile exactly;
- removing more than non-negative current stock rejects without writes;
- adjustment note is stored;
- FIFO chooses older business date even if that lot was inserted later.

- [ ] **Step 2: Add the concurrency RED test**

Open two dedicated pool clients. Seed one Variant with 5 units, then issue two concurrent negative adjustments of 4 units each.

Expected invariant:

- exactly one succeeds;
- one rejects for insufficient stock;
- final movement-derived balance is 1;
- no lot has negative `remaining_base_qty`.

Use `Promise.allSettled` and assert one fulfilled/one rejected.

- [ ] **Step 3: Run inventory tests and verify RED**

```bash
pnpm --filter @sherhisab/api test -- test/products/inventory-service.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement lock-first inventory planning**

For every adjustment transaction:

```sql
SELECT id
FROM product_variants
WHERE tenant_id = $1 AND id = $2 AND is_active
FOR UPDATE;
```

This row lock serializes stock mutation for one Variant.

Then query current balance from `inventory_movements`.

For negative adjustments, load positive FIFO lots:

```sql
SELECT id,
       received_on,
       remaining_base_qty::text,
       unit_cost_paisa::text
FROM inventory_lots
WHERE tenant_id = $1
  AND variant_id = $2
  AND remaining_base_qty > 0
  AND status = 'ACTIVE'
ORDER BY received_on ASC, id ASC
FOR UPDATE;
```

Build the consumption plan in memory using `Decimal`; perform no lot writes until the full quantity is proven satisfiable.

- [ ] **Step 5: Apply FIFO plan atomically**

For each planned lot:

- decrement exact `remaining_base_qty`;
- set `status='DEPLETED'` when remaining reaches zero;
- create one `inventory_movement_lot_allocations` row with exact consumed quantity and lot cost.

Create one `ADJUSTMENT_OUT` movement whose `base_qty_delta` is negative and `balance_after_base_qty` is exact.

Positive adjustment creates a fresh lot, `ADJUSTMENT_IN` movement, and one allocation.

- [ ] **Step 6: Run inventory tests and verify GREEN**

```bash
pnpm --filter @sherhisab/api test -- test/products/inventory-service.test.ts
```

Expected: PASS, including concurrency test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/products/inventory.repository.ts apps/api/src/modules/products/inventory.service.ts apps/api/test/products/inventory-service.test.ts
git commit -m "feat: add fifo stock adjustments"
```

---

### Task 6: Implement Advanced Units, Specifications, and Optional Variants

**Files:**
- Modify: `apps/api/src/modules/products/product.types.ts`
- Modify: `apps/api/src/modules/products/product-master.repository.ts`
- Modify: `apps/api/src/modules/products/product-master.service.ts`
- Create: `apps/api/test/products/product-advanced.test.ts`

**Interfaces:**
- Produces:
  - `replaceAlternativeUnits(productId, input)`
  - `replaceSpecifications(productId, input)`
  - `replaceVariantConfiguration(productId, input)`
  - advanced Product detail payload.

- [ ] **Step 1: Define advanced input contracts**

Append:

```ts
export interface AlternativeUnitInput {
  unitId: string
  conversionMode: ConversionMode
  conversionToBase?: string | null
}

export interface SpecificationInput {
  name: string
  value: string
}

export interface VariantOptionInput {
  name: string
  values: string[]
}

export interface VariantInput {
  id?: string
  displayName: string
  sku?: string | null
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  selections: Record<string, string>
}

export interface ReplaceVariantConfigurationInput {
  enabled: boolean
  options: VariantOptionInput[]
  variants: VariantInput[]
}
```

The default Variant is not included in `variants`; it always remains present internally.

- [ ] **Step 2: Write RED advanced tests**

Cover:

- fixed alternative unit `box = 20 pcs`;
- variable alternative unit `roll` stores no fixed conversion;
- fixed conversion zero/negative rejects;
- variable conversion with a value rejects;
- alternative Unit from another tenant rejects;
- descriptive specs persist and do not create variants;
- enabling Color/Size creates additional Variants and option mappings;
- duplicate option names/values reject case-insensitively;
- duplicate variant selection combination rejects;
- duplicate tenant SKU rejects;
- disabling variants with no-history non-default variants archives them and leaves default Variant;
- disabling variants with stock/history rejects;
- existing Variant with history cannot change its option combination;
- cross-tenant IDs in an advanced request reject.

- [ ] **Step 3: Run advanced tests and verify RED**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-advanced.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement alternative-unit replacement**

Inside one transaction:

1. lock the Product row;
2. verify each Unit is active and same tenant;
3. reject duplicates including the Product base Unit;
4. upsert supplied mappings;
5. mark omitted non-base mappings inactive;
6. always ensure an active base-unit mapping with `FIXED / 1`.

- [ ] **Step 5: Implement specification replacement**

Trim names/values; reject empty entries; delete and reinsert Product specifications in the transaction because specifications have no transaction-history foreign keys.

- [ ] **Step 6: Implement variant configuration with history protection**

When `enabled=true`:

1. validate option/value names and unique combinations;
2. create/update option definitions and values;
3. create new non-default Variants;
4. update existing Variants only when their existing option combination is unchanged if inventory history exists;
5. archive omitted Variants only when they have no inventory history;
6. preserve the hidden default Variant;
7. set `products.variants_enabled=TRUE`.

When `enabled=false`:

- reject if any active non-default Variant has inventory history;
- otherwise archive non-default Variants, clear Product option mappings, and set `variants_enabled=FALSE`.

- [ ] **Step 7: Run advanced tests and verify GREEN**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-advanced.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/products apps/api/test/products/product-advanced.test.ts
git commit -m "feat: add advanced product configuration"
```

---

### Task 7: Expose Tenant-Safe Product HTTP Routes

**Files:**
- Create: `apps/api/src/modules/products/product.routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/products/product-routes.test.ts`

**Interfaces:**
- Consumes: ProductMasterService + InventoryService.
- Produces authenticated endpoints under `/api/private`:
  - `GET /products`
  - `POST /products`
  - `GET /products/:id`
  - `PATCH /products/:id`
  - `POST /products/:id/status`
  - `POST /products/:id/stock-adjustments`
  - `GET /products/:id/lots`
  - `PUT /products/:id/units`
  - `PUT /products/:id/specifications`
  - `PUT /products/:id/variants`
  - `GET/POST/PATCH /product-categories`
  - `GET/POST/PATCH /units`.

- [ ] **Step 1: Write route RED tests**

Use the real login/session flow from existing auth tests.

Required route assertions:

- unauthenticated Product route returns 401;
- Tenant A only receives Tenant A Products;
- POST body containing Tenant B's `tenantId` is ignored and cannot create in Tenant B;
- cross-tenant category/unit/variant IDs return 400 or 404 without leakage;
- duplicate Product/barcode/SKU returns 409;
- invalid quantity/money/conversion returns 400;
- missing Product returns 404;
- successful Product create returns 201;
- successful update/status/adjustment returns 200;
- `GET /products` honors `search`, `categoryId`, `brand`, `status`, `limit`, and `offset`.

- [ ] **Step 2: Run route tests and verify RED**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-routes.test.ts
```

Expected: FAIL because routes are not mounted.

- [ ] **Step 3: Implement route error mapping**

Map only known Product errors:

```ts
ProductValidationError -> 400
ProductNotFoundError -> 404
ProductConflictError -> 409
```

Unknown errors are rethrown so Hono/runtime logging still exposes server failures during development/tests.

- [ ] **Step 4: Build services from the request-scoped database**

Each route handler runs inside:

```ts
return withRequestDatabase(c.env, async (database) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  const repository = new ProductMasterRepository(database)
  const inventoryRepository = new InventoryRepository(database)
  const inventoryService = new InventoryService(database, inventoryRepository)
  const service = new ProductMasterService(
    tenantId,
    database,
    repository,
    inventoryService,
  )
  // invoke operation
})
```

Do not construct a global repository/database singleton.

- [ ] **Step 5: Mount routes**

In `app.ts`, keep `authContextMiddleware` on `privateRoutes`, then mount the Product routes beneath it.

- [ ] **Step 6: Run route tests and verify GREEN**

```bash
pnpm --filter @sherhisab/api test -- test/products/product-routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run all Product API tests**

```bash
pnpm --filter @sherhisab/api test -- test/products
```

Expected: all Product schema/master/service/inventory/advanced/route tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/modules/products/product.routes.ts apps/api/test/products/product-routes.test.ts
git commit -m "feat: expose product master api"
```

---

### Task 8: Add SherHisab UI Primitives, Exact Money Helpers, and Language Mode

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/dialog.tsx`
- Create: `apps/web/src/components/ui/dropdown-menu.tsx`
- Create: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/ui/bilingual-label.tsx`
- Create: `apps/web/src/components/ui/bilingual-label.test.tsx`
- Create: `apps/web/src/app/language.tsx`
- Create: `apps/web/src/lib/money.ts`
- Create: `apps/web/src/lib/money.test.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/components/topbar.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces:
  - shadcn-style shared primitives;
  - `LanguageMode = 'en-bn' | 'en' | 'bn'`;
  - `useLanguageMode()`;
  - `BilingualLabel`;
  - `parseTakaToPaisa(input): string`;
  - `formatPaisaToTaka(paisa): string`;
  - `apiRequest<T>()`.

- [ ] **Step 1: Add Radix/shadcn runtime primitives**

```bash
pnpm --filter @sherhisab/web add @radix-ui/react-dialog @radix-ui/react-dropdown-menu lucide-react
```

This adds accessible Dialog/Dropdown primitives and icons without adding a second CSS framework.

- [ ] **Step 2: Write RED money tests**

`money.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatPaisaToTaka, parseTakaToPaisa } from './money'

describe('money helpers', () => {
  it('parses taka exactly into paisa', () => {
    expect(parseTakaToPaisa('12')).toBe('1200')
    expect(parseTakaToPaisa('12.5')).toBe('1250')
    expect(parseTakaToPaisa('12.50')).toBe('1250')
    expect(parseTakaToPaisa('0.01')).toBe('1')
  })

  it('rejects invalid or over-precise money', () => {
    expect(() => parseTakaToPaisa('-1')).toThrow()
    expect(() => parseTakaToPaisa('12.345')).toThrow()
    expect(() => parseTakaToPaisa('abc')).toThrow()
  })

  it('formats paisa without floating point', () => {
    expect(formatPaisaToTaka('1250')).toBe('12.50')
    expect(formatPaisaToTaka('1')).toBe('0.01')
  })
})
```

- [ ] **Step 3: Write RED language-label tests**

Assert:

- default `en-bn` renders English and Bangla helper;
- `en` renders English only;
- `bn` renders Bangla only;
- user-entered data is not passed through translation helpers.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
pnpm --filter @sherhisab/web test -- src/lib/money.test.ts src/components/ui/bilingual-label.test.tsx
```

Expected: FAIL.

- [ ] **Step 5: Implement exact money helpers with `BigInt`**

Parse trimmed strings with `/^\d+(?:\.\d{1,2})?$/`, split whole/fraction, right-pad fraction to two digits, and return `BigInt(whole) * 100n + BigInt(fraction)` as a string.

Formatting divides a non-negative BigInt paisa string into whole/fraction strings; never convert to `number`.

- [ ] **Step 6: Implement language provider**

`LanguageProvider`:

- default `en-bn`;
- reads/writes `localStorage['sherhisab-language-mode']`;
- exposes `mode` and `setMode`;
- wraps the existing app in `main.tsx`.

Add one compact language `select` in `Topbar` with options:

- English + বাংলা
- English
- বাংলা

- [ ] **Step 7: Implement shared UI primitives**

Use Radix Dialog and Dropdown Menu wrappers with SherHisab class names. Button/Input/Badge are small typed React wrappers.

Do not add Tailwind just for these components.

- [ ] **Step 8: Implement `apiRequest<T>`**

```ts
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      body && typeof body.error === 'string'
        ? body.error
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return body as T
}
```

- [ ] **Step 9: Add compact shared CSS tokens/classes**

Refactor only enough existing CSS to introduce reusable variables for background/surface/border/text/muted/blue/status colors and styles for Dialog/Dropdown/Button/Input/Badge/BilingualLabel.

Preserve current shell behavior.

- [ ] **Step 10: Run focused tests and verify GREEN**

```bash
pnpm --filter @sherhisab/web test -- src/lib/money.test.ts src/components/ui/bilingual-label.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Run existing shared UI/shell regressions**

```bash
pnpm --filter @sherhisab/web test -- src/components src/app/router.test.tsx
```

Expected: existing AppShell/DataTable/SearchCombobox/router tests still PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/app apps/web/src/components apps/web/src/lib apps/web/src/main.tsx apps/web/src/styles.css
git commit -m "feat: add sherhisab product ui primitives"
```

---

### Task 9: Build the Compact Products List and Navigation

**Files:**
- Create: `apps/web/src/features/products/product-types.ts`
- Create: `apps/web/src/features/products/product-api.ts`
- Create: `apps/web/src/features/products/product-columns.tsx`
- Create: `apps/web/src/features/products/product-page.tsx`
- Create: `apps/web/src/features/products/product-page.test.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces `/app/products`, Product queries, filters, compact table, and access from the sidebar.

- [ ] **Step 1: Mirror API DTO types on the web**

Use string fields for money and quantity:

```ts
export interface ProductListItemDto {
  id: string
  name: string
  brand: string
  category: { id: string; name: string; isActive: boolean } | null
  baseUnit: { id: string; name: string; symbol: string | null; isActive: boolean }
  defaultVariantId: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  stockBaseQty: string
  minimumStockBaseQty: string
  trackingMode: 'SIMPLE' | 'LOT' | 'BATCH'
  variantsEnabled: boolean
  isActive: boolean
}
```

- [ ] **Step 2: Write Product page RED tests**

Mock `fetch` and assert:

- page heading shows `Products` and Bangla helper in default mode;
- compact table has Product, Category, Brand, Unit, Purchase Price, Selling Price, Stock, Min Stock, Status, Actions;
- search/filter controls send expected query parameters;
- money renders from paisa without floating point;
- stock quantity preserves useful decimals and removes trailing zeros via existing `formatNumber`;
- inactive status displays compact badge;
- empty result shows `No products yet`;
- failed request shows retry/error state.

- [ ] **Step 3: Run Product page test and verify RED**

```bash
pnpm --filter @sherhisab/web test -- src/features/products/product-page.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement TanStack Query API functions**

`product-api.ts` exports:

```ts
listProducts(filters)
getProduct(id)
listCategories()
listUnits()
createProduct(input)
updateProduct(id, input)
setProductStatus(id, isActive)
adjustStock(id, input)
listProductLots(id)
replaceProductUnits(id, input)
replaceSpecifications(id, input)
replaceVariants(id, input)
```

Use `apiRequest`.

- [ ] **Step 5: Implement Product columns**

Right-align money/quantity columns with CSS class hooks. Use `formatPaisaToTaka` for money and `formatNumber` for NUMERIC quantity strings.

Actions column uses the shared Dropdown Menu.

- [ ] **Step 6: Build the Product page layout**

Structure:

```text
Products
পণ্য ও স্টক

[Search] [Category] [Brand] [Status] [More filters]        [+ Add Product]

Product | Category | Brand | Unit | Purchase | Selling | Stock | Min Stock | Status | Actions
```

Use full available width, hairline table border, compact rows, no large KPI card wall.

- [ ] **Step 7: Add route and sidebar navigation**

Add `/app/products` to TanStack Router.

Replace Product/Inventory access with a real TanStack `Link` in Sidebar so keyboard/navigation semantics work. Do not leave navigation as a no-op button.

- [ ] **Step 8: Run Product page test and verify GREEN**

```bash
pnpm --filter @sherhisab/web test -- src/features/products/product-page.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Run router/shell regressions**

```bash
pnpm --filter @sherhisab/web test -- src/app/router.test.tsx src/components/app-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/products apps/web/src/app/router.tsx apps/web/src/components/sidebar.tsx apps/web/src/styles.css
git commit -m "feat: add compact products page"
```

---

### Task 10: Build Add/Edit Product and Advanced Configuration UI

**Files:**
- Create: `apps/web/src/features/products/product-form-dialog.tsx`
- Create: `apps/web/src/features/products/product-advanced-fields.tsx`
- Create: `apps/web/src/features/products/product-form-dialog.test.tsx`
- Modify: `apps/web/src/features/products/product-page.tsx`
- Modify: `apps/web/src/features/products/product-api.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces compact Add/Edit Product flow and optional advanced controls.

- [ ] **Step 1: Write Product form RED tests**

Assert default Add form fields exactly:

- Product Name / পণ্যের নাম
- Brand / ব্র্যান্ড
- Category / ধরন
- Unit / একক
- Barcode / বারকোড
- Purchase Price / কেনা দাম
- Selling Price / বিক্রির দাম
- Opening Stock / শুরুর স্টক
- Minimum Stock / ন্যূনতম স্টক

Also assert:

- Opening Stock appears on Create only;
- Edit shows Current Stock read-only;
- Advanced section is collapsed by default;
- Category and Unit use searchable selectors;
- quick-create Category/Unit creates the master then selects it;
- purchase/selling price are converted to paisa by exact helper;
- create validation displays server error without closing dialog;
- successful create invalidates Product query and closes dialog;
- Full English hides Bangla helper;
- Full Bangla hides English label.

- [ ] **Step 2: Run form tests and verify RED**

```bash
pnpm --filter @sherhisab/web test -- src/features/products/product-form-dialog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement default Create/Edit form**

Use two-column desktop grid and one-column mobile grid.

Create payload uses string values:

```ts
{
  name,
  brand,
  categoryId,
  baseUnitId,
  barcode,
  defaultPurchasePricePaisa: parseTakaToPaisa(purchasePrice),
  defaultSellingPricePaisa: parseTakaToPaisa(sellingPrice),
  openingStockBaseQty,
  minimumStockBaseQty,
  trackingMode,
}
```

Edit payload omits opening stock entirely.

- [ ] **Step 4: Implement quick-create masters**

Inside Category/Unit selectors, expose a compact `+ Add category` / `+ Add unit` action.

Each opens a focused nested Dialog, calls the master endpoint, refreshes the options, selects the created ID, then returns focus to the parent field.

- [ ] **Step 5: Implement progressive Advanced section**

Collapsed `<details>` or equivalent compact control with:

- Tracking: Simple / Lot / Batch;
- Alternative Units editor:
  - Unit
  - Fixed/Variable
  - fixed conversion value only when Fixed;
- Specifications key/value rows;
- Enable Variants toggle;
- when enabled: Option definitions/values and generated/manual Variant rows for display name, SKU, purchase price, selling price, minimum stock.

Do not show lot/batch transaction-entry fields here; this is policy/configuration only.

Save advanced configuration through the dedicated API endpoints after the core Product create/update succeeds. For an existing Product, each advanced endpoint is atomic independently and errors remain visible in the dialog.

- [ ] **Step 6: Implement variant-history-safe UI behavior**

When API returns an existing Variant as locked by history, disable changing its option combination/removal while still allowing price/min-stock edits. Show a concise helper message rather than hiding the Variant.

- [ ] **Step 7: Run form tests and verify GREEN**

```bash
pnpm --filter @sherhisab/web test -- src/features/products/product-form-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run Product page + form tests**

```bash
pnpm --filter @sherhisab/web test -- src/features/products
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/products apps/web/src/styles.css
git commit -m "feat: add product create and edit flow"
```

---

### Task 11: Build Adjust Stock and Lot Inspection UI

**Files:**
- Create: `apps/web/src/features/products/stock-adjust-dialog.tsx`
- Create: `apps/web/src/features/products/stock-adjust-dialog.test.tsx`
- Modify: `apps/web/src/features/products/product-page.tsx`
- Modify: `apps/web/src/features/products/product-api.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces explicit stock correction UX and lot evidence viewer.

- [ ] **Step 1: Write Adjust Stock RED tests**

Assert:

- Edit Product does not offer editable current stock;
- row action `Adjust Stock` opens dedicated dialog;
- dialog shows current stock and Unit;
- quantity requires non-zero signed value;
- positive adjustment exposes optional Cost field and reason;
- negative adjustment hides Cost field and requires reason;
- successful adjustment refreshes Product list;
- insufficient stock error stays in dialog;
- `View lots` shows FIFO order, received date, remaining quantity, purchase cost, and status;
- ordinary Product table does not show lot details until requested.

- [ ] **Step 2: Run stock UI test and verify RED**

```bash
pnpm --filter @sherhisab/web test -- src/features/products/stock-adjust-dialog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement Adjust Stock dialog**

Payload:

```ts
{
  deltaBaseQty: signedQuantity,
  note: reason.trim(),
  unitCostPaisa:
    isPositive && cost.trim()
      ? parseTakaToPaisa(cost)
      : undefined,
}
```

Use clear copy:

- `Add stock` for positive;
- `Remove stock` for negative;
- no ambiguous direct “Current Stock” editor.

- [ ] **Step 4: Implement lot viewer**

Use a compact Dialog/Table. Sort from API order; do not re-sort by browser timestamps. Show technical lot ID in monospace only where useful.

- [ ] **Step 5: Run stock UI tests and verify GREEN**

```bash
pnpm --filter @sherhisab/web test -- src/features/products/stock-adjust-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run all Product web tests**

```bash
pnpm --filter @sherhisab/web test -- src/features/products src/components/ui/bilingual-label.test.tsx src/lib/money.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/products apps/web/src/styles.css
git commit -m "feat: add product stock adjustment ui"
```

---

### Task 12: Full Regression, Production Verification, and Final Review

**Files:**
- Modify only files required to fix failures found by this verification.
- Do not add unrelated refactors.

**Interfaces:**
- Produces verified Product Master branch ready for human review.

- [ ] **Step 1: Apply all migrations to a fresh/local CI database**

For an empty `sherhisab_ci`, run:

```bash
export DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab_ci
for migration in db/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

This verifies migration ordering from `001` through `004`.

- [ ] **Step 2: Run all API tests**

```bash
export DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab_ci
pnpm --filter @sherhisab/api test
```

Expected: all API tests PASS.

- [ ] **Step 3: Run all web tests**

```bash
pnpm --filter @sherhisab/web test
```

Expected: all Web tests PASS.

- [ ] **Step 4: Run the full repository suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Lint**

```bash
pnpm lint
```

Expected: 0 errors. Existing known TanStack warnings may remain only if they are unchanged from baseline.

- [ ] **Step 7: Production build**

```bash
pnpm build
```

Expected: PASS for API and Web.

- [ ] **Step 8: Whitespace validation**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 9: Inspect changed files**

```bash
git status --short
```

Expected: only Product Master plan implementation files or deliberate dependency/config files are changed; no `legacy/` modifications.

- [ ] **Step 10: Run targeted manual smoke checks**

With local PostgreSQL/API/Web running:

1. create Product with `2.5` opening stock;
2. confirm table shows `2.5`, not `2.50000000`;
3. add `0.125` stock and confirm `2.625`;
4. remove `1.5` and inspect exact FIFO lot allocation;
5. archive/recreate a Category name;
6. create Fabric Product with variable Roll unit;
7. enable Color/Size variants and confirm simple Product rows remain uncluttered;
8. switch UI language between English + Bangla, English, and Bangla;
9. verify narrow viewport keeps Product form/table usable.

- [ ] **Step 11: Request final code review**

Use the Superpowers code-review workflow on the complete branch. Review specifically for:

- tenant escape paths;
- transaction/rollback gaps;
- floating-point money/quantity regressions;
- FIFO correctness/concurrency;
- Product UI complexity regressions;
- Cloudflare request-scoped DB compatibility.

- [ ] **Step 12: Fix review findings using RED tests first**

For every accepted behavioral finding, add a failing regression test before the fix, run the focused test to prove RED, implement the minimal fix, and rerun focused + full verification.

- [ ] **Step 13: Final commit if verification/review required changes**

```bash
git add -A
git commit -m "fix: harden product master implementation"
```

Skip this commit when there are no final changes.

- [ ] **Step 14: Report exact verification evidence and changed files**

Do not merge or push to a shared branch automatically. Report:

- Product API test count/pass;
- Web test count/pass;
- full test status;
- typecheck;
- lint;
- build;
- `git diff --check`;
- `git status --short`;
- changed-file list;
- final branch commit SHA.

---

## Execution Notes

Implementation must start from an isolated worktree created with the Superpowers `using-git-worktrees` skill from the approved plan/spec branch.

At execution time, read both:

- `docs/superpowers/specs/2026-09-23-product-master-design.md`
- `docs/superpowers/plans/2026-09-23-product-master-implementation-plan.md`

Do not restore the old Apps Script limitation of plain-text Category/Unit references or mutable Product current-stock truth.

Do not introduce Purchase/Sales/Returns/accounting transaction modules in this plan. Their future implementation consumes the Product/Variant/Unit/Lot/Movement contracts created here.
