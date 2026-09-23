# SherHisab Product Master & Inventory Foundation Design

Date: 2026-09-23  
Status: Draft for review  
Approach: C — Progressive relational Product Master

## Goal

Implement the first Phase 2 Core Master Data slice as an improved version of the proven SherERP Google Apps Script product workflow.

SherHisab must preserve the operational behavior that already works in `shuvodelux-commits/sherERP_Mohim`, while replacing Google Sheets limitations with a tenant-safe PostgreSQL model that can later support hardware, fabric, furniture, pharmacy, electrical, battery, and general retail businesses without making the normal Product screen complicated.

The default experience remains simple:

`Product Name → Brand → Category → Unit → Barcode → Purchase Price → Selling Price → Opening Stock → Minimum Stock`

Advanced capabilities stay hidden unless enabled.

## Source of Truth

Behavioral reference:

- `shuvodelux-commits/sherERP_Mohim`
- `Products.gs`
- `ProductSettings.gs`
- `StockLots.gs`
- `Purchase.gs`
- existing product/purchase UI

SherHisab architecture/reference:

- `AGENTS.md`
- `SHERHISAB_UI_CODING_INSTRUCTIONS.md`
- `docs/superpowers/specs/2026-09-22-foundation-tenancy-auth-shell-design.md`

Rule:

> Preserve the workflow. Improve the presentation and data model.

## Existing SherERP Behavior to Preserve

The current SherERP already establishes several important business rules:

1. Products are soft-disabled rather than normally deleted.
2. Active product names are case-insensitively unique.
3. Opening stock greater than zero requires a positive purchase price.
4. Creating opening stock creates an inventory lot and a stock movement.
5. Stock corrections do not silently edit stock; they create movement evidence.
6. Positive stock corrections create a new cost layer/lot.
7. Negative stock corrections consume FIFO stock.
8. Purchase lines create separate stock lots with their own purchase cost.
9. Purchase lots are ordered by the actual purchase date, not write time.
10. Lot-specific selling price can be captured.
11. Sales can deliberately go below zero; oversold inventory is represented explicitly.
12. Sales returns restore the exact lots previously consumed where evidence exists.
13. Internal stock-lot cost corrections are auditable.
14. Categories and Units drive product selectors.
15. Purchase validates the entire basket before writes.
16. Product and supplier operational selectors exclude inactive/deleted records.

SherHisab should preserve these business outcomes even when the implementation changes.

## Improvements Over Google Apps Script

The Apps Script model stores category/unit as plain text on Products, keeps `Current Stock` as a mutable cache, relies on sheet-row coordination, and uses script locks to approximate transaction safety.

SherHisab improves this by:

- using tenant-scoped relational foreign keys;
- using PostgreSQL transactions for atomic operations;
- separating product identity from inventory state;
- treating inventory movements/lots as the authoritative stock evidence;
- retaining a simple Product UI while supporting optional advanced structures;
- keeping historical references valid when masters become inactive;
- supporting product-specific unit conversions;
- preparing for stock-bearing variants without forcing them on ordinary users;
- preparing lot/batch/expiry tracking without forcing pharmacy complexity on hardware stores;
- storing money as integer paisa;
- storing quantities and conversion factors as PostgreSQL `NUMERIC`.

## Architectural Principles

### 1. Master data is not transaction state

Product master stores identity, configuration, defaults, and policy.

It must not use a mutable `products.current_stock` column as the authoritative inventory record.

Stock is explained by inventory evidence.

### 2. One inventory identity model

Every product has at least one `product_variant` row.

For an ordinary product, the system automatically creates one hidden/default variant.

The user does not see the word “variant” unless advanced variants are enabled.

This prevents Purchase, Stock, POS, Sales, Returns, and reporting from having to support both `product_id` and `variant_id` inventory models.

### 3. Progressive disclosure

Simple businesses see simple fields.

Advanced structures appear only when enabled:

- alternative units;
- color/size/design variants;
- lot/batch tracking;
- expiry;
- product specifications.

### 4. Tenant isolation at the database layer

Every business-owned table contains `tenant_id`.

Where practical, child tables use tenant-aware composite foreign keys, following the existing `users/sessions` precedent.

No request body is trusted for tenant authority.

### 5. History survives master-data changes

Categories, units, products, variants, and barcodes are archived/inactivated rather than destructively removed when historical or active references exist.

Operational selectors show active records only.

Historical screens can still resolve inactive records by ID.

## Proposed Database Model

### product_categories

Purpose: tenant-owned product category master.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `name TEXT NOT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

Rules:

- case-insensitive uniqueness among active categories per tenant;
- archived category names may be reused;
- active products already referencing an archived category continue to display it;
- selectors only offer active categories.

“Uncategorized” is a UI label for `category_id IS NULL`; it is not a magic database record.

### units

Purpose: tenant-owned unit master.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `name TEXT NOT NULL`
- `symbol TEXT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- timestamps

Rules:

- case-insensitive uniqueness among active units per tenant;
- existing references survive unit archival;
- selectors only offer active units.

A default `pcs` unit should be available for each tenant through tenant bootstrap/seeding rather than hard-coded text inside Product rows.

### products

Purpose: shared product identity and product-level configuration.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `name TEXT NOT NULL`
- `brand TEXT NOT NULL DEFAULT ''`
- `category_id UUID NULL`
- `base_unit_id UUID NOT NULL`
- `tracking_mode TEXT NOT NULL DEFAULT 'SIMPLE'`
- `variants_enabled BOOLEAN NOT NULL DEFAULT FALSE`
- `minimum_stock_base_qty NUMERIC NOT NULL DEFAULT 0`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- timestamps

Tracking modes:

- `SIMPLE` — ordinary business product; internal cost lots remain hidden;
- `LOT` — user-visible lot identity is meaningful;
- `BATCH` — batch identity is meaningful and expiry may be captured.

Serial tracking is intentionally deferred.

Rules:

- active product names are case-insensitively unique per tenant;
- `minimum_stock_base_qty >= 0`;
- category and base unit must belong to the same tenant;
- inactive products cannot be selected for new operational transactions.

### product_variants

Purpose: the actual stock-bearing inventory identity.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `product_id UUID NOT NULL`
- `display_name TEXT NULL`
- `sku TEXT NULL`
- `default_purchase_price_paisa BIGINT NOT NULL DEFAULT 0`
- `default_selling_price_paisa BIGINT NOT NULL DEFAULT 0`
- `is_default BOOLEAN NOT NULL DEFAULT FALSE`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- timestamps

Rules:

- every product must have exactly one default variant;
- simple products expose only the default variant internally;
- advanced products may have additional variants;
- inventory tables reference `variant_id`, never a mixed product/variant scheme;
- SKU is tenant-unique when present;
- money values are non-negative integer paisa.

The default variant carries the default purchase/selling prices so variant-specific pricing can be supported later without schema replacement.

### product_units

Purpose: product-specific unit conversion configuration.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `product_id UUID NOT NULL`
- `unit_id UUID NOT NULL`
- `conversion_mode TEXT NOT NULL`
- `conversion_to_base NUMERIC NULL`
- `is_base BOOLEAN NOT NULL DEFAULT FALSE`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- timestamps

Conversion modes:

- `FIXED`
- `VARIABLE`

Rules:

- exactly one active base-unit mapping per product;
- base mapping uses fixed conversion `1`;
- fixed alternative units require `conversion_to_base > 0`;
- variable units leave conversion unset until a transaction/lot captures the actual base quantity;
- the same unit cannot appear twice as an active mapping on one product.

Examples:

- Pipe: base `piece`, box fixed at 20 pieces.
- Wire: base `meter`, coil variable.
- Fabric: base `yard`, roll variable.

The default UI shows only the base unit.

Alternative units live under “More options / Advanced”.

### product_barcodes

Purpose: support the current single-barcode UX while avoiding a future rewrite for multiple/unit-specific barcodes.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `variant_id UUID NOT NULL`
- `unit_id UUID NULL`
- `barcode TEXT NOT NULL`
- `is_primary BOOLEAN NOT NULL DEFAULT FALSE`
- timestamps

Rules:

- barcode is tenant-unique when active;
- normal Product form writes one primary barcode;
- additional barcodes are advanced;
- optional `unit_id` supports pack/unit barcodes later.

### product_option_definitions

Purpose: define stock-bearing variant dimensions for one product.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `product_id UUID NOT NULL`
- `name TEXT NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`

Examples: Color, Size, Design, Grade.

Definitions are product-local rather than a global formula/attribute engine.

### product_option_values

Purpose: allowed values for a product option.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `option_definition_id UUID NOT NULL`
- `value TEXT NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`

### product_variant_option_values

Purpose: map stock-bearing variants to their option values.

Fields:

- `tenant_id UUID NOT NULL`
- `variant_id UUID NOT NULL`
- `option_value_id UUID NOT NULL`

Unique constraints prevent a variant from having multiple values for the same option definition.

Example:

`T-Shirt → Color: Red + Size: L`

### product_specifications

Purpose: descriptive attributes that do not affect stock.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `product_id UUID NOT NULL`
- `name TEXT NOT NULL`
- `value TEXT NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`

Examples:

- Watt: 80W
- Warranty: 2 Years
- Material: Stainless Steel

Specifications must not generate stock variants.

## Minimum Inventory Foundation

Phase 2 needs enough inventory infrastructure to preserve existing SherERP Product behavior safely.

### inventory_lots

Every positive stock origin creates a lot/cost layer, even for SIMPLE products.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `variant_id UUID NOT NULL`
- `source_type TEXT NOT NULL`
- `received_on DATE NOT NULL`
- `unit_cost_paisa BIGINT NOT NULL`
- `default_sell_price_paisa BIGINT NOT NULL`
- `original_base_qty NUMERIC NOT NULL`
- `remaining_base_qty NUMERIC NOT NULL`
- `lot_code TEXT NULL`
- `batch_code TEXT NULL`
- `expires_on DATE NULL`
- `status TEXT NOT NULL DEFAULT 'ACTIVE'`
- timestamps

Initial `source_type` values:

- `OPENING`
- `ADJUSTMENT`

Purchase/return source relationships will be added with their modules rather than introducing weak polymorphic foreign keys now.

Rules:

- opening/positive internal lots with quantity > 0 require positive cost;
- purchase-origin zero-cost stock may later be allowed when it is a genuine free purchase;
- FIFO order is business date then stable ID;
- negative oversold bookkeeping behavior is supported later in Sales without pretending physical stock exists.

### inventory_movements

Purpose: immutable audit evidence for stock changes.

Fields:

- `id UUID PK`
- `tenant_id UUID NOT NULL`
- `variant_id UUID NOT NULL`
- `movement_type TEXT NOT NULL`
- `business_date DATE NOT NULL`
- `base_qty_delta NUMERIC NOT NULL`
- `balance_after_base_qty NUMERIC NOT NULL`
- `reference_type TEXT NOT NULL`
- `note TEXT NOT NULL DEFAULT ''`
- `created_by_user_id UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL`

Initial movement types:

- `OPENING`
- `ADJUSTMENT_IN`
- `ADJUSTMENT_OUT`

`balance_after_base_qty` is an audit snapshot, not the source of truth.

### inventory_movement_lot_allocations

Purpose: preserve exact lot-level evidence for movements that create or consume multiple FIFO lots.

Fields:

- `tenant_id UUID NOT NULL`
- `movement_id UUID NOT NULL`
- `lot_id UUID NOT NULL`
- `base_qty NUMERIC NOT NULL`
- `unit_cost_paisa BIGINT NOT NULL`

This becomes the foundation for exact return/restoration evidence later.

## Stock Balance Strategy

SherHisab will not store authoritative current stock directly on `products`.

For Phase 2, current stock is derived per variant from inventory lot/movement evidence.

The API may use an aggregate SQL query/view for Product list performance.

If future scale requires a materialized/projection balance table, it must remain a transactionally maintained projection, not the sole historical truth.

## Product Creation Transaction

Creating a Product is one PostgreSQL transaction.

Validation happens before writes.

Normal flow:

1. validate trusted `tenantId`;
2. validate product name;
3. validate category/base unit tenancy and active status;
4. validate non-negative default prices/minimum stock/opening stock;
5. if opening stock > 0, require default purchase price > 0;
6. check active-name uniqueness;
7. insert Product;
8. insert hidden default Variant;
9. insert base `product_units` mapping;
10. insert primary barcode when provided;
11. if opening stock > 0:
    - create opening inventory lot;
    - create OPENING movement;
    - create movement-to-lot allocation;
12. commit.

If any step fails, nothing persists.

### Intentional improvement: no cash-session dependency

SherERP currently requires an active cash session when opening stock is created.

SherHisab Product Master will not couple opening inventory creation to a cash session because creating opening inventory does not itself move cash or bank money.

Future accounting opening-balance posting can add an explicit accounting entry without coupling Product Master to the POS cash drawer.

## Product Editing

Editing identity/configuration is separate from stock correction.

The Edit Product form can change:

- name;
- brand;
- category;
- base/default unit configuration subject to inventory safety rules;
- barcode;
- default purchase price;
- default selling price;
- minimum stock;
- tracking policy;
- advanced options.

Current stock is read-only on Edit Product after creation.

This is an intentional usability improvement over the GAS form, which accepted a stock value during Product edit and then internally converted the delta into an adjustment.

SherHisab exposes stock changes through a dedicated **Adjust Stock** action so the user must see that they are making an inventory correction.

## Stock Adjustment

Adjust Stock requires:

- variant;
- non-zero quantity delta;
- reason/note;
- positive cost when increasing stock if no usable default purchase cost exists.

Positive adjustment:

1. validates all input;
2. creates an ADJUSTMENT lot;
3. creates ADJUSTMENT_IN movement;
4. links movement to lot.

Negative adjustment:

1. validates requested removal;
2. must not make an already non-negative physical balance below zero;
3. plans FIFO consumption without writes;
4. applies all lot changes atomically;
5. creates ADJUSTMENT_OUT movement;
6. records exact lot allocations.

If sales have later created a negative/oversold balance, a positive adjustment may move the balance toward zero without being blocked.

## FIFO Rules

SherHisab preserves the corrected SherERP FIFO semantics:

- order by actual business/purchase date;
- use stable identifier as tiebreak;
- never use row insertion timestamp as primary FIFO order;
- validate/plan the entire operation before mutation;
- record lot allocations for downstream COGS and return evidence.

## Price Semantics

### Default purchase price

Stored on the default/variant master as a convenience/default.

It is used for:

- opening stock;
- positive manual adjustments;
- purchase-entry suggestion later.

It is not authoritative historical inventory cost.

### Historical cost

Historical cost belongs to the lot that created the stock.

### Default selling price

Stored on the variant master for normal pricing suggestions.

Future purchase lines may update the default selling price as SherERP currently does, but each lot/transaction may preserve its own selling-price evidence where needed.

Transaction lines will snapshot actual quantity, unit, conversion, unit price, and totals.

## API Module Design

Create a dedicated `products` module following current repository/service/route patterns.

Likely files:

- `product.types.ts`
- `product.repository.ts`
- `product.service.ts`
- `product.routes.ts`

Related focused repositories may exist for category/unit/inventory operations when separation improves testability.

Routes use `withRequestDatabase(c.env, ...)`.

Private routes get tenant identity from authenticated context.

No Product API accepts `tenantId` as authority from the body.

Initial route shape:

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PATCH /products/:id`
- `POST /products/:id/status`
- `POST /products/:id/stock-adjustments`
- `GET /products/:id/lots`
- `GET /product-categories`
- `POST /product-categories`
- `PATCH /product-categories/:id`
- `GET /units`
- `POST /units`
- `PATCH /units/:id`

Advanced variant/unit configuration may be included in Product create/update payloads only when enabled, while repository methods remain explicit.

Avoid one giant unvalidated JSONB product blob.

## UI Design

UI follows `SHERHISAB_UI_CODING_INSTRUCTIONS.md`.

### Products page

Header:

`Products`  
`পণ্য ও স্টক`

Compact toolbar:

`Search | Category | Brand | Status | More filters | Add Product`

TanStack Table columns:

- Product
- Category
- Brand
- Unit
- Purchase Price
- Selling Price
- Stock
- Minimum Stock
- Status
- Actions

Optional advanced columns remain hidden by default.

Numeric columns are right aligned.

Rows use compact action menus.

### Add Product

The default form remains close to SherERP:

- Product Name
- Brand
- Category
- Unit
- Barcode
- Purchase Price
- Selling Price
- Opening Stock
- Minimum Stock

Category and Unit selectors support quick creation without navigating away.

Opening Stock exists only on Create.

### Edit Product

Shows current stock as read-only context.

Stock changes use the separate Adjust Stock action.

### Advanced section

Collapsed by default.

May contain:

- alternative units;
- enable variants;
- variant options;
- tracking mode;
- lot/batch/expiry policy;
- specifications;
- additional barcodes.

Ordinary users never need to open it.

### Language

Default mode:

- English primary;
- small muted Bangla helper.

Also support:

- Full English;
- Full Bangla.

User-entered product data is never auto-translated.

## Default Data

For a new tenant, seed a minimal practical Unit set rather than hard-coding strings into Product logic.

At minimum:

- pcs / Piece

Additional common Bangladesh units can be added during onboarding or by the user.

Category remains nullable and displays as “Uncategorized” when absent.

## Archive/Deactivate Behavior

Products:

- deactivate instead of normal delete;
- inactive products remain resolvable historically;
- inactive products disappear from Purchase/POS selectors.

Categories/Units:

- archive/inactivate;
- existing products retain references;
- archived values disappear from new-selection lists;
- a new active master with the same name may be created.

Variants:

- deactivate instead of destructive deletion after inventory/transaction usage.

## Permissions

Initially follow the existing SherERP product permission concept while fitting SherHisab authorization architecture.

Product master actions should distinguish at least:

- view;
- create;
- edit/configure;
- stock adjustment.

Do not allow client UI visibility to substitute for server authorization.

## Validation and Error Handling

Validation belongs primarily in the service layer and database constraints.

Required checks include:

- trusted tenant id present;
- active tenant-owned category/unit references;
- non-empty names;
- non-negative money;
- non-negative minimum stock;
- non-negative opening stock;
- positive cost for positive opening/internal stock;
- fixed unit conversion > 0;
- variable conversion not supplied as a fake fixed number;
- duplicate active product/category/unit names rejected;
- duplicate SKU/barcode rejected within tenant;
- default variant invariant;
- base unit invariant;
- cross-tenant references rejected.

Routes return predictable 4xx responses for validation/not-found/conflict conditions rather than raw PostgreSQL errors.

## Transaction Boundaries

Use PostgreSQL transactions for every multi-write inventory/master operation.

At minimum:

- Create Product with opening stock;
- Advanced Product configuration replacement/update;
- Adjust Stock;
- later Purchase;
- later Sales;
- later Returns.

Validation should happen before mutation where practical, and database transactions provide rollback protection if a later write fails.

## Concurrency

Product creation uniqueness relies on database unique indexes, not only pre-checks.

Stock adjustments must lock the relevant inventory identity/rows inside the transaction so two concurrent adjustments cannot both consume the same FIFO quantity.

Do not re-create Apps Script global locking in application memory.

## Testing Strategy

Follow Superpowers TDD.

### Migration/database tests

Cover:

- tenant-scoped foreign keys;
- active uniqueness behavior;
- cross-tenant reference prevention;
- decimal quantity support;
- money integer constraints;
- default variant/base unit invariants;
- archival with historical references.

### Service tests

RED first for:

- simple Product create;
- duplicate active name;
- same name allowed in another tenant;
- same archived name can be recreated;
- opening stock requires positive cost;
- Product + default variant + base unit + lot + movement are atomic;
- failure rolls back every Product creation write;
- Product edit never silently changes stock;
- positive adjustment creates a new lot;
- negative adjustment consumes FIFO;
- FIFO uses business date;
- adjustment stores exact lot allocations;
- category/unit from another tenant rejected;
- inactive category/unit cannot be newly assigned;
- fixed and variable unit validation;
- barcode/SKU uniqueness;
- inactive Product excluded from operational listing.

### Route tests

Cover:

- authenticated tenant context required;
- request body tenant spoofing cannot cross tenant boundaries;
- validation errors return expected status/shape;
- tenant only sees own Products/masters/lots.

### Web tests

Cover:

- compact Product table;
- Add Product default fields;
- default English + Bangla helper rendering;
- Opening Stock only in create flow;
- Current Stock read-only on edit;
- Adjust Stock separate action;
- Advanced section collapsed by default;
- advanced fields reveal only when enabled;
- empty/loading/error states;
- active/inactive status handling.

## Verification

Before implementation code is pushed:

- affected API tests;
- affected web tests;
- full `pnpm test`;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm build`;
- `git diff --check`;
- `git status --short`.

For API/database tests, local PostgreSQL must be available as required by `AGENTS.md`.

No code is considered complete without fresh verification evidence.

## Explicit Non-Goals for This Slice

Do not implement yet:

- Purchase transaction module;
- Sales/POS transaction module;
- Sales Returns/Purchase Returns;
- Supplier/customer ledgers;
- accounting journals;
- serial-number inventory;
- arbitrary formula engine;
- generic workflow engine;
- warehouse/multi-location inventory;
- full pharmacy expiry alert workflows;
- per-unit price lists;
- promotions;
- bundles/kits/BOM;
- import/export migration tooling.

The Product model must leave room for these without implementing them prematurely.

## Implementation Slice Boundary

The first implementation slice includes:

1. Product Categories;
2. Units;
3. Product Master;
4. hidden default Variant;
5. primary Barcode;
6. optional alternative-unit configuration foundation;
7. optional variant/specification foundation;
8. tracking-policy configuration;
9. opening inventory lot/movement;
10. dedicated stock adjustment;
11. Product list/Add/Edit/Adjust Stock UI;
12. tenant-safe API and tests.

It does not implement Purchase/Sales transactions yet.

## Decision Summary

Approved approach:

> **C — Progressive relational Product Master**

Key decisions:

- preserve SherERP workflows first;
- ordinary Product UI stays simple;
- every Product gets an internal default stock-bearing Variant;
- advanced variants are optional and hidden;
- one base stock unit per Product;
- fixed + variable alternative-unit conversions;
- internal lots remain the source of FIFO cost evidence;
- current stock is derived/projection, not Product master truth;
- stock edits become explicit adjustments;
- Product creation with opening stock is atomic;
- category/unit references are relational and tenant-safe;
- historical references survive master archival;
- Inter + compact Tailark/Dub-derived SherHisab UI rules apply;
- no generic formula engine or serial tracking in this slice.

## Review Point

This design is intentionally broader than a direct GAS port but narrower than a generic enterprise product engine.

The key product principle remains:

> **DON'T COMPLICATE. MAKE IT EASY FOR ALL.**
