# SherHisab Compact UI Review — Task 9A

**Date:** 2026-09-27  
**Branch:** `codex/compact-erp-ui`  
**Baseline commit:** `d13519a4f6263a150e4a009314cc41961fadd51a`  
**Status:** Preview in progress; visual acceptance pending.

## User work

The POS is a repeated counter workflow: find or scan a Product, edit quantity/price and any Product-specific details, select or enter the Customer, take one or more payments, then complete or save the sale. The screen must stay fast when the cart is long and when a line needs conversion, shortage, serial, warranty, batch, or other configured details.

## References

- User-provided visual reference: **SherHisab POS Sales Dashboard.png** (2026-09-26, 1600×900). It uses a dense cart-first workspace with 20+ populated rows and a right-side customer/payment/checkout rail.
- Legacy workflow: `legacy/google-apps-script-reference/2026-09-22/pos.html`.
- Visual authority: `AI_UI_DESIGN_RULES.md`.
- Business authority: `docs/superpowers/specs/2026-09-24-mature-pos-v1-design.md`.

The reference image is a composition target, not a license to invent unsupported business fields. SherHisab keeps its current server-backed Product search, header discount, exact conversion model, stock sourcing, Drafts/Templates, permissions, and multiple-payment behavior.

## Current baseline problems

- Product browsing permanently consumes a 280–380 px left workspace even when the cashier is already editing a long cart.
- Customer, Cart, payments, totals, Draft, and Complete Sale are stacked vertically inside one panel, so checkout pushes the cart and primary action down.
- Customer markup already has dedicated `pos-customer-*` classes, but the current stylesheet has no corresponding layout rules.
- Product result cards are 102 px tall and the POS uses 12–14 px page/panel gaps, which wastes useful counter space.
- The cart table is compact in isolation, but the surrounding composition prevents a dense populated cart from using the available desktop height.
- Optional/secondary tools visually compete with the main scan → cart → payment → complete flow.

## Preview direction

### Always visible

- Compact POS identity and Product search.
- Draft/Template entry points.
- Cart Product, Unit, Quantity, Price, Total, and line actions.
- Customer Name and Phone.
- Payment rows, Discount, totals, Save Draft, and primary Complete Sale.
- Any line-level conversion/shortage detail that the current workflow has opened or requires.

### On demand / secondary

- Product search results expand only while searching.
- Draft and Template lists stay behind their existing compact triggers.
- Guardian/Address remain available through the existing customer-details disclosure.
- Lot-price detail remains behind the existing eye action.

## Layout target

For wide desktop, Product/search tools become a compact top strip. The cart becomes the main work surface and the Customer + payment + totals + actions become a 320–350 px right rail. The cart table owns the main scroll region. Ordinary rows target about 34–36 px so a 1600×900 populated preview can approach the density of the 20+ row reference without shrinking working text below 14 px.

At tablet/mobile widths the cart and checkout rail reflow into one column. No required control may be clipped or hidden merely to satisfy a row-count target.

## Acceptance evidence

Visual acceptance is **not recorded yet**. The first branch preview must be reviewed with representative populated data before the pattern is rolled out to Products and later Task 10+ screens.

Required final evidence remains:
- 1366×768 and 1280×720 ordinary sale;
- complex sale with conversion/shortage/tracking and multiple payments;
- 1024×768 tablet;
- 390×844 mobile;
- 200% desktop zoom;
- language/theme/focus/error/loading checks;
- comparable before/after captures using representative data.

Functional verification and visual acceptance will be recorded separately.
