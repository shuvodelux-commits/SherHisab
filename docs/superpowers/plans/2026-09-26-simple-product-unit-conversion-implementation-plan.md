# Simple Product Unit Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Product setup express everyday unit ratios directly, let POS enter fixed or mixed units in an expandable cart row, and keep exact, server-verified quantities through Draft and Invoice posting.

**Architecture:** Keep `product_units` authoritative for fixed alternatives and versioned conversion profiles authoritative for mixed/advanced conversions. Extend the existing conversion normalization interface with a fixed-unit input; quote and sale posting recalculate on the server. Reuse existing Draft JSONB and Invoice conversion snapshot columns; no migration is planned.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Hono 4, PostgreSQL 17, `pg`, `decimal.js`, Vitest, TanStack Query, shadcn/Radix.

**Spec:** `docs/superpowers/specs/2026-09-26-simple-product-unit-conversion-design.md`

## Global Constraints

- Preserve existing simple quantities, advanced conversion profiles, tenant isolation, permissions, and historical documents.
- The server owns base quantity, pricing quantity, money rounding, and current-rule validation; browser arithmetic is display-only.
- Keep the compact POS cart row and reuse its existing inline expansion pattern.
- Never silently rewrite saved Draft inputs or posted Invoice snapshots.
- Do not start Task 9, modify `legacy/`, merge, or deploy as part of this plan.
- Read the repository's mandatory instructions and every project `SKILL.md` before the first implementation edit. Use TDD and full GitHub CI before merge.

## Review Focus

- A different tenant's or inactive unit must fail fixed-unit quoting, even if its UUID is supplied directly (Task 1).
- Duplicate fixed alternatives and an alternative equal to the base unit must fail Product save (Task 2).
- A mixed quantity must use 35 Gira for stock and exactly 2.1875 Gauge for a 300/Gauge sale, including lot segments (Task 3).
- An edited ratio after Draft save must warn and block posting until the cashier explicitly corrects the Draft (Task 5).
- Renaming a shared Unit after posting must not change the Invoice's recorded entered-unit name or ratio (Task 5).

---

### Task 1: Normalize fixed alternatives on the server

**Files:**
- Modify: `apps/api/src/modules/products/conversion.types.ts`, `conversion.service.ts`, `conversion.repository.ts`
- Modify: `apps/api/src/modules/pos/pos.routes.ts`, `pos.types.ts`, `pos.service.ts`, `pos.repository.ts`
- Test: `apps/api/test/products/product-conversion.test.ts`, `apps/api/test/pos/pos-quote-security.test.ts`

**Interfaces:**
- Add `QuantityInput` variant `{ kind: 'FIXED_UNIT'; unitId: string; quantity: string }`.
- Add `FixedUnitSnapshot` with `productId`, `unitId`, `unitName`, `unitSymbol`, `quantity`, and exact `conversionToBase`; return it as `NormalizedQuantity.fixedUnitSnapshot` while leaving the existing profile `snapshot` meaning unchanged.
- `ConversionService.normalize(input: QuantityInput, snapshotOverride?)` returns exact `baseQty = quantity × conversionToBase`; fixed units price in the Product's configured pricing unit, or base unit when no pricing profile is active.
- `PosLineQuote.fixedUnitOptions` lists the current Product's active alternatives with their unit IDs and names, so the cart selector never guesses available units.

- [ ] **Step 1: Write failing tests.** Assert `2 carton × 24 = 48 pieces`, `1 bag × 50 = 50 pieces`, selected-unit snapshot fields, and rejection of zero/negative, inactive, cross-tenant, and unrelated-product units. Quote route tests must send `FIXED_UNIT` rather than a client ratio.
- [ ] **Step 2: Run RED.** `DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab pnpm --filter @sherhisab/api exec vitest run test/products/product-conversion.test.ts test/pos/pos-quote-security.test.ts` — new assertions fail for missing `FIXED_UNIT` support.
- [ ] **Step 3: Implement the interface.** Resolve the unit and factor with tenant/Product checks in `ConversionRepository`; calculate with `decimal.js`; return an immutable selected-unit snapshot. Do not accept a factor from the client.
- [ ] **Step 4: Run the same targeted command; require PASS. Commit domain and quote changes.**

### Task 2: Make Product conversion setup direct and allow inline Unit Add/Edit

**Files:**
- Modify: `apps/web/src/features/products/product-advanced-fields.tsx`, `product-form-dialog.tsx`
- Test: `apps/web/src/features/products/product-form-dialog.test.tsx`
- Reuse: Product Unit create/update routes and TanStack Query invalidation already used by `product-master-manage-dialog.tsx`.

**Interfaces:**
- Guided fixed rows persist to existing `alternativeUnits`; guided mixed setup maps to a two-component versioned profile with base factors `N/1` and `1/1`, pricing factor `N/1` when the larger unit is selected for pricing.
- The existing technical profile editor remains under **Advanced conversion settings** for previously configured complex profiles.

- [ ] **Step 1: Write failing UI tests.** Save `1 Gauge = 16 Gira`; save carton 24 and bag 50 on one Product; assert normal setup hides keys/numerators/denominators. Add a Unit inside Advanced conversion and confirm it is selected without losing unsaved Product state. Edit a selected shared Unit and confirm the dialog explains its global effect and refreshed selectors show its new name. Switching conversion modes must require an explicit choice and must not silently rewrite an existing profile.
- [ ] **Step 2: Run RED.** `pnpm --filter @sherhisab/web exec vitest run src/features/products/product-form-dialog.test.tsx` — new assertions fail on the current editor/actions.
- [ ] **Step 3: Implement the guided editor and small Add/Edit dialog.** Reuse Product form mutations, existing Unit API and query keys; keep ratios on the Product, not the shared Unit. Validate positive ratios and reject duplicate/base-unit alternatives in the API Product service as well as the UI; add API tests first in `apps/api/test/products/product-masters.test.ts` where behavior is not already covered. Add a route test in `apps/api/test/products/product-routes.test.ts` proving unauthenticated Unit edits remain rejected.
- [ ] **Step 4: Run Product Web and API targeted tests; require PASS. Commit.** Use `pnpm --filter @sherhisab/web exec vitest run src/features/products/product-form-dialog.test.tsx` and `DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab pnpm --filter @sherhisab/api exec vitest run test/products/product-masters.test.ts test/products/product-routes.test.ts`.

### Task 3: Quote and post using exact pricing-unit economics

**Files:**
- Modify: `apps/api/src/modules/sales/sales-pricing.service.ts`, `sales.service.ts`, `sales.types.ts`, `sales.repository.ts`, `sales.routes.ts`
- Modify: `apps/api/src/modules/pos/pos.service.ts`
- Test: `apps/api/test/sales/mature-checkout.test.ts`, `apps/api/test/sales/sales-pricing.test.ts`

**Interfaces:**
- Extend sale line input with optional authoritative `quantityInput`; `SalesService` normalizes it using its current transaction client and checks any supplied base quantity against the result.
- `SalesPricingService` allocates stock/cost in base units and applies the configured pricing factor to selling amounts; simple lines use factor 1. Persist `pricing_qty`, `display_components_snapshot`, and `conversion_snapshot` in the existing `sales_lines` columns.

- [ ] **Step 1: Write failing DB tests.** For `2 Gauge + 3 Gira`, assert stock deduction 35 Gira, pricing quantity 2.1875 Gauge, and total 65,625 paisa at 30,000 paisa/Gauge; verify per-lot amounts and Invoice snapshots. Assert a forged client `baseQty` or factor cannot change the sale, and an ordinary simple sale keeps current totals.
- [ ] **Step 2: Run RED.** `DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab pnpm --filter @sherhisab/api exec vitest run test/sales/mature-checkout.test.ts test/sales/sales-pricing.test.ts` — new assertions fail on current base-only sale path.
- [ ] **Step 3: Implement pricing and posting.** Normalize with the transaction client before stock/finance mutation, use exact decimal quantities and existing money-rounding rules, and write entered quantity/profile/fixed-unit snapshots with the Invoice line. Keep direct and Draft sale paths on the same transaction client.
- [ ] **Step 4: Run the same targeted tests; require PASS. Commit.**

### Task 4: Keep the POS cart compact and show base quantity

**Files:**
- Modify: `apps/web/src/features/pos/pos-types.ts`, `pos-page.tsx`, `components/conversion-editor.tsx`
- Test: `apps/web/src/features/pos/mature-pos.test.tsx`, `pos-page.test.tsx`

**Interfaces:**
- Simple cart quantity remains editable. Converted rows render read-only `baseQty` plus base-unit label in the compact row; the expanded row owns the entered fixed unit/quantity or mixed component fields.
- POS quote requests carry `QuantityInput`; Complete Sale carries the same input so the API can revalidate it.

- [ ] **Step 1: Write failing UI tests.** For `2 Gauge + 3 Gira`, collapse and assert `35` with Gira label, reopen and find `2` and `3`; ensure exact quote value is still used for total. For two cartons, assert expanded input `2 carton` and compact `48 pieces`. Confirm simple quantity editing is unchanged and quote failure leaves entered values repairable.
- [ ] **Step 2: Run RED.** `pnpm --filter @sherhisab/web exec vitest run src/features/pos/mature-pos.test.tsx src/features/pos/pos-page.test.tsx` — new assertions fail on current display/fixed-unit flow.
- [ ] **Step 3: Implement the row behavior.** Reuse inline expansion and server quote, add a compact fixed-unit selector/input inside the expanded row, and display normalized base quantity from the returned quote. Keep converted compact quantity read-only.
- [ ] **Step 4: Run the same targeted tests; require PASS. Commit.**

### Task 5: Preserve and revalidate converted Drafts and Invoice history

**Files:**
- Modify: `apps/api/src/modules/sales/sales-draft.types.ts`, `sales-draft.service.ts`, `sales.routes.ts`
- Modify: `apps/web/src/features/pos/pos-page.tsx`, `pos-types.ts`
- Test: `apps/api/test/sales/sales-drafts.test.ts`, `sales-routes.test.ts`; `apps/web/src/features/pos/drafts.test.tsx`

**Interfaces:**
- Draft quantity JSON stores `FIXED_UNIT` entered quantity and selected-unit snapshot; Invoice lines retain entered-unit name/factor and profile data. On Draft post, re-normalize under the posting transaction and require equality with saved base/pricing quantities. A changed active rule requires explicit cashier correction.

- [ ] **Step 1: Write failing API and Web tests.** Save/reopen a fixed-unit Draft; change its ratio and assert post conflict plus unchanged Draft, then adopt current rule and post. Repeat for mixed profile version change even when the entered larger-unit amount is zero and base quantity happens to remain equal. A shared Unit rename alone must not block posting. Rename a shared Unit after a sale and assert Invoice snapshots retain the old label and factor.
- [ ] **Step 2: Run RED.** `DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab pnpm --filter @sherhisab/api exec vitest run test/sales/sales-drafts.test.ts test/sales/sales-routes.test.ts`; `pnpm --filter @sherhisab/web exec vitest run src/features/pos/drafts.test.tsx` — new assertions fail.
- [ ] **Step 3: Implement Draft parsing, save/load, current-rule validation, and explicit adoption.** Compare active rule identity and factor as well as base/pricing quantity; a mere Unit rename does not change the rule. Keep historical snapshot visible until the cashier chooses the current rule. Pass authoritative quantity input into `SalesService` in the same posting transaction. Use existing JSONB columns; add a migration only if a concrete test proves the current schema cannot retain the required snapshot.
- [ ] **Step 4: Run targeted API and Web tests; require PASS. Commit.**

### Task 6: Verify the branch and request PR review

- [ ] Run all API tests with local PostgreSQL: `DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab pnpm --filter @sherhisab/api test`.
- [ ] Run `pnpm --filter @sherhisab/web test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`, and `git status --short --branch`.
- [ ] Inspect the full diff against `origin/main` for quantity authority, pricing, tenant/permission checks, Draft/Invoice snapshots, POS regressions, Task 9 scope, and `legacy/` changes.
- [ ] Push the feature branch, open a PR, and read GitHub CI results. Leave merge and deployment for separate authorization.
