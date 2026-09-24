# Lot Selling Price + FIFO POS Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lot selling prices authoritative, add permission-controlled price editing, create correct positive-adjustment stock lots, and establish FIFO POS pricing/manual override behavior without corrupting historical cost or invoice data.

**Architecture:** Extend the existing auth/session foundation with tenant-scoped roles and explicit grants, then extend the existing inventory lot API/UI to expose and edit selling prices with audit history. Build the sales pricing engine as a separate module that allocates FIFO lots and calculates automatic selling-price segments; the future POS UI consumes this engine and may submit a permission-controlled manual line price without changing lot data.

**Tech Stack:** PostgreSQL migrations, Hono/TypeScript API, React/TypeScript/Vite, TanStack Query, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-lot-selling-price-pos-override-design.md`

## Global Constraints

- FIFO remains the inventory costing/allocation method.
- Product/Variant default prices are defaults/opening values; they never rewrite existing lot prices.
- Positive stock adjustments create a new lot and require Purchase Price + Selling Price.
- Negative stock adjustments accept no price fields and consume FIFO.
- Purchase cost is historical/read-only from normal View Lots.
- Authorized manual cart price changes affect only the invoice, never the lot.
- API permission enforcement is required even when UI controls are hidden/disabled.
- Owner/Admin automatically have selling-price override permissions.
- Full tenant isolation via authenticated `tenantId`; never trust tenant identity from request bodies.
- Follow `.agents/skills/DESIGN.md`, relevant `.agents/skills/**/SKILL.md`, and `SHERHISAB_UI_CODING_INSTRUCTIONS.md`.
- TDD: every production behavior starts with a failing test.
- After implementation run full DB-backed API tests, web tests, typecheck, lint, build, and `git diff --check`.

## Review Focus

- A STAFF user without permission must get 403 from lot-price and sale-price override APIs even if the UI is bypassed.
- Concurrent sale/stock operations must not allocate more quantity than a lot actually has; allocation must occur in one database transaction.
- A cart quantity spanning lots with different selling prices must preserve exact per-lot automatic price segments.
- A manual cart override below FIFO cost must not change COGS or lot prices, and must surface loss-warning data.
- Editing an active lot selling price must affect future pricing but never mutate historical sale allocations/invoices.

---

### Task 1: Permission Foundation

**Files:**
- Create: `db/migrations/005_roles_permissions_lot_price_audit.sql`
- Create: `apps/api/src/modules/auth/permissions.ts`
- Modify: `apps/api/src/modules/auth/auth.repository.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/middleware/auth-context.ts`
- Modify: `apps/api/src/types/context.ts`
- Modify: `apps/api/src/modules/auth/auth.routes.ts`
- Test: `apps/api/test/auth/auth.test.ts`
- Test: `apps/api/test/auth/tenant-context.test.ts`

**Interfaces:**
- Produces: `UserRole = 'OWNER' | 'ADMIN' | 'STAFF'`
- Produces: `PermissionKey = 'SALES_OVERRIDE_SELLING_PRICE' | 'INVENTORY_EDIT_LOT_SELLING_PRICE'`
- Produces: `can(permission: PermissionKey, role: UserRole, grants: PermissionKey[]): boolean`
- Auth session/context exposes `role` and resolved `permissions`.

- [ ] **Step 1: Write failing migration/auth tests**

Add tests proving:
- existing/current fixture owner can receive OWNER role;
- OWNER/ADMIN resolve both privileged permissions without explicit grants;
- STAFF resolves none by default;
- STAFF can receive one explicit tenant-scoped grant;
- a grant from Tenant A cannot authorize the same user/request in Tenant B;
- `/api/auth/session` returns role + resolved permission keys.

Run:
`DATABASE_URL=postgresql://sherhisab:sherhisab@127.0.0.1:5432/sherhisab pnpm --filter @sherhisab/api exec vitest run test/auth/auth.test.ts test/auth/tenant-context.test.ts`

Expected: FAIL because roles/grants do not exist.

- [ ] **Step 2: Add schema**

Migration:
- `ALTER TABLE users ADD COLUMN role TEXT ... DEFAULT 'OWNER'` for compatibility.
- Check role in OWNER/ADMIN/STAFF; backfill existing users as OWNER, then make normal future user creation default to STAFF while tenant/bootstrap creation explicitly requests OWNER.
- Create `user_permission_grants(tenant_id,user_id,permission_key,granted_by_user_id,created_at,...)`.
- Create `inventory_lot_selling_price_audit(...)` now so lot Task 2 can use it.
- Tenant-scoped foreign keys and indexes.

- [ ] **Step 3: Implement permission resolution**

Add pure permission constants/resolver and repository queries for role/grants.

Auth context must resolve role/permissions from the authenticated session user and put them into Hono context. Do not accept permission claims from headers/request body.

- [ ] **Step 4: Make tests green and commit**

Run focused tests, then full API auth tests.

Commit:
`feat: add tenant user permissions`

---

### Task 2: Lot Selling Price API + Audit

**Files:**
- Modify: `apps/api/src/modules/products/product.types.ts`
- Modify: `apps/api/src/modules/products/inventory.repository.ts`
- Modify: `apps/api/src/modules/products/inventory.service.ts`
- Modify: `apps/api/src/modules/products/product.routes.ts`
- Test: `apps/api/test/products/inventory-service.test.ts`
- Test: `apps/api/test/products/product-routes.test.ts`

**Interfaces:**
- `InventoryLotRecord` includes `defaultSellingPricePaisa: string`.
- New service: `updateLotSellingPrice(productId, lotId, sellingPricePaisa, userId)`.
- New route: `PATCH /api/private/products/:productId/lots/:lotId/selling-price`.

- [ ] **Step 1: Write failing tests**

Test:
- lot listing returns saved selling price;
- permitted Owner can edit ACTIVE lot selling price;
- STAFF without permission gets 403;
- STAFF with explicit `INVENTORY_EDIT_LOT_SELLING_PRICE` succeeds;
- edited lot remains same cost/quantity/source;
- audit row records old/new price + user;
- tenant cannot edit another tenant's lot;
- DEPLETED lot returns 409 (no future price effect).

Expected: FAIL because DTO/update route do not exist.

- [ ] **Step 2: Implement repository/service/route**

Validate non-negative integer paisa string.

Update only `default_sell_price_paisa`, `updated_at`.

In one DB transaction:
1. lock tenant lot row,
2. reject missing/depleted/wrong Product lot,
3. update price,
4. insert audit row.

- [ ] **Step 3: Verify + commit**

Run focused inventory/product route tests.

Commit:
`feat: edit audited lot selling prices`

---

### Task 3: Positive Stock Adjustment Requires Lot Prices

**Files:**
- Modify: `apps/api/src/modules/products/product.types.ts`
- Modify: `apps/api/src/modules/products/inventory.service.ts`
- Modify: `apps/api/src/modules/products/product.routes.ts`
- Modify: `apps/web/src/features/products/product-types.ts`
- Modify: `apps/web/src/features/products/product-api.ts`
- Modify: `apps/web/src/features/products/stock-adjust-dialog.tsx`
- Test: `apps/api/test/products/inventory-service.test.ts`
- Test: `apps/api/test/products/product-routes.test.ts`
- Test: `apps/web/src/features/products/stock-adjust-dialog.test.tsx`

**Interfaces:**
- Positive adjustment body requires `unitCostPaisa` + `sellingPricePaisa`.
- Negative adjustment body ignores/rejects price inputs.
- New adjustment lot persists both prices.

- [ ] **Step 1: Write failing API tests**

Test positive quantity with missing cost => 400.
Test positive quantity with missing selling price => 400.
Test positive adjustment creates lot with exact cost + selling price.
Test negative adjustment remains FIFO and does not create a lot.

- [ ] **Step 2: Write failing web tests**

When Quantity > 0:
- Purchase Price input appears.
- Selling Price input appears.
- both required;
- existing Product default prices may prefill only as convenience;
- request body includes both prices.

When Quantity < 0:
- no Purchase Price/Selling Price fields.

- [ ] **Step 3: Implement API + UI**

Keep all writes tenant-scoped and transactional.

Use bilingual labels:
- `Purchase Price — কেনা দাম`
- `Selling Price — বিক্রির দাম`
- helper explaining that this creates a new stock lot.

- [ ] **Step 4: Verify + commit**

Commit:
`feat: price manual stock-in lots`

---

### Task 4: View Lots Selling Price + Edit UI

**Files:**
- Modify: `apps/web/src/features/products/product-types.ts`
- Modify: `apps/web/src/features/products/product-api.ts`
- Modify: `apps/web/src/features/products/stock-adjust-dialog.tsx`
- Modify: `apps/web/src/features/products/stock-adjust-dialog.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Lot DTO exposes `defaultSellingPricePaisa`.
- UI consumes session permission state to decide whether Edit Selling Price is enabled.

- [ ] **Step 1: Write failing UI tests**

Test columns:
Lot ID, Source, Supplier, Date, Purchase Price, Selling Price, Original Qty, Remaining Qty, Value, Status.

Test:
- purchase price is not editable;
- unauthorized user sees selling price but no edit action;
- authorized user can open compact Edit Selling Price dialog;
- confirmation copy says future sales only / previous invoices unchanged;
- successful save invalidates Product + lot queries.

- [ ] **Step 2: Implement UI**

Use existing small badges and compact dialog patterns.

Use `AlertDialog` only for the final destructive/meaningful confirmation if needed; ordinary price entry can use Dialog.

- [ ] **Step 3: Verify + commit**

Commit:
`feat: manage lot selling prices`

---

### Task 5: Product Catalog Uses Next FIFO Lot Selling Price

**Files:**
- Modify: `apps/api/src/modules/products/product-master.repository.ts`
- Modify: `apps/api/src/modules/products/product.types.ts`
- Modify: `apps/web/src/features/products/product-types.ts`
- Modify: `apps/web/src/features/products/product-columns.tsx`
- Test: `apps/api/test/products/product-routes.test.ts`
- Test: `apps/web/src/features/products/product-page.test.tsx`

**Interfaces:**
- Add `currentSellingPricePaisa` computed from first active FIFO lot with stock.
- Fallback to default selling price only if no stocked lot exists.

- [ ] **Step 1: Write failing tests**

Create two lots with different dates/selling prices. Assert Product list returns oldest remaining lot selling price. Consume the first lot; assert Product list returns second lot selling price. Editing global Product default must not change either lot result.

- [ ] **Step 2: Implement query + Product table**

Keep existing Product filters/sorts; Selling Price sort should use the displayed current FIFO price.

- [ ] **Step 3: Verify + commit**

Commit:
`feat: show current FIFO selling price`

---

### Task 6: FIFO Sales Pricing Engine

**Files:**
- Create: `apps/api/src/modules/sales/sales.types.ts`
- Create: `apps/api/src/modules/sales/sales.repository.ts`
- Create: `apps/api/src/modules/sales/sales-pricing.service.ts`
- Create: `apps/api/test/sales/sales-pricing.test.ts`
- Future migration: `db/migrations/006_sales_foundation.sql`

**Interfaces:**
- `quoteFifoLine(tenantId, variantId, baseQty)` returns:
  - per-lot allocations,
  - each allocation purchase cost + lot selling price,
  - automatic sales total,
  - effective unit selling price,
  - FIFO COGS,
  - stock sufficiency.
- Allocation quote does not mutate inventory.

- [ ] **Step 1: Write failing pricing tests**

Cases:
- one lot;
- quantity crosses two lots;
- depleted lot skipped;
- insufficient stock rejected;
- edited lot selling price used for future quote;
- COGS uses purchase costs, not selling prices.

- [ ] **Step 2: Add minimal sales schema**

Create sale/invoice and line/allocation tables only for fields required to persist exact FIFO allocations and price snapshots. Snapshot both purchase cost and automatic lot selling price so historical invoices never depend on later lot edits.

- [ ] **Step 3: Implement quote engine transaction-safe query**

Use FIFO ordering `received_on, id`; lock only during final sale commit, not a read-only quote.

- [ ] **Step 4: Verify + commit**

Commit:
`feat: add FIFO sales pricing engine`

---

### Task 7: Sale Commit + Permission-Controlled Manual Price Override

**Files:**
- Create/Modify sales repository/service/routes from Task 6
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/sales/sales-routes.test.ts`

**Interfaces:**
- Sale line accepts quantity and optional `manualUnitSellingPricePaisa`.
- Without manual price: invoice amount comes from FIFO lot selling-price segments.
- With manual price: requires `SALES_OVERRIDE_SELLING_PRICE`.
- Persist `pricing_mode = 'LOT' | 'MANUAL'`, automatic lot-price total, manual price snapshot, COGS, and allocations.

- [ ] **Step 1: Write failing route/service tests**

Test:
- automatic LOT price across two lots;
- unauthorized manual override => 403;
- permitted STAFF override succeeds;
- Owner/Admin succeeds;
- manual price below COGS returns warning metadata but may proceed when permission exists;
- manual override does not update lot selling price;
- reset is achieved client-side by removing manual override and re-quoting lot price;
- transaction rollback leaves stock unchanged on any sale failure.

- [ ] **Step 2: Implement atomic sale commit**

Within one DB transaction:
1. lock candidate FIFO lots,
2. revalidate quantity,
3. allocate,
4. calculate automatic lot total + COGS,
5. authorize manual override if supplied,
6. persist invoice/line/allocation price snapshots,
7. decrement lot quantities + create inventory movement,
8. commit.

- [ ] **Step 3: Verify + commit**

Commit:
`feat: commit permission-aware FIFO sales`

---

### Task 8: POS Cart Pricing UI

**Files:**
- Create new POS route/features because current React app has no POS module.
- Suggested:
  - `apps/web/src/features/pos/pos-page.tsx`
  - `apps/web/src/features/pos/pos-api.ts`
  - `apps/web/src/features/pos/pos-types.ts`
  - `apps/web/src/features/pos/pos-page.test.tsx`
  - route under `apps/web/src/routes/_authenticated/`.

**Interfaces:**
- Consume quote endpoint from Tasks 6/7.
- Cart line keeps:
  - automatic effective lot price,
  - lot breakdown,
  - optional manual unit price,
  - warning state.

- [ ] **Step 1: Write failing UI tests based on existing Apps Script behavior**

Test:
- add Product => automatic lot price;
- eye/details reveals e.g. `2 × ৳100 + 1 × ৳110`;
- unauthorized cashier cannot edit Price;
- authorized cashier can edit Price;
- edit shows compact Manual Price warning;
- below-cost override shows stronger loss warning;
- `Reset to Lot Price` removes manual override and restores current quote;
- quantity change re-quotes FIFO lots;
- final save sends manual price only when override is active.

- [ ] **Step 2: Implement compact POS cart UI**

Follow the existing Google Apps Script screenshot behavior while using SherHisab shadcn/Geist/bilingual conventions.

- [ ] **Step 3: Verify + commit**

Commit:
`feat: add lot-priced POS cart override`

---

### Task 9: Full Regression and Deployment Gate

**Files:** no feature code unless verification finds a defect.

- [ ] Run database migrations on a clean local test database.
- [ ] Run:
  `DATABASE_URL=postgresql://sherhisab:sherhisab@127.0.0.1:5432/sherhisab pnpm test`
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build`.
- [ ] Run `git diff --check`.
- [ ] Manually smoke-test Products > View Lots, positive/negative Stock Adjustment, permission denied/allowed cases, FIFO quote crossing two lots, manual POS override, reset, and below-cost warning.
- [ ] Do not merge/deploy until the user inspects the local Cloudflare preview and approves.
