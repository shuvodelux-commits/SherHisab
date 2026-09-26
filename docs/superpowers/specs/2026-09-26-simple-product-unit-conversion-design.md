# Simple Product Unit Conversion Design

**Date:** 2026-09-26
**Status:** Approved for implementation planning
**Base:** SherHisab Mature POS v1 design and merged Task 8
**Order:** Complete this conversion improvement before Task 9 templates.

## Goal

A shop owner can define product units using familiar statements such as **1 Gauge = 16 Gira**, **1 carton = 24 pieces**, and **1 bag = 50 pieces**. Cashiers can enter mixed quantities where needed while the cart stays compact. SherHisab remains authoritative about stock quantity, pricing quantity, and historical sale meaning.

The current Product form exposes profile types, keys, numerators, denominators, remainder limits, and display precision. These settings are too technical for normal setup. The current POS already expands mixed quantity fields, but its collapsed quantity shows the pricing quantity beside the base unit label. For **2 Gauge + 3 Gira**, it should show **35 Gira**.

## Product setup

The Product's existing base unit is the inventory unit. Advanced → Quantity Conversion presents two straightforward choices:

1. **Single unit or package:** Add any number of fixed alternatives. Each row reads `1 [alternative unit] = [positive quantity] [base unit]`. A piece-based Product may have both `1 carton = 24 pieces` and `1 bag = 50 pieces`.
2. **Mixed units:** Choose a larger unit and a smaller base unit, then enter `1 [larger unit] = [positive whole number] [smaller unit]`. The common cashier form has those two named fields. For Gauge/Gira, Gira is the base inventory unit and Gauge can be the pricing unit.

Unit selectors in this Advanced section have **Add Unit** and **Edit Unit** actions. Add creates a reusable tenant Unit and selects it without closing the Product form. Edit changes the selected shared Unit's name or symbol across products; the dialog says this clearly before saving. Editing a Unit does not change any product-specific conversion ratio. These actions use the existing authenticated Unit routes and tenant rules.

The ordinary setup does not expose component keys, fraction numerators/denominators, sort order, or remainder settings. Existing profiles that need those settings remain editable in an explicit **Advanced conversion settings** section. No existing product is silently converted or rewritten.

## POS behavior

Simple products keep an editable quantity in the compact cart row.

For a fixed alternative, the cashier expands the row to choose a configured unit and enter its quantity. The compact row shows the resulting **base inventory quantity and base unit**. For example, `2 cartons` collapses to `48 pieces`. The expanded row retains `2 cartons` so reopening it shows what the cashier entered.

For mixed units, the cashier expands the row to enter the two fields, such as Gauge and Gira. On every valid change, the server normalizes the quantity and requotes stock, price, and total. Collapsing the row shows the exact base amount and unit: `2 Gauge + 3 Gira` becomes `35 Gira`. The compact quantity is read-only for converted lines, so it cannot disagree with the expanded inputs.

Pricing uses the configured pricing unit and exact server calculation. With `1 Gauge = 16 Gira`, `35 Gira` is **2.1875 Gauge** for pricing. A rounded display value must never become the sale quantity or price input.

## Data and compatibility

One server-side normalization path validates selected units and ratios for the current tenant and Product, then returns base quantity, pricing quantity, display summary, and a conversion snapshot. Product form and POS may simplify the input, but they must not calculate authoritative sale quantities on the client.

The existing versioned conversion profiles and fixed product-unit relationships should be reused where they fit. The implementation plan must choose one authoritative representation for each configured rule and avoid two editable copies of the same ratio. Additive schema changes are allowed only if needed to preserve selected fixed-unit identity and ratio in Draft and Invoice snapshots.

Saved Drafts retain the entered unit values and historical snapshot. On reopen, the editor shows those values and checks the current active conversion before saving or posting. If a rule changed, it warns and requires an explicit correction; it does not silently reinterpret the Draft. Posted Invoices retain the original entered units, base quantity, pricing quantity, and ratio even if the Product or shared Unit is renamed later.

Invalid, zero, negative, duplicate, inactive, cross-tenant, or incompatible units and ratios are rejected by the API. A mixed smaller-unit remainder must be below one larger unit unless the Product explicitly enables automatic normalization in advanced settings.

## Verification examples

- Configure Gira as base, Gauge as pricing unit, and `1 Gauge = 16 Gira`; enter `2 Gauge + 3 Gira`; confirm the collapsed cart shows `35 Gira`, stock consumes 35 Gira, and pricing uses 2.1875 Gauge.
- Configure pieces as base with carton 24 and bag 50; quote two cartons and one bag in turn; confirm base quantities 48 and 50 pieces.
- Add a new Unit within Advanced conversion setup and use it immediately. Edit its name there and confirm every Product using the shared Unit displays the new name while ratios remain unchanged.
- Save and reopen converted Drafts; confirm original entered values survive, current-rule incompatibility is explicit, and stale quantities cannot post.
- Change a Product's ratio or a shared Unit name after posting; confirm the Invoice's historical quantity and ratio remain as sold.
- Verify existing simple and complex profiles, tenant isolation, permissions, exact decimal math, POS quote, Draft, and sale tests.

## Scope

This is a focused conversion setup and POS quantity improvement. It does not start Task 9 templates, invoice edit, returns, or deployment. It does not modify `legacy/`.
