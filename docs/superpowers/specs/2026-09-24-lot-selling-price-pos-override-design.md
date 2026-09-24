# Lot Selling Price, FIFO POS Pricing, and Manual Override Design

**Date:** 2026-09-24
**Status:** Approved design

## Goal

Make inventory lots the source of truth for selling price after stock enters the business, while preserving FIFO costing, allowing authorized cashiers to override the sale price for one invoice, and keeping Product-level prices as opening/default values rather than retroactively rewriting purchased stock.

## Current SherHisab Foundation

- `inventory_lots` already stores `unit_cost_paisa` and `default_sell_price_paisa`.
- Current lot sources are `OPENING` and `ADJUSTMENT`; a Purchase module does not yet exist in the React/Hono SherHisab codebase.
- Positive stock adjustment currently accepts an optional purchase cost and copies the Product/Variant default selling price into the new lot.
- Negative stock adjustment already consumes FIFO lots.
- Current auth has users and sessions, but no role or permission model.
- Current React app has Products/inventory UI only; the new POS/sales module still needs to be built.

## Business Rules

### 1. Opening Stock

- Product-level Purchase Price and Selling Price are defaults for Opening Stock.
- Creating Opening Stock creates a lot with those prices.
- Later edits to Product-level defaults must not rewrite existing lot prices.

### 2. Purchase Stock

- Every purchase stock-in creates a new inventory lot.
- Each purchase lot records:
  - purchase cost,
  - selling price,
  - received date,
  - quantity,
  - supplier/reference when Purchase module exists.
- The selling price saved on that lot is the automatic price used when stock from that lot is sold.
- Editing Product-level global selling price does not modify purchase lots.

### 3. Positive Stock Adjustment

Treat positive adjustment as manual stock-in.

Required fields:
- Quantity
- Purchase Price
- Selling Price
- Reason

A positive adjustment creates a new `ADJUSTMENT` lot with both prices.

### 4. Negative Stock Adjustment

- Quantity + Reason only.
- No price inputs.
- Quantity is consumed using FIFO.
- Existing movement/allocation costing remains based on actual lot cost.

### 5. View Lots

Show:
- LOT-000001-style display label
- Source
- Supplier / Unattributed
- Date
- Purchase Price
- Selling Price
- Original Qty
- Remaining Qty
- Stock Value
- Status

Purchase Price is historical and read-only in normal View Lots.

Selling Price can be edited only when the user has `INVENTORY_EDIT_LOT_SELLING_PRICE` (Owner/Admin get it automatically). Editing an active lot changes future automatic sale pricing only; it never changes historical invoices.

Every saved lot selling-price change records:
- tenant,
- lot,
- old selling price,
- new selling price,
- changed-by user,
- changed-at timestamp.

### 6. POS Automatic Pricing

FIFO determines both allocation and automatic selling-price segments.

Example:
- LOT-000001: consume 2 @ selling price ৳100
- LOT-000002: consume 1 @ selling price ৳110

Automatic sale amount = ৳310.

The cart may present this as one Product line with an effective unit price and an optional lot-price breakdown, while preserving the exact lot allocations internally.

### 7. Manual Cart Selling Price

Permission: `SALES_OVERRIDE_SELLING_PRICE`.

Owner/Admin have it automatically. Staff may receive it explicitly.

When permitted:
- cashier may edit the cart line selling price;
- edit affects only that sale/invoice;
- saved lot selling prices remain unchanged;
- show a visible manual-price warning;
- show `Reset to Lot Price` to restore the automatic FIFO-derived price;
- if manual price is below FIFO cost, show a stronger loss warning;
- an authorized override is allowed after warning.

When not permitted:
- selling price is read-only;
- API rejects a manual price override even if a client tries to send one.

### 8. Profit / COGS

Manual sale price never changes COGS.

COGS is the sum of FIFO allocation quantity × lot purchase cost.

Profit = actual invoice sales amount - FIFO COGS, using exact allocation history.

## Permission Foundation

Add user roles:
- OWNER
- ADMIN
- STAFF

Existing users are backfilled as OWNER for migration compatibility. After the migration, newly created non-bootstrap users default to STAFF unless an authorized owner/admin explicitly chooses another role.

Add explicit staff permission grants.

Permission resolution:
- OWNER/ADMIN: automatic access to privileged selling-price actions.
- STAFF: only explicit grants.

Initial permission keys:
- `SALES_OVERRIDE_SELLING_PRICE`
- `INVENTORY_EDIT_LOT_SELLING_PRICE`

API enforcement is mandatory; UI gating alone is insufficient.

## Product List Selling Price

Once lot pricing is authoritative:
- the Product list/POS catalog selling price should represent the next active FIFO lot selling price when stock exists;
- Product/Variant `defaultSellingPricePaisa` remains the opening/default fallback;
- changing the default does not rewrite existing inventory lots.

## Migration / Compatibility

The existing `inventory_lots.default_sell_price_paisa` column is reused.

New schema is needed for:
- user role,
- explicit user permission grants,
- lot selling-price audit history,
- future Purchase/Sales source/reference types as their modules are introduced.

No historical Product, stock, or lot records should be destructively rewritten.

## UI Principles

- Follow existing compact shadcn/TanStack SherHisab UI rules.
- Use shared 14px operational typography and consistent 12px badges.
- Keep bilingual labels consistent with shared `BilingualLabel`.
- Permission-disabled pricing must look intentionally read-only, not broken.
- Manual price warning and Reset action should be compact and obvious, matching the behavior of the existing Google Apps Script ERP screenshot.

## Out of Scope for This Design

- Bulk repricing all existing lots.
- Rewriting historical invoice prices after lot price edit.
- Editing historical lot purchase cost from View Lots.
- Weighted-average costing; SherHisab remains FIFO.
