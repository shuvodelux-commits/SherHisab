# SherHisab Mature POS v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build the approved first mature SherHisab POS release with production-safe quantity conversion, tracking, customer/payment accounting, stock sourcing, drafts/templates, invoice revision, single/batch returns, configurable cash sessions, idempotency, concurrency protection, and the compact legacy-compatible POS workflow.

**Architecture:** Extend the current modular monolith and the existing Sales foundation through additive PostgreSQL migrations and focused domain services. The browser edits transaction intent, while Hono services recalculate quantities, stock sources, prices, payments, customer/vendor accounting, returns, and permissions inside database transactions. Each implementation slice is developed GitHub-first on its own branch from the then-current main, merged only after green CI, and becomes a dependency for the next slice.

**Tech Stack:** React 19, TypeScript 6, Vite 8, shadcn/Radix primitives, TanStack Router/Query/Table, Hono 4, PostgreSQL 17, pg, decimal.js, Vitest, Cloudflare Workers/Hyperdrive, pnpm 11.

**Spec:** docs/superpowers/specs/2026-09-24-mature-pos-v1-design.md

## Global Constraints

- Behavioral source of truth: shuvodelux-commits/sherERP_Mohim at 955ed448fbe3f8d37bd89d474490b776ee2c42f2.
- Planning baseline main: 9063df5244228eb91164eec1394cb3a795f9235f; every implementation slice must branch from the latest main after all earlier approved slices have merged.
- Do not modify legacy/.
- Do not use Desktop Commander unless the user explicitly requests local work.
- Before implementation code in every slice, read AGENTS.md, instruction.md, .agents/skills/README.md, .agents/skills/DESIGN.md, every .agents/skills/**/SKILL.md, the approved spec, this plan, the required Superpowers execution/TDD skill, and SHERHISAB_UI_CODING_INSTRUCTIONS.md for UI work.
- Before implementing a workflow already present in SherERP, inspect the corresponding legacy .gs/.html and regression tests named in that task.
- TDD is mandatory: add a failing automated test, demonstrate RED, implement the minimum complete behavior, demonstrate GREEN, then run package/full verification.
- GitHub CI must apply all migrations and pass pnpm typecheck, pnpm lint, pnpm test, and pnpm build before merge.
- Tenant identity comes only from authenticated request context; request bodies never select tenant_id.
- Every business mutation that spans stock/accounting/audit rows executes in one PostgreSQL transaction.
- Use PostgreSQL NUMERIC and decimal.js for quantity/economic math; never use JavaScript floating-point values as accounting or stock authority.
- Every stock-bearing sale line references product_variant.id, including hidden default variants.
- Historical invoice/return output uses transaction snapshots and never reinterprets old rows from current Product configuration.
- JSONB is allowed for immutable conversion/revision snapshots, but stock, payments, ledgers, returns, serials, and source allocations remain relational and constrained.
- Do not create fake negative inventory lots. Negative selling is represented by inventory_shortfalls.
- Refund method is cashier-selected and is not restricted by the original payment channel.
- No implementation slice is a reduced public release; Mature POS v1 is complete only after Tasks 1-14 integrate and the final release gate is green.
- Product principle: DON'T COMPLICATE. MAKE IT EASY FOR ALL.

## Review Focus

1. **Cost-data leakage:** a Staff user without either POS_SHOW_PURCHASE_PRICE or POS_COST_VIEW must receive no configured purchase cost, lot purchase cost, or COGS fields in POS browser responses. Task 4 includes response-shape tests that recursively inspect JSON keys.
2. **Customer identity drift:** editing Name/Phone after selecting a Customer must clear stale customer_id; ambiguous normalized-phone matches on a Due/Partial sale must fail closed. Tasks 5 and 7 pin both cases.
3. **Mixed-payment over-tender:** only Cash tender can absorb Change; a non-cash overpayment with insufficient Cash tender is rejected and never becomes accidental Customer Credit. Task 5 tests the exact Cash + Bank + bKash boundaries.
4. **Shortfall provenance under later activity:** a Negative Stock sale reconciled by a later Purchase and then returned must preserve purchase-lot provenance and reconciliation audit while restoring the correct net stock/COGS. Tasks 6 and 11 test the complete sequence.
5. **Historical quantity stability:** changing a Product conversion profile after Draft/Invoice creation must not reinterpret the stored component values, base quantity, pricing quantity, invoice output, edit state, or return quantity. Tasks 1, 8, 10, and 11 each assert snapshot-driven behavior.

---

## File Structure and Domain Boundaries

### Database migrations

Create migrations only; never edit 001-006 after they have shipped.

- db/migrations/007_quantity_conversion.sql
- db/migrations/008_inventory_tracking.sql
- db/migrations/009_pos_parties_finance_settings.sql
- db/migrations/010_mature_sales_checkout.sql
- db/migrations/011_sales_stock_sources.sql
- db/migrations/012_sales_drafts.sql
- db/migrations/013_sales_templates.sql
- db/migrations/014_sales_invoice_revisions.sql
- db/migrations/015_sales_returns.sql
- db/migrations/016_batch_sales_returns.sql

### API ownership

- apps/api/src/modules/products/conversion.* — exact component-to-base/pricing quantity conversion and Product configuration.
- apps/api/src/modules/products/tracking.* — serial, warranty, batch/expiry and capture-field configuration.
- apps/api/src/modules/customers/* — Customer identity, normalization, search, live balance, history support.
- apps/api/src/modules/vendors/* — Vendor master lookup/create and vendor payable reads.
- apps/api/src/modules/finance/* — financial accounts, movements and Cash Session primitives.
- apps/api/src/modules/settings/* — POS business settings/feature gates.
- apps/api/src/modules/pos/* — browser-safe POS bootstrap, Product/Customer search and line quote/read models.
- apps/api/src/modules/sales/* — authoritative sale commit, payments, invoice numbering, drafts, templates, reads and invoice edits.
- apps/api/src/modules/returns/* — single return and atomic batch return.
- Existing apps/api/src/modules/products/inventory.* remains the physical-lot/movement foundation; extend it rather than duplicating inventory logic.

### Web ownership

Keep apps/web/src/features/pos/pos-page.tsx as the route-level composition only. Move behavior into focused files:

- apps/web/src/features/pos/components/product-catalog.tsx
- apps/web/src/features/pos/components/customer-panel.tsx
- apps/web/src/features/pos/components/cart.tsx
- apps/web/src/features/pos/components/cart-line.tsx
- apps/web/src/features/pos/components/conversion-editor.tsx
- apps/web/src/features/pos/components/serial-warranty-editor.tsx
- apps/web/src/features/pos/components/batch-editor.tsx
- apps/web/src/features/pos/components/shortage-resolution.tsx
- apps/web/src/features/pos/components/cost-reveal.tsx
- apps/web/src/features/pos/components/payment-lines.tsx
- apps/web/src/features/pos/components/checkout-summary.tsx
- apps/web/src/features/pos/components/recent-drafts.tsx
- apps/web/src/features/pos/components/template-picker.tsx
- apps/web/src/features/pos/components/invoice-result.tsx
- apps/web/src/features/pos/pos-state.ts
- apps/web/src/features/pos/pos-api.ts
- apps/web/src/features/pos/pos-types.ts

Invoice management lives under apps/web/src/features/sales/ and returns under apps/web/src/features/returns/ rather than growing PosPage into another legacy monolith.

---

### Task 1: Exact Quantity and Conversion Foundation

**Implementation branch:** feat/pos-conversion-foundation

**Legacy review before RED:** Products.gs, ProductSettings.gs, Purchase.gs, Sales.gs, DraftSales.gs, pos.html, tests/draft_sales_conversion.test.js.

**Files:**
- Create: db/migrations/007_quantity_conversion.sql
- Create: apps/api/src/modules/products/conversion.types.ts
- Create: apps/api/src/modules/products/conversion.repository.ts
- Create: apps/api/src/modules/products/conversion.service.ts
- Create: apps/api/test/products/product-conversion.test.ts
- Modify: apps/api/src/modules/products/product.types.ts
- Modify: apps/api/src/modules/products/product.validation.ts
- Modify: apps/api/src/modules/products/product-master.repository.ts
- Modify: apps/api/src/modules/products/product-master.service.ts
- Modify: apps/api/src/modules/products/product.routes.ts
- Modify: apps/web/src/features/products/product-types.ts
- Modify: apps/web/src/features/products/product-advanced-fields.tsx
- Test: apps/web/src/features/products/product-form-dialog.test.tsx

**Interfaces:**
- Produces ConversionProfileSnapshot, QuantityInput, NormalizedQuantity and ConversionService.normalize().
- Later sale/draft/template/edit/return tasks consume the snapshot verbatim.
- Base quantity and pricing quantity are decimal strings; component ratios are exact numerator/denominator integers.

- [ ] **Step 1: Add RED migration/schema tests**

Add assertions to product-conversion.test.ts that a COMPOUND profile can store Gauge factor 16/1, Gira factor 1/1, pricing base factor 16/1, ordered fields, max-exclusive remainder 16, and a monotonically increasing version.

~~~ts
expect(profile).toMatchObject({
  type: 'COMPOUND',
  version: 1,
  pricingBaseFactorNumerator: '16',
  pricingBaseFactorDenominator: '1',
  components: [
    { key: 'gauge', baseFactorNumerator: '16', baseFactorDenominator: '1' },
    { key: 'gira', baseFactorNumerator: '1', baseFactorDenominator: '1', maxExclusive: '16' },
  ],
})
~~~

Run: pnpm --filter @sherhisab/api exec vitest run test/products/product-conversion.test.ts
Expected: FAIL because conversion tables/service do not exist.

- [ ] **Step 2: Create exact conversion schema**

007_quantity_conversion.sql creates product_conversion_profiles and product_conversion_components. Each active Product has at most one active profile; historical versions remain addressable. Store base_factor_numerator/base_factor_denominator as BIGINT > 0, pricing_base_factor_numerator/pricing_base_factor_denominator as BIGINT > 0, field order, min value, optional max-exclusive value, allow_fraction, auto_normalize_remainder, display precision, and version.

Do not add a formula/expression column.

- [ ] **Step 3: Implement exact normalization and RED behavioral tests**

Define:

~~~ts
export type QuantityInput =
  | { kind: 'SIMPLE'; baseQty: string }
  | { kind: 'COMPONENTS'; profileId: string; profileVersion: number; components: Record<string, string> }

export interface NormalizedQuantity {
  baseQty: string
  pricingQty: string
  displayQty: string
  components: Record<string, string>
  snapshot: ConversionProfileSnapshot | null
}
~~~

Test Pipe 1 + 5 Feet => 25 base Feet; Fabric 2 Gauge + 5 Gira => 37 base Gira and 2.3125 pricing Gauge; Carton/Piece generic profile; zero total rejected; negative component rejected; remainder 16 rejected or normalized only when profile says so; decimal component math is exact.

- [ ] **Step 4: Implement ConversionService.normalize()**

Use decimal.js only to parse component inputs and rational multiplication/division. The service fetches the exact active profile for new transactions or a stored snapshot for historical rendering.

For SIMPLE, pricingQty equals baseQty unless a fixed pricing-unit factor is configured.

- [ ] **Step 5: Integrate Product create/edit configuration**

Extend Product API types and validation with conversion profile configuration. Product UI exposes profile type, base/pricing unit, ordered component labels/ratios and remainder rules. Presets may prefill Pipe/Feet or Gauge/Gira, but persisted behavior is generic configuration, not name-based branching.

- [ ] **Step 6: Test migration compatibility**

Create pre-007 Products using existing FIXED/VARIABLE product_units, apply 007, and verify existing rows still load. Do not reinterpret existing Product data until a conversion profile is explicitly configured.

- [ ] **Step 7: Verify and commit**

Run:
- pnpm --filter @sherhisab/api exec vitest run test/products/product-conversion.test.ts
- pnpm --filter @sherhisab/web exec vitest run src/features/products/product-form-dialog.test.tsx
- pnpm typecheck
- pnpm lint
- pnpm test
- pnpm build
- git diff --check

Commit: feat: add exact product conversion foundation

Open PR, inspect migration and quantity math diff, wait for green CI, then merge before Task 2.

---

### Task 2: Serial, Warranty, Batch/Expiry and Capture-Field Foundation

**Implementation branch:** feat/pos-tracking-foundation

**Legacy review before RED:** Products.gs, StockLots.gs, Sales.gs, Invoice.gs, pos.html.

**Files:**
- Create: db/migrations/008_inventory_tracking.sql
- Create: apps/api/src/modules/products/tracking.types.ts
- Create: apps/api/src/modules/products/tracking.repository.ts
- Create: apps/api/src/modules/products/tracking.service.ts
- Create: apps/api/test/products/inventory-tracking.test.ts
- Modify: apps/api/src/modules/products/product.types.ts
- Modify: apps/api/src/modules/products/product.validation.ts
- Modify: apps/api/src/modules/products/product-master.repository.ts
- Modify: apps/api/src/modules/products/product-master.service.ts
- Modify: apps/api/src/modules/products/product.routes.ts
- Modify: apps/api/src/modules/sales/sales.repository.ts
- Modify: apps/web/src/features/products/product-advanced-fields.tsx
- Test: apps/web/src/features/products/product-form-dialog.test.tsx

**Interfaces:**
- TrackingMode becomes SIMPLE | SERIAL | BATCH_EXPIRY.
- AllocationPolicy is FIFO | FEFO.
- TrackingService.listSellableSerials(), validateAndLockSerials(), listSellableBatches().
- ProductCaptureFieldDefinition is text | number | date | select.

- [ ] **Step 1: Write RED migration and mode-conversion tests**

Seed Products with old SIMPLE, LOT and BATCH values. After migration assert LOT maps to SIMPLE, BATCH maps to BATCH_EXPIRY, every row remains valid, and allocation_policy defaults FIFO.

- [ ] **Step 2: Add tracking schema**

008 creates:
- inventory_serials with tenant+variant+serial uniqueness and IN_STOCK/SOLD/RETURNED status;
- sales_line_serials linking exact sold serials;
- product_warranty_policies;
- warranty_snapshots;
- product_capture_field_definitions;
- sales_line_capture_values.

Reuse inventory_lots.batch_code/expires_on for BATCH_EXPIRY. Add Product allocation_policy and replace the old tracking_mode check constraint without dropping Product data.

- [ ] **Step 3: Add RED serial/warranty tests**

Test that Qty 2 requires exactly two serials; wrong Variant serial is rejected; duplicate serial is rejected; locking the same serial from two transactions allows only one sale path; warranty snapshot retains duration/provider/text after Product policy changes.

- [ ] **Step 4: Add RED FEFO tests**

Create unexpired batches with later receipt but earlier expiry and assert FEFO chooses the earliest unexpired expiry first. Add an expired earlier batch and assert it is omitted/rejected by normal sale planning.

- [ ] **Step 5: Implement TrackingService and repository locks**

Serial validation must use SELECT ... FOR UPDATE on inventory_serials. FEFO ordering is expires_on ASC NULLS LAST, received_on ASC, id ASC for BATCH_EXPIRY+FEFO; ordinary Products preserve FIFO received_on,id.

- [ ] **Step 6: Implement capture-field configuration**

Persist typed definitions and validate select options. Sale-time values are stored as immutable snapshot rows containing definition id plus field key/label/type/value snapshot; do not route conversion arithmetic through capture fields.

- [ ] **Step 7: Add Product UI/tests**

Product advanced fields configure tracking mode, allocation policy, warranty and capture fields. Hide irrelevant controls for SIMPLE without warranty.

- [ ] **Step 8: Verify and commit**

Run targeted Product/tracking tests, then pnpm typecheck, pnpm lint, pnpm test, pnpm build, git diff --check.

Commit: feat: add mature inventory tracking foundation

Merge only on green CI.

---

### Task 3: Customer, Vendor, Finance, POS Settings and Mature RBAC Foundations

**Implementation branch:** feat/pos-accounting-foundation

**Legacy review before RED:** Customer.gs, CustomerSettlement.gs, Vendors.gs, CashBook.gs, CashSession.gs, tests/customer_settlement_business_logic.test.js, tests/cash_session_business_logic.test.js, tests/vendor_workspace_actions_expense_test.js.

**Files:**
- Create: db/migrations/009_pos_parties_finance_settings.sql
- Create: apps/api/src/modules/customers/customer.types.ts
- Create: apps/api/src/modules/customers/customer.repository.ts
- Create: apps/api/src/modules/customers/customer.service.ts
- Create: apps/api/src/modules/customers/customer.routes.ts
- Create: apps/api/src/modules/vendors/vendor.types.ts
- Create: apps/api/src/modules/vendors/vendor.repository.ts
- Create: apps/api/src/modules/vendors/vendor.service.ts
- Create: apps/api/src/modules/vendors/vendor.routes.ts
- Create: apps/api/src/modules/finance/finance.types.ts
- Create: apps/api/src/modules/finance/finance.repository.ts
- Create: apps/api/src/modules/finance/cash-session.service.ts
- Create: apps/api/src/modules/finance/finance.routes.ts
- Create: apps/api/src/modules/settings/pos-settings.repository.ts
- Create: apps/api/src/modules/settings/pos-settings.service.ts
- Create: apps/api/test/customers/customer-service.test.ts
- Create: apps/api/test/finance/pos-finance-foundation.test.ts
- Modify: apps/api/src/modules/auth/permissions.ts
- Modify: apps/api/src/app.ts
- Test: apps/api/test/auth/permissions.test.ts

**Interfaces:**
- normalizePhone(raw) produces the canonical exact-match key used by Customer resolution/history.
- Customer balance sign: positive = receivable due to business; negative = Customer Credit.
- FinancialAccount types BANK | MOBILE_BANKING.
- tenant_pos_settings owns show_purchase_price, require_cash_session and invoice_share_enabled.
- PermissionKey adds POS_VIEW, POS_SELL, SALES_VIEW, SALES_EDIT, SALES_RETURN, POS_COST_VIEW, SALES_TEMPLATE_VIEW, SALES_TEMPLATE_MANAGE, SALES_BACKDATE while retaining existing keys.

- [ ] **Step 1: Write RED permission/settings tests**

Verify Owner/Admin resolve all mature POS permissions; Staff gets only explicit grants; request bodies cannot create grants for another tenant. Verify default POS settings are show_purchase_price=false, require_cash_session=false, invoice_share_enabled=false.

- [ ] **Step 2: Create party/finance/settings schema**

009 creates:
- customers with tenant-scoped customer_code, name, phone, normalized_phone, guardian_name, address, active flag;
- customer_ledger_entries with signed amount_paisa and source reference;
- vendors and vendor_ledger_entries;
- financial_accounts for BANK/MOBILE_BANKING;
- financial_movements with source/reversal references;
- cash_sessions with OPEN/CLOSED status, opening/counted/expected projections and timestamps;
- tenant_pos_settings;
- tenant_document_counters.

Do not enforce normalized_phone uniqueness: the approved workflow explicitly handles ambiguity.

Drop/recreate the user_permission_grants permission_key check with the complete enum.

- [ ] **Step 3: Implement conservative phone normalization and Customer search**

Normalize whitespace, punctuation and Bangladesh +880/880 mobile prefix to the same 01xxxxxxxxx form when safely recognizable. Preserve other digit strings as a deterministic normalized exact-match value rather than inventing a Customer.

Test 017..., +88017... and 88017... match; two active customers may share normalized phone and return an ambiguity result.

- [ ] **Step 4: Implement Customer live balance**

CustomerRepository.balance() sums ledger entries, never invoice cached due. Test positive due and negative Customer Credit.

- [ ] **Step 5: Implement Vendor and financial-account APIs**

Vendor quick-create requires name and tenant context. Bank/Mobile accounts have active status and provider/name metadata. Mutation services reject cross-tenant IDs.

- [ ] **Step 6: Implement Cash Session primitives without enforcement**

Provide open/get-active/close services and exact expected-cash projection from linked CASH movements. Task 13 will enforce business settings at POS action boundaries.

- [ ] **Step 7: Mount routes and verify tenant isolation**

Mount customer/vendor/finance/settings routes in app.ts under authenticated private routes. Add cross-tenant read/write tests.

- [ ] **Step 8: Verify and commit**

Run all new auth/customer/finance tests and full CI commands.

Commit: feat: add POS party finance and settings foundation

Merge only on green CI.

---

### Task 4: Server-Backed POS Search, Bootstrap, Secure Quote DTO and Cost Reveal Gate

**Implementation branch:** feat/pos-read-model

**Legacy review before RED:** pos.html, Products.gs, ProductSettings.gs, tests/compact_pos_mockup.test.js, tests/pos_tablet_exact_mockup.test.js.

**Files:**
- Create: apps/api/src/modules/pos/pos.types.ts
- Create: apps/api/src/modules/pos/pos.repository.ts
- Create: apps/api/src/modules/pos/pos.service.ts
- Create: apps/api/src/modules/pos/pos.routes.ts
- Create: apps/api/test/pos/pos-search.test.ts
- Create: apps/api/test/pos/pos-quote-security.test.ts
- Modify: apps/api/src/modules/sales/sales-allocation.ts
- Modify: apps/api/src/modules/sales/sales-pricing.service.ts
- Modify: apps/api/src/modules/sales/sales.types.ts
- Modify: apps/api/src/app.ts
- Modify: apps/web/src/features/pos/pos-api.ts
- Modify: apps/web/src/features/pos/pos-types.ts

**Interfaces:**

Public quote DTO:

~~~ts
export interface PosLineQuote {
  variantId: string
  baseQty: string
  pricingQty: string
  displayQty: string
  availableOwnBaseQty: string
  shortfallBaseQty: string
  automaticSalesTotalPaisa: string
  effectiveUnitSellingPricePaisa: string
  sellingSegments: Array<{
    lotId: string
    baseQty: string
    unitSellingPricePaisa: string
    amountPaisa: string
  }>
  configuredPurchasePricePaisa?: string
  conversion: NormalizedQuantity
}
~~~

Internal allocation types retain unitCostPaisa/cogsPaisa and never serialize directly to POS clients.

- [ ] **Step 1: Write RED Product search ranking tests**

Seed products matching exact barcode, exact SKU, exact name, prefix, word prefix and substring. Assert ordering exactly follows the spec, zero/negative net-stock items remain present, results are tenant-scoped and bounded.

Exact barcode query must identify the stock-bearing Variant directly.

- [ ] **Step 2: Implement POS search SQL**

Use CASE ranking in PostgreSQL over product name, variant display name, barcode, SKU, brand, category and unit. Add/adjust tenant-scoped indexes where EXPLAIN evidence shows a missing path; do not load the complete catalog into the browser.

- [ ] **Step 3: Write RED cost-leak tests**

Without both gates, recursively walk JSON from /pos/bootstrap, /pos/products and /pos/quote-line and assert no key named unitCostPaisa, cogsPaisa, defaultPurchasePricePaisa or configuredPurchasePricePaisa exists.

With setting=true but permission absent => still omitted.
With permission present but setting=false => still omitted.
With both => only configuredPurchasePricePaisa is included; actual FIFO cost/COGS stays server-only.

- [ ] **Step 4: Split internal allocation from browser-safe quote**

Refactor current sales allocation output so SalesService can use costs internally while PosService maps only allowed selling data. Keep current FIFO/FEFO COGS behavior unchanged.

- [ ] **Step 5: Add /pos/bootstrap, /pos/products, /pos/customers and /pos/quote-line**

Bootstrap returns capabilities/settings/active financial accounts/recent metadata, not the entire Product catalog. Product and Customer search are bounded server queries.

- [ ] **Step 6: Verify and commit**

Run POS search/security tests plus existing sales pricing/routes tests and full CI.

Commit: feat: add secure POS read model and search

Merge only on green CI.

---

### Task 5: Mature Sale Checkout — Customer Snapshots, Discount, Multiple Payments, Numbering and Idempotency

**Implementation branch:** feat/mature-sales-checkout

**Legacy review before RED:** Sales.gs, SalesManagement.gs, Customer.gs, CustomerSettlement.gs, Invoice.gs, CashBook.gs, tests/audit_sales_stock.test.js, tests/invoice_integrity_regressions.test.js, tests/customer_identity_draft_integration.test.js.

**Files:**
- Create: db/migrations/010_mature_sales_checkout.sql
- Create: apps/api/src/modules/sales/sales-numbering.repository.ts
- Create: apps/api/src/modules/sales/customer-resolution.service.ts
- Create: apps/api/src/modules/sales/sales-settlement.ts
- Create: apps/api/src/modules/sales/payment-posting.service.ts
- Create: apps/api/test/sales/mature-checkout.test.ts
- Create: apps/api/test/sales/sales-idempotency.test.ts
- Modify: apps/api/src/modules/sales/sales.types.ts
- Modify: apps/api/src/modules/sales/sales.repository.ts
- Modify: apps/api/src/modules/sales/sales.service.ts
- Modify: apps/api/src/modules/sales/sales.routes.ts
- Modify: apps/api/test/sales/sales-routes.test.ts

**Interfaces:**

~~~ts
export interface CommitSaleInput {
  operationId: string
  businessDate: string
  customer: {
    selectedCustomerId?: string
    name: string
    phone: string
    guardianName?: string
    address?: string
  }
  discountPaisa: string
  lines: CommitSaleLineInput[]
  payments: SalesPaymentInput[]
  sourceDraft?: { id: string; version: number }
}

export interface SalesPaymentInput {
  clientLineId: string
  method: 'CASH' | 'BANK' | 'MOBILE_BANKING' | 'CUSTOMER_CREDIT'
  accountId?: string
  amountPaisa: string
  reference?: string
  note?: string
}
~~~

- [ ] **Step 1: Write RED customer snapshot/master tests**

Test every sale requires Name+Phone; fully paid new buyer writes invoice snapshot but no Customer/ledger; selected existing Customer stays linked on paid sale; Partial/Due resolves exact selected Customer, then unique normalized phone, else creates Customer; ambiguous normalized phone returns 409/validation error and creates no rows.

- [ ] **Step 2: Write RED discount allocation tests**

For multiple lines and a header discount that does not divide evenly, allocate paisa deterministically by line gross proportion with remainder assigned by stable line order. Assert sum(line_discount)=header discount and sum(line_net)=Grand Total exactly.

- [ ] **Step 3: Write RED payment matrix tests**

Cover:
- Cash 500 + Bank 300 + bKash 200 on a 1000 invoice;
- same method across two Bank accounts;
- missing account for BANK/MOBILE_BANKING rejected;
- zero payments => DUE;
- partial payments => PARTIAL;
- cash over-tender => applied amount capped, Change returned;
- Bank/Mobile-only overpayment => rejected;
- Cash 600 + Bank 300 + bKash 200 on 1000 => 100 Cash Change and effective paid 1000;
- Customer Credit only when selected/resolved Customer has enough credit;
- no accidental Customer Credit from overpayment.

- [ ] **Step 4: Create mature checkout schema**

010 extends sales_invoices with tenant-scoped invoice_number, operation_id, customer_id, snapshot fields, normalized phone, subtotal/discount/grand_total, settlement_status, paid/due projections, revision_no and status.

Extend sales_lines with Product/Variant/unit snapshots, pricing_qty, display components snapshot, conversion snapshot/version, gross amount, allocated discount, net amount, capture snapshots and tracking references required by Tasks 1-2.

Create sales_payments with method, optional financial_account_id, tendered_amount_paisa, applied_amount_paisa, reference, note, nullable cash_session_id, created_by_user_id, reversal_of_payment_id and timestamps.

Backfill existing foundation invoices with deterministic per-tenant INV numbers before setting uniqueness. New mature endpoint requires customer snapshots even if old foundation fixtures have nullable legacy snapshots.

- [ ] **Step 5: Implement concurrency-safe Invoice numbering/idempotency**

Lock/upsert tenant_document_counters row for INV. Unique indexes enforce (tenant_id, invoice_number) and (tenant_id, operation_id).

At the start of commitSale, look up operationId in the same tenant. If already committed, return the assembled existing Invoice without mutating stock/payments/ledgers.

- [ ] **Step 6: Implement authoritative settlement**

Server recalculates conversion, pricing, discount and payment applicability. It does not trust browser totals. Financial movements and Customer ledger entries are inserted in the same sale transaction.

- [ ] **Step 7: Add rollback-injection test**

Use a test hook/failing repository operation after at least one line/payment write and assert invoice, sales lines, stock, payment, financial movement and Customer ledger tables all remain unchanged.

- [ ] **Step 8: Verify and commit**

Run mature checkout/idempotency tests, existing sales tests, then full CI commands.

Commit: feat: add mature sale checkout accounting

Merge only on green CI.

---

### Task 6: Stock Source Engine — Own FIFO/FEFO, Negative Shortfall, Purchase Reconciliation and Vendor Sourcing

**Implementation branch:** feat/sales-stock-sources

**Legacy review before RED:** Sales.gs, Purchase.gs, PurchaseManagement.gs, StockLots.gs, Vendors.gs, tests/sale_update_sourcing_reconciliation.test.js, tests/stock_lot_cost_correction_regressions.test.js, tests/vendor_multi_product_memo_regressions.test.js.

**Files:**
- Create: db/migrations/011_sales_stock_sources.sql
- Create: apps/api/src/modules/sales/stock-source.types.ts
- Create: apps/api/src/modules/sales/stock-source.service.ts
- Create: apps/api/src/modules/sales/shortfall.repository.ts
- Create: apps/api/src/modules/sales/vendor-source.repository.ts
- Create: apps/api/src/modules/products/inventory-receipt.service.ts
- Create: apps/api/test/sales/stock-source.test.ts
- Create: apps/api/test/products/shortfall-reconciliation.test.ts
- Modify: apps/api/src/modules/sales/sales-allocation.ts
- Modify: apps/api/src/modules/sales/sales.repository.ts
- Modify: apps/api/src/modules/sales/sales.service.ts
- Modify: apps/api/src/modules/products/inventory.repository.ts
- Modify: apps/api/src/modules/products/inventory.service.ts
- Modify: apps/api/src/modules/products/product-master.repository.ts
- Modify: db constraint through migration only; do not edit 004/006

**Interfaces:**

~~~ts
export type ShortageResolution =
  | { type: 'OWN_STOCK' }
  | { type: 'NEGATIVE_STOCK' }
  | { type: 'VENDOR'; vendorId: string; unitCostPaisa: string }

export interface StockSourcePlan {
  requestedBaseQty: string
  ownBaseQty: string
  shortfallBaseQty: string
  ownAllocations: InternalLotAllocation[]
  shortageResolution: ShortageResolution | null
}
~~~

- [ ] **Step 1: Write RED shortage behavior tests**

Own=5/request=10 returns shortfall=5. OWN_STOCK clamps to 5. Own=0 + OWN_STOCK produces a line-removal response for UI. A shortfall cannot contain both VENDOR and NEGATIVE_STOCK.

- [ ] **Step 2: Create explicit source schema**

011 creates sales_line_vendor_allocations, inventory_shortfalls, inventory_shortfall_reconciliations and vendor_sourcing. Add indexes for oldest outstanding shortfalls by tenant+variant+created_at.

Extend inventory lot source type with PURCHASE and movement type with PURCHASE/RETURN as needed through new migration constraints.

- [ ] **Step 3: Implement Negative Stock commit**

For own=5/request=10:
- lock/consume exactly 5 physical own stock;
- create shortfall 5;
- create sale inventory movement that makes net stock -5;
- never create a negative lot;
- COGS includes own actual cost plus explicit provisional shortfall cost.

Product/POS net stock read model equals physical available quantity minus outstanding shortfall.

- [ ] **Step 4: Implement Purchase receipt reconciliation**

InventoryReceiptService.receivePurchaseLot() creates a real Purchase lot with original_base_qty equal to the full receipt. In the same transaction, lock oldest shortfalls, reconcile up to receipt quantity, create reconciliation rows referencing the real purchase lot/cost, reduce shortfall outstanding, and leave only unreconciled receipt quantity as remaining physical stock.

Test old shortfall=5 + purchase=20 => lot original=20, lot remaining=15, shortfall outstanding=0, net stock=15.

- [ ] **Step 5: Recalculate reconciled shortage COGS without changing revenue**

Reconciliation stores provisional cost, actual cost and COGS adjustment. Update sales line/invoice COGS projection atomically while retaining reconciliation audit. Assert sale revenue/Grand Total stays unchanged.

- [ ] **Step 6: Implement Vendor sourcing**

For own=5/request=10/vendor cost=80:
- own allocation=5;
- vendor allocation=5;
- no owned lot created for vendor qty;
- vendor_sourcing total cost=400;
- vendor ledger payable=400;
- sale line quantity remains 10;
- line COGS includes own cost + vendor cost.

- [ ] **Step 7: Add race tests**

Two concurrent negative sales cannot consume the same last physical quantity twice. Purchase reconciliation locks oldest shortfalls so two receipts cannot reconcile the same outstanding quantity twice.

- [ ] **Step 8: Verify and commit**

Run stock-source/reconciliation tests, all sales/product tests, then full CI.

Commit: feat: add sale stock source engine

Merge only on green CI.

---

### Task 7: Main Mature POS Workspace

**Implementation branch:** feat/mature-pos-workspace

**Legacy review before RED:** pos.html, draftSales.html, tests/compact_pos_mockup.test.js, tests/pos_tablet_exact_mockup.test.js, tests/pos_tablet_recent_drafts.test.js.

**Files:**
- Create: apps/web/src/features/pos/pos-state.ts
- Create: apps/web/src/features/pos/components/product-catalog.tsx
- Create: apps/web/src/features/pos/components/customer-panel.tsx
- Create: apps/web/src/features/pos/components/cart.tsx
- Create: apps/web/src/features/pos/components/cart-line.tsx
- Create: apps/web/src/features/pos/components/conversion-editor.tsx
- Create: apps/web/src/features/pos/components/serial-warranty-editor.tsx
- Create: apps/web/src/features/pos/components/batch-editor.tsx
- Create: apps/web/src/features/pos/components/shortage-resolution.tsx
- Create: apps/web/src/features/pos/components/cost-reveal.tsx
- Create: apps/web/src/features/pos/components/payment-lines.tsx
- Create: apps/web/src/features/pos/components/checkout-summary.tsx
- Create: apps/web/src/features/pos/components/invoice-result.tsx
- Create: apps/web/src/features/pos/mature-pos.test.tsx
- Modify: apps/web/src/features/pos/pos-page.tsx
- Modify: apps/web/src/features/pos/pos-api.ts
- Modify: apps/web/src/features/pos/pos-types.ts
- Modify: apps/web/src/styles.css
- Test: apps/web/src/features/pos/pos-page.test.tsx

**Interfaces:**
- PosPage composes child components and owns route lifecycle only.
- pos-state reducer keeps one authoritative CartLineState per Variant.
- TanStack Query owns server data; transaction draft state stays local/reducer state until saved.

- [ ] **Step 1: Re-read mandatory UI rules and use the approved compact design**

Before UI code, re-read .agents/skills/DESIGN.md and SHERHISAB_UI_CODING_INSTRUCTIONS.md. Use the established SherHisab component tokens; do not redesign the approved two-workspace counter flow.

- [ ] **Step 2: Write RED Product search/scanner keyboard tests**

Assert server search is used, ArrowUp/ArrowDown changes active result, Enter adds it, Escape closes results, Clear preserves cart, and exact barcode response can add exact Variant without a mouse.

- [ ] **Step 3: Write RED Customer panel tests**

Name and Phone are structured searches. Selecting Customer shows live Outstanding Due or Customer Credit. Editing selected Name/Phone clears selectedCustomerId. Guardian/Address stays collapsed by default. Sales History button enables for selected Customer or valid Phone.

- [ ] **Step 4: Write RED conversion row tests**

For compound Fabric:
- collapsed row shows Unit, derived Qty, Price, Total and chevron;
- expanding inserts editor immediately below same row;
- Gauge=2/Gira=5 sends component input and displays rounded 2.31 while quote economics retain exact 2.3125;
- compact Qty is read-only for compound profile;
- changing components re-quotes price/shortage;
- layout order is conversion, tracking, shortage.

- [ ] **Step 5: Write RED shortage tests**

Own Stock clamps positive availability or removes zero-stock line; Vendor reveals Vendor selector/unit cost/shortage total/+New Vendor; Negative selects only negative resolution; switching resolution clears incompatible Vendor fields.

- [ ] **Step 6: Write RED secure 500 ms cost-eye test**

Use fake timers. When configuredPurchasePricePaisa is absent, no eye/reveal value exists. When present, click reveals exact configured purchase price, advance 499 ms => visible, advance one more ms => hidden. Never render internal COGS/lot cost.

- [ ] **Step 7: Write RED multiple-payment UI tests**

Add Cash 500, Bank DBBL 300, bKash Shop bKash 200. Assert + Add Payment creates separate rows, account selector appears only where required, Paid/Due derive live, row remove works, and checkout body preserves all rows.

- [ ] **Step 8: Implement focused components/state**

Keep Product, Customer, Cart, conversion/tracking/shortage and Payment concerns isolated. Do not put business arithmetic beyond display formatting in React; every quantity/price source requiring authority is re-quoted/revalidated by server.

- [ ] **Step 9: Wire Complete Sale and invoice result**

Generate client operation UUID once per submission intent and reuse it on retry until success/intent changes. On success clear editable transaction state and show assembled invoice result.

- [ ] **Step 10: Verify responsive behavior**

Test desktop/tablet compact two-workspace layout and mobile vertical expansion. Compound editor stays inline at all breakpoints, never moves to modal/side sheet.

- [ ] **Step 11: Verify and commit**

Run all POS web tests plus full CI.

Commit: feat: build mature POS workspace

Merge only on green CI.

---

### Task 8: Draft Sales With Full Round-Trip State and Optimistic Versioning

**Implementation branch:** feat/pos-drafts

**Legacy review before RED:** DraftSales.gs, draftSales.html, tests/draft_sales_invoice.test.js, tests/draft_sales_pos.test.js, tests/draft_sales_regression.test.js, tests/draft_sales_conversion.test.js.

**Files:**
- Create: db/migrations/012_sales_drafts.sql
- Create: apps/api/src/modules/sales/sales-draft.types.ts
- Create: apps/api/src/modules/sales/sales-draft.repository.ts
- Create: apps/api/src/modules/sales/sales-draft.service.ts
- Create: apps/api/test/sales/sales-drafts.test.ts
- Create: apps/web/src/features/pos/components/recent-drafts.tsx
- Create: apps/web/src/features/pos/drafts.test.tsx
- Modify: apps/api/src/modules/sales/sales.routes.ts
- Modify: apps/web/src/features/pos/pos-api.ts
- Modify: apps/web/src/features/pos/pos-state.ts
- Modify: apps/web/src/features/pos/pos-page.tsx

**Interfaces:**
- Draft stores customer snapshot/id, line quantity components + conversion snapshot, price mode, source decision, serial/batch/warranty/capture state, discount, every Payment Line, note, version and owner.
- Draft mutation accepts expectedVersion; successful update increments version.
- Posting Draft feeds the same authoritative SalesService used by ordinary Complete Sale.

- [ ] **Step 1: Write RED no-business-mutation test**

Save a Draft containing customer, conversion values, Vendor decision, serial choice, discount and multiple payments. Assert no sales_invoice, inventory movement, customer ledger, vendor ledger or financial movement is created.

- [ ] **Step 2: Create draft schema**

012 creates sales_drafts, sales_draft_lines and sales_draft_audit with tenant FKs and version. Store line component/conversion snapshots as transaction-state JSONB while keeping identity/amount/source fields typed.

- [ ] **Step 3: Write RED round-trip tests**

Save/load/update must reproduce all fields including all Payment Lines and custom conversion components. Change the Product conversion profile after saving and assert loaded Draft still shows its stored component snapshot; posting revalidates current Product compatibility without silently reinterpreting old numbers.

- [ ] **Step 4: Implement optimistic version conflict**

UPDATE uses WHERE tenant_id=? AND id=? AND version=expectedVersion and increments version. Zero affected rows returns 409 with current version metadata.

- [ ] **Step 5: Implement idempotent Draft posting**

Draft stores posted_sale_id once successful. A repeated Post with the same Draft/version/operationId returns the same Invoice, never duplicates sale effects.

- [ ] **Step 6: Add Recent Draft UI**

Recent Drafts loads into the existing POS editor, not a second sale screen. Delete/Archive uses existing AlertDialog pattern because it discards saved work.

- [ ] **Step 7: Verify and commit**

Run draft API/UI tests, full regression and CI.

Commit: feat: add versioned POS drafts

Merge only on green CI.

---

### Task 9: Reusable Invoice Templates

**Implementation branch:** feat/pos-templates

**Legacy review before RED:** pos.html and invoice/draft workflows only to preserve counter expectations; templates are an intentional SherHisab improvement.

**Files:**
- Create: db/migrations/013_sales_templates.sql
- Create: apps/api/src/modules/sales/sales-template.types.ts
- Create: apps/api/src/modules/sales/sales-template.repository.ts
- Create: apps/api/src/modules/sales/sales-template.service.ts
- Create: apps/api/test/sales/sales-templates.test.ts
- Create: apps/web/src/features/pos/components/template-picker.tsx
- Create: apps/web/src/features/pos/templates.test.tsx
- Modify: apps/api/src/modules/sales/sales.routes.ts
- Modify: apps/web/src/features/pos/pos-api.ts
- Modify: apps/web/src/features/pos/pos-state.ts
- Modify: apps/web/src/features/pos/pos-page.tsx

**Interfaces:**
- Template price strategy: CURRENT_AUTO default, FIXED_MANUAL only when deliberately configured and actor has override permission.
- Template contains Product/Variant + quantity component defaults; no Customer, payments, Draft identity or old Vendor/Negative decision by default.

- [ ] **Step 1: Write RED permission and persistence tests**

SALES_TEMPLATE_VIEW can list/load only; SALES_TEMPLATE_MANAGE can create/rename/edit/duplicate/archive. Staff without permissions gets 403.

- [ ] **Step 2: Create template schema**

013 creates sales_templates and sales_template_lines. Persist line quantity components and conversion snapshot defaults, plus optional fixed manual price strategy. Do not persist Customer/payment fields.

- [ ] **Step 3: Write RED load semantics tests**

After Template creation, change current lot price/stock. Load Template and assert CURRENT_AUTO re-quotes current inventory/pricing. Assert Vendor/Negative source is not carried. Completing sale leaves Template unchanged.

- [ ] **Step 4: Implement create/load/edit/duplicate/archive APIs**

Loading returns a fresh POS cart seed; it does not create a Draft or Invoice.

- [ ] **Step 5: Implement TemplatePicker UI**

Load into current POS after warning only if it would overwrite a non-empty cart. Keep rename/edit/archive in a compact management dialog, not on the main checkout surface.

- [ ] **Step 6: Verify and commit**

Run template API/UI tests and full CI.

Commit: feat: add reusable sales templates

Merge only on green CI.

---

### Task 10: Invoice Read/Reprint/History/Duplicate/Edit and Revision Audit

**Implementation branch:** feat/sales-invoice-lifecycle

**Legacy review before RED:** Invoice.gs, SalesManagement.gs, invoiceDesign.html, sales.html, Customer.gs, tests/invoice_integrity_regressions.test.js, tests/sales_horizontal_scrollbar_ui.test.js.

**Files:**
- Create: db/migrations/014_sales_invoice_revisions.sql
- Create: apps/api/src/modules/sales/sales-read.repository.ts
- Create: apps/api/src/modules/sales/sales-read.service.ts
- Create: apps/api/src/modules/sales/sales-edit.service.ts
- Create: apps/api/src/modules/sales/sales-revision.repository.ts
- Create: apps/api/test/sales/sales-invoice-lifecycle.test.ts
- Create: apps/api/test/sales/sales-edit.test.ts
- Create: apps/web/src/features/sales/sales-api.ts
- Create: apps/web/src/features/sales/sales-types.ts
- Create: apps/web/src/features/sales/invoice-view.tsx
- Create: apps/web/src/features/sales/invoice-image.ts
- Create: apps/web/src/features/sales/invoice-view.test.tsx
- Modify: apps/api/src/modules/sales/sales.routes.ts
- Modify: apps/web/src/features/pos/components/customer-panel.tsx
- Modify: apps/web/src/features/pos/pos-page.tsx
- Modify: apps/web/src/app/router.tsx
- Modify: apps/web/package.json
- Modify: pnpm-lock.yaml

**Interfaces:**
- GET /sales/:id and invoice-number lookup return assembled snapshot invoice.
- Customer history query is customer_id OR exact normalized_phone.
- PATCH /sales/:id requires expectedRevision and reason.
- Duplicate returns a fresh POS cart seed only.

- [ ] **Step 1: Write RED snapshot rendering/history tests**

Change current Product name/unit/conversion/warranty after sale. Invoice read must still return original snapshots. Create an old fully-paid untracked invoice with phone X, later create Customer X, and assert Sales History includes the old invoice via normalized phone.

- [ ] **Step 2: Create revision schema**

014 creates sales_invoice_revisions with unique (tenant_id,sale_id,revision_no), reason, before_snapshot, after_snapshot, actor, created_at. Snapshots contain enough transaction state to explain line quantity/pricing/source/payments/customer/totals.

- [ ] **Step 3: Write RED Duplicate semantics tests**

Duplicate keeps Product/Variant and quantity starting values, but clears Customer, payments, Draft id and Vendor/Negative source decision; it re-quotes current stock/pricing.

- [ ] **Step 4: Write RED Invoice Edit delta tests**

Cover add Product, remove Product, increase/decrease quantity, 5000 paid => edit to 7000 with same payments creates/resolves Customer and 2000 receivable, Due=>Paid, payment-line delta/reversal, Negative source delta, Vendor source delta, serial delta, and stale revision conflict.

Before Task 11 exists, structural-return blocking test may seed a minimal dependent-return fixture only after 015 is merged; Task 11 adds the final cross-feature regression.

- [ ] **Step 5: Implement atomic edit algorithm**

Lock invoice, compare revision, load old complete state, validate new complete state, compute stock/source/tracking/payment/customer deltas, write revision snapshot, apply deltas, increment revision, keep same invoice id/number, commit all-or-nothing.

Do not delete old financial movement history; reverse/delta it.

- [ ] **Step 6: Implement invoice view/reprint/Find & Print**

Invoice-number lookup is tenant/SALES_VIEW scoped and does not expose sequential invoices from another tenant.

Render customer/product/conversion/serial/warranty/batch/payment snapshot fields. Use browser print for Print.

- [ ] **Step 7: Implement Save JPG and gated Share**

Add the small html-to-image browser dependency and capture only the invoice print container as JPEG. Render Share/WhatsApp only when bootstrap invoiceShareEnabled is true; the action uses the generated invoice artifact/text and does not create a subscription engine.

- [ ] **Step 8: Add Edit/Duplicate/Sales History entry points**

Edit loads the same POS with an obvious Edit Invoice banner, preserved invoice number and required reason. Duplicate loads a fresh non-edit cart.

- [ ] **Step 9: Verify and commit**

Run invoice lifecycle/edit/UI tests and full CI.

Commit: feat: add invoice lifecycle and revision-safe editing

Merge only on green CI.

---

### Task 11: Single Sales Return With Flexible Refunds and Source-Aware Restoration

**Implementation branch:** feat/sales-returns

**Legacy review before RED:** SalesReturn.gs, returnHistory.html, returns.html, Sales.gs, StockLots.gs, tests/return_ledger_regressions.test.js, tests/mobile_customer_return_regressions.test.js.

**Files:**
- Create: db/migrations/015_sales_returns.sql
- Create: apps/api/src/modules/returns/return.types.ts
- Create: apps/api/src/modules/returns/return.repository.ts
- Create: apps/api/src/modules/returns/return-planner.ts
- Create: apps/api/src/modules/returns/return.service.ts
- Create: apps/api/src/modules/returns/return.routes.ts
- Create: apps/api/test/returns/single-return.test.ts
- Create: apps/api/test/returns/return-source-restoration.test.ts
- Create: apps/web/src/features/returns/return-api.ts
- Create: apps/web/src/features/returns/return-types.ts
- Create: apps/web/src/features/returns/single-return-page.tsx
- Create: apps/web/src/features/returns/single-return-page.test.tsx
- Modify: apps/api/src/app.ts
- Modify: apps/web/src/app/router.tsx
- Modify: apps/web/src/features/sales/invoice-view.tsx

**Interfaces:**
- Return operationId is tenant-unique.
- Returnable quantity = sold - prior valid returns under row lock.
- Default return unit economics come from stored post-discount sale-line net value.
- Refund method is CASH | BANK | MOBILE_BANKING | CUSTOMER_CREDIT and is independent of original payment methods.

- [ ] **Step 1: Write RED quantity/economic ceiling tests**

Partial/full/repeated returns; lower operator return price accepted; negative or price above remaining economic ceiling rejected; quantity above remaining returnable rejected; return date before sale rejected unless allowed backdate rules are satisfied.

- [ ] **Step 2: Create return schema**

015 creates sales_returns, sales_return_lines and sales_return_refunds with SRT tenant-scoped numbering, operation id, source sale, refund method/account/customer, source snapshot references and reversal/audit fields.

- [ ] **Step 3: Write RED flexible refund matrix**

Explicitly test:
- original Bank+bKash 1000 => Cash refund 500 succeeds;
- original Cash => Bank refund succeeds with active Bank account;
- mixed original payments => full approved return refund in Cash succeeds;
- Mobile refund after another method succeeds;
- refund total > valid Return value is rejected;
- original channel capacity never limits refund.

- [ ] **Step 4: Implement owned-lot restoration**

Restore source allocation evidence from sales_line_lot_allocations. Do not create unrelated generic-cost stock. Returned Batch restores valid source batch/expiry evidence; exact Serial is required and returns to sellable state according to policy.

- [ ] **Step 5: Implement Negative Shortfall restoration**

If shortfall still outstanding, reduce/reverse outstanding quantity. If already reconciled by Purchase, preserve reconciliation rows and restore inventory/COGS consistently using the linked real purchase lot evidence.

Add the Review Focus sequence: negative sale => later purchase reconciliation => partial return; assert net stock, COGS and provenance.

- [ ] **Step 6: Implement Vendor-source return**

Do not add vendor-sourced returned quantity to owned stock. Reverse/adjust vendor_sourcing and vendor ledger obligation for the returned source quantity.

- [ ] **Step 7: Implement Customer Credit refund resolution**

If invoice lacks customer_id, resolve unique normalized phone or create from snapshot, then post negative customer balance/credit. Do not create retroactive receivable entries for old paid invoices.

- [ ] **Step 8: Add Return UI and invoice action**

Return screen shows remaining returnable quantities, original human conversion components, default effective post-discount value, editable lower Return price, refund method/account and result SRT number.

- [ ] **Step 9: Add Invoice Edit structural block regression**

Once a valid dependent Return exists, PATCH structural Product/Qty changes to that Invoice must reject while non-structural allowed metadata changes follow approved edit rules.

- [ ] **Step 10: Verify and commit**

Run all return + sales edit + finance tests and full CI.

Commit: feat: add source-aware flexible sales returns

Merge only on green CI.

---

### Task 12: Customer-First Atomic Batch Return / BSRT

**Implementation branch:** feat/batch-sales-returns

**Legacy review before RED:** SalesReturn.gs, returns.html, docs/superpowers/specs/2026-09-21-multi-invoice-sales-return-design.md, docs/superpowers/plans/2026-09-21-multi-invoice-sales-return-implementation-plan.md, tests/multi_invoice_sales_return_regressions.test.js.

**Files:**
- Create: db/migrations/016_batch_sales_returns.sql
- Create: apps/api/src/modules/returns/batch-return.types.ts
- Create: apps/api/src/modules/returns/batch-return.repository.ts
- Create: apps/api/src/modules/returns/batch-return.service.ts
- Create: apps/api/test/returns/batch-return.test.ts
- Create: apps/web/src/features/returns/batch-return-page.tsx
- Create: apps/web/src/features/returns/batch-return-page.test.tsx
- Modify: apps/api/src/modules/returns/return.routes.ts
- Modify: apps/web/src/app/router.tsx

**Interfaces:**
- Parent document is BSRT-xxxxxx.
- Each source Invoice receives one child SRT row linked to parent batch.
- Entire batch has one tenant-scoped operationId and one PostgreSQL transaction.

- [ ] **Step 1: Write RED customer-first selection tests**

Search Customer by ID/name/phone, load history, require 2-20 unique invoices, same exact Customer, max 100 selected return lines, and return date not before any source sale.

Mixed Customer, 1 invoice, 21 invoices and 101 selected lines all reject before mutation.

- [ ] **Step 2: Create batch schema**

016 creates sales_return_batches and adds nullable batch_return_id on sales_returns with tenant-safe FK. Add BSRT counter support and unique tenant operation id.

- [ ] **Step 3: Write RED BSRT/child SRT linkage tests**

Completing three-invoice return creates exactly one BSRT and three child SRTs, each child linked to its exact source invoice and parent.

- [ ] **Step 4: Write RED atomic rollback test**

Inject failure while writing the second/third child. Assert zero parent/child Return docs survive, no stock restoration survives, no refund movement survives, no Customer Credit survives and no Vendor reversal survives.

- [ ] **Step 5: Write RED common flexible refund test**

A batch of invoices originally paid through different methods may be refunded using one cashier-selected allowed Cash/Bank/Mobile/Customer Credit method up to total approved batch Return value.

- [ ] **Step 6: Implement one-transaction batch algorithm**

Lock all selected invoices and relevant return/stock/serial rows in stable id order, validate everything first, allocate BSRT + child SRT numbers under locked counters, apply source-aware restorations and one coherent refund/credit posting, then commit.

- [ ] **Step 7: Build Batch Return UI**

Flow: Sales Return => Find Customer => select Customer => invoice multi-select => Open Selected => line multi-select/quantity/value => refund => Complete. Keep 2-20 and 100-line limits visible before submit.

- [ ] **Step 8: Verify and commit**

Run batch/single return tests and full CI.

Commit: feat: add atomic customer batch returns

Merge only on green CI.

---

### Task 13: Configurable Cash Session Enforcement Across Sale and Refund

**Implementation branch:** feat/pos-cash-session

**Legacy review before RED:** CashSession.gs, CashBook.gs, Sales.gs, SalesReturn.gs, tests/cash_session_business_logic.test.js, tests/finance_daybook_cash_direction.test.js.

**Files:**
- Create: apps/api/test/finance/cash-session-pos-integration.test.ts
- Create: apps/web/src/features/pos/components/cash-session-status.tsx
- Create: apps/web/src/features/pos/cash-session.test.tsx
- Modify: apps/api/src/modules/finance/cash-session.service.ts
- Modify: apps/api/src/modules/sales/payment-posting.service.ts
- Modify: apps/api/src/modules/returns/return.service.ts
- Modify: apps/api/src/modules/returns/batch-return.service.ts
- Modify: apps/api/src/modules/pos/pos.service.ts
- Modify: apps/web/src/features/pos/pos-page.tsx
- Modify: apps/web/src/features/returns/single-return-page.tsx
- Modify: apps/web/src/features/returns/batch-return-page.tsx

**Interfaces:**
- Setting require_cash_session=false permits POS actions without a session.
- When true, applicable POS financial action resolves one active session for actor/business; Cash payments/refunds link to it.
- Original sale payment method never determines refund eligibility.

- [ ] **Step 1: Write RED setting matrix**

Setting OFF + no session => Cash sale/refund succeeds.
Setting ON + no session => POS financial action returns conflict requiring open session.
Setting ON + active session => succeeds and Cash rows link session id.

- [ ] **Step 2: Test non-cash and expected-cash behavior**

Bank/Mobile movement uses selected account. Session summary counts Cash In/Out only, with opening + cash sales - cash refunds = expected cash before counted cash/difference.

- [ ] **Step 3: Test flexible refund remains independent**

Original Bank/bKash sale + setting ON + active session => full Cash refund is allowed and creates Cash Out in current session.

- [ ] **Step 4: Implement service enforcement**

Centralize requireActiveForPosFinancialAction() in CashSessionService and call it from sale/return/batch services; do not duplicate setting rules in routes/UI.

- [ ] **Step 5: Add compact UI status**

POS shows active session status only when business requires it. When missing, disable financial completion with a direct open-session action/message; master-data behavior is unaffected.

- [ ] **Step 6: Verify and commit**

Run Cash Session, payment and return integration tests and full CI.

Commit: feat: integrate configurable POS cash sessions

Merge only on green CI.

---

### Task 14: Production Hardening, Concurrency, Security, Performance and Release Gate

**Implementation branch:** feat/mature-pos-production-gate

**Legacy review before RED:** FINAL_PRODUCTION_AUDIT_REPORT.md, PRODUCTION_STATE_DRIFT_FIX_REPORT.md, tests/production_gate_static.test.js, tests/production_gate_browser.cjs, tests/production_gate_e2e.py, tests/state_drift_accounting_invariants.test.js, tests/state_drift_sequence_fuzz.test.js.

**Files:**
- Create: apps/api/test/pos/mature-pos-concurrency.test.ts
- Create: apps/api/test/pos/mature-pos-security.test.ts
- Create: apps/api/test/pos/mature-pos-rollback.test.ts
- Create: apps/api/test/pos/mature-pos-performance.test.ts
- Create: apps/web/src/features/pos/mature-pos-regression.test.tsx
- Modify: .github/workflows/ci.yml only if a missing automated gate is demonstrated
- Modify: database indexes in a new 017 migration only if EXPLAIN/tests prove an index is required
- Modify: feature code only for defects exposed by the hardening tests

**Interfaces:**
- No new business behavior. This task proves integrated invariants and repairs only evidence-backed defects.

- [ ] **Step 1: Add tenant/RBAC spoofing regression suite**

Assert body/query tenantId cannot read/write another tenant, sequential invoice/SRT/BSRT numbers cannot enumerate another tenant, every POS/Sales/Return permission is enforced server-side, and forbidden cost fields do not leak.

- [ ] **Step 2: Add concurrent last-stock race**

Two transactions request the last owned unit. Assert physical allocation cannot be consumed twice; the loser either receives shortage handling/stock conflict according to submitted resolution and no partial write.

- [ ] **Step 3: Add same-serial race**

Two sales select one serial concurrently; exactly one commits and serial has one sale linkage.

- [ ] **Step 4: Add Return/Edit races**

Two Returns against the same remaining quantity cannot exceed Sold - prior returns. Two Invoice Edits with the same expected revision cause one success and one 409. Structural edit with existing Return remains blocked.

- [ ] **Step 5: Add idempotency/counter races**

Concurrent retries with the same sale/return/batch operationId return one document. Concurrent distinct creates get unique INV/SRT/BSRT numbers without gaps caused by rolled-back rows becoming duplicates.

- [ ] **Step 6: Add injected-failure rollback matrix**

Force failures after stock, payment, Customer ledger, Vendor ledger, serial status and refund writes. For each mutation, verify the enclosing transaction restores the entire pre-request state.

- [ ] **Step 7: Add conversion snapshot drift regression**

Create Draft/Invoice with Gauge/Gira profile v1, change Product profile to v2, then load invoice, edit, return and batch-return preparation. Each historical surface must render/validate stored v1 human components and exact base/pricing quantities.

- [ ] **Step 8: Add performance assertions**

Seed a production-shaped tenant dataset and inspect EXPLAIN for Product search, Customer history, oldest shortfall lookup, invoice lookup and returnable-line lookup. Add only evidence-backed tenant-leading indexes in a new migration.

Bound API result sizes and prevent N+1 per-cart-line reads in bootstrap/history endpoints.

- [ ] **Step 9: Run complete CI gate**

GitHub Actions must freshly pass:
- every migration from 001 through latest on PostgreSQL 17;
- pnpm typecheck;
- pnpm lint;
- pnpm test;
- pnpm build.

Review the entire branch diff and CI logs. Do not merge on inspection alone.

- [ ] **Step 10: Merge production-gate PR**

Use Superpowers requesting-code-review, verification-before-completion and finishing-a-development-branch. Merge only after review finds no unresolved correctness/security issue and CI is green.

- [ ] **Step 11: Stop before local/deployment unless explicitly requested**

After GitHub main is green, do not use Desktop Commander, local PostgreSQL, Cloudflare deploy or LAN serving unless the user explicitly asks for local verification/deployment. If asked, pull the exact merged main commit, apply migrations, run full regression, then deploy/serve that same commit.

Commit: test: harden mature POS production gate

---

## Cross-Task Acceptance Matrix

- Product search/scanner: Task 4 API, Task 7 UI, Task 14 performance/security.
- FIFO/FEFO/manual Reset: Tasks 2, 4, 5, 7.
- Purchase-price eye and 500 ms secrecy: Tasks 3, 4, 7, 14.
- Own/Vendor/Negative shortage: Tasks 6-7.
- Purchase shortfall reconciliation/provenance: Task 6; Return reversal in Task 11.
- Customer snapshots/master/ledger/history: Tasks 3, 5, 7, 10-12.
- Multiple payments/change/noncash overpayment: Tasks 5 and 7.
- Flexible refund independent of original channel: Tasks 11-13.
- Drafts: Task 8.
- Templates: Task 9.
- Duplicate/Reprint/Edit/revision audit: Task 10.
- Exact custom conversion + inline expansion: Tasks 1 and 7; persistence regressions Tasks 8-11,14.
- Serial/Warranty/Batch/Expiry/FEFO: Tasks 2, 5-7, 10-12.
- Single Return: Task 11.
- Batch BSRT/SRT: Task 12.
- Cash Session optional/required: Tasks 3 and 13.
- Idempotency/concurrency/tenant isolation/rollback: Tasks 5, 8, 11, 12 and final proof Task 14.
- Invoice Print/JPG/gated Share: Task 10.
- GitHub-first CI and no unrequested local work: every task.

## Plan Self-Review Result

- Spec coverage: all Mature POS design sections 1-56 are mapped to at least one task or global constraint.
- Scope separation: the 12 spec implementation slices remain recognizable; party/read-model prerequisites are made explicit so later slices have stable interfaces.
- Placeholder scan: no deferred implementation markers or unspecified generic error-handling steps remain.
- Type consistency: conversion snapshots flow from Task 1 into sales/draft/template/edit/return; payment/source/customer types have one named authority; INV/SRT/BSRT counters share the same tenant counter primitive.
- Review Focus: each of the five high-risk conditions has an explicit automated test in its owning task plus an integrated regression in Task 14 where cross-domain behavior matters.
- Migration discipline: 001-006 are immutable; every schema evolution is additive through 007+.
- Release discipline: no task is called the finished public POS before Task 14 passes.
