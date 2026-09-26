# SherHisab Mature POS v1 Design

**Date:** 2026-09-24  
**Status:** Business implementation in progress; compact UI reset requested 2026-09-26; new visual baseline pending review.

**Source of truth:** `shuvodelux-commits/sherERP_Mohim` `main` at `955ed448fbe3f8d37bd89d474490b776ee2c42f2`  
**Approach:** Preserve mature SherERP business behavior, rebuild it as explicit SherHisab domains with PostgreSQL transactions, tenant isolation, audit history, and a cleaner compact UI.

## 1. Goal

SherHisab v1 POS is not a reduced “starter POS.” The first release must be mature enough for daily production use in hardware, fabric, furniture, medicine, electrical, battery, general retail, and similar Bangladesh businesses.

The legacy SherERP is the behavioral reference. Existing proven workflows are preserved unless this specification explicitly improves them.

Core principle:

> Preserve the workflow. Improve the architecture, safety, extensibility, and UI.

The release is not complete until Sales, Payments, Customer Due, Drafts, Reusable Templates, Invoice Edit, Returns, Batch Returns, Negative Stock, Vendor Sourcing, Unit Conversion, Serial/Warranty tracking, configurable Cash Session, audit, permissions, concurrency protection, and regression tests work together.

## 2. Approved Design Direction

The approved architecture is **behavioral parity with intentional upgrades**.

Do not copy the Apps Script file structure or one-file POS architecture. The browser remains familiar to the cashier, but business behavior lives in focused server/domain units.

Approved major improvements over legacy:

- PostgreSQL transaction rollback instead of “validate everything before first Sheet write” as the only defense.
- Explicit negative-stock shortfall records instead of fake negative physical lots.
- Automatic reconciliation of previous negative sales when later stock arrives.
- Multiple payment lines on one invoice.
- Flexible return refund method chosen by the cashier, independent of original payment channel.
- Reusable invoice templates separate from Drafts and Duplicate Invoice.
- Exact transaction-time unit/conversion snapshots.
- Custom conversion engine for compound quantities such as Pipe/Feet and Gaj/Gira.
- Serial, warranty, batch, and expiry-aware sales.
- Full invoice revision history.
- Atomic multi-invoice Batch Return.
- Idempotency keys for sale and return submission.
- Server-side Product search instead of loading only a small first page and filtering locally.

## 3. Workflow to Preserve; Presentation to Improve

The mature desktop POS retains the two-workspace counter flow from SherERP. Its old styling and the current SherHisab implementation are not accepted visual targets. The new interface must be a visibly polished, compact upgrade.

### Left: Add Product

Contains:

- search by Product name, barcode, brand, category, SKU, variant;
- Recent Drafts;
- Reusable Templates;
- Category filter;
- Brand filter;
- Product grid/cards;
- invoice number input for reprint;
- Find & Print.

Product card shows:

- Product name;
- variant when relevant;
- brand/category;
- automatic/current selling price;
- net available stock;
- display unit.

Zero-stock and negative-stock Products remain selectable because the cashier may use Vendor Sourcing or Negative Stock Sale.

### Right: Customer + Cart + Checkout

Contains:

- Customer name structured search;
- Phone structured search;
- Clear Customer;
- Outstanding Due / Customer Credit;
- collapsible Father/Guardian + Address section;
- Sales History button;
- Cart table;
- inline shortage panel;
- inline conversion input when required;
- inline serial/warranty/batch controls when required;
- Discount;
- multiple Payment Lines;
- totals;
- Save Draft;
- Complete Sale.

Use [AI_UI_DESIGN_RULES.md](../../../AI_UI_DESIGN_RULES.md) as the visual authority. Keep these capabilities available while improving grouping, alignment, density, and progressive disclosure. This inventory does not require every secondary action or optional editor to remain expanded.

### 3A. Compact UI Reset and Acceptance

**User direction, 2026-09-26:** the existing visual result is unsatisfactory. SherHisab must be the compact, polished successor to the Google Apps Script ERP. Completing Tasks 1–9 functionally does not establish visual acceptance.

Task 9A in the implementation plan now precedes Task 10. Its first deliverable is a representative, populated POS preview for visual review. After that baseline is accepted, apply its shared patterns to POS and the Products table/form before extending them to later modules.

Required improvements:

- One compact page heading/toolbar and useful working space; remove repeated headings, unnecessary wrappers, and permanently expanded optional controls.
- Readable 14px operational text, 34–36px desktop controls, and 36–40px ordinary table rows, with the responsive/content exceptions defined in the UI rules.
- Clear Product search, Customer selection, aligned Cart columns, grouped payments/totals, and one primary Complete Sale action.
- Compact Draft/Template entry points; management on demand. Keep Guardian/Address optional and required conversion/tracking/shortage work beside the affected line.
- Consistent shared primitives, Geist/SolaimanLipi typography, neutral surfaces, restrained blue, keyboard access, and all existing language/theme modes.

Acceptance follows the UI rulebook: comparable before/after screenshots, realistic ordinary and complex sales, desktop/tablet/mobile and zoom checks, and correction of visible defects. Never hide required information or shrink text to meet a viewport target. Record functional verification and the user's acceptance of the visual baseline separately.

Business rules in the remaining sections are unchanged by this presentation update.

## 4. POS Product Search

Search fields:

- Product Name;
- Barcode;
- SKU;
- Variant;
- Brand;
- Category;
- Unit.

Ranking:

1. exact barcode;
2. exact SKU;
3. exact Product name;
4. Product/variant prefix;
5. word-prefix matches;
6. substring matches;
7. small in-stock tie-break only.

Exact barcode scanning may immediately select the matching stock-bearing Variant.

Keyboard behavior:

- Arrow Down / Up moves result selection.
- Enter adds selected Product.
- Escape closes result panel.
- Clear resets query without resetting the cart.

Product search is tenant-scoped and server-backed. Results are paginated or bounded. The browser must not assume that “Products loaded into POS bootstrap” equals the complete Product catalog.

## 5. Stock-Bearing Identity

Every sale line targets a `product_variant`, including simple Products whose default variant is hidden from the ordinary user.

Inventory, pricing, serials, batches, shortages, purchase receipts, returns, and stock reconciliation all reference `variant_id`.

Do not create mixed “sometimes Product ID, sometimes Variant ID” stock logic.

## 6. FIFO / FEFO Automatic Pricing

Ordinary inventory uses FIFO by business receipt date and stable ID tie-break.

Batch/expiry Products may use FEFO when the Product policy is configured for expiry-first selling.

Automatic POS selling price is derived from the exact inventory allocations being consumed.

Example:

- Lot A: 2 units, selling price ৳100.
- Lot B: 5 units, selling price ৳110.
- Customer buys 4.

Automatic economics:

- 2 × ৳100 = ৳200.
- 2 × ৳110 = ৳220.
- exact line sales total = ৳420.
- visible effective unit price = ৳105.

The exact line total and allocation evidence are authoritative. Display rounding must not create paisa drift.

## 7. Manual Selling Price

Permission:

`SALES_OVERRIDE_SELLING_PRICE`

When authorized, the cashier may edit the line price.

Changing the visible price:

- changes the line to MANUAL pricing;
- affects only this invoice;
- never updates inventory-lot selling prices;
- keeps FIFO/FEFO COGS unchanged;
- shows a compact `Reset to Lot Price` action;
- shows a stronger warning when manual revenue is below allocated cost.

When permission is absent:

- UI renders price read-only;
- server rejects a manual override even if a modified client submits one.

When `Reset to Lot Price` is clicked, the server/current quote logic restores automatic price for the present quantity and inventory state.

## 8. Purchase Price Eye

Two gates must both pass:

- business setting `POS_SHOW_PURCHASE_PRICE = true`;
- user permission `POS_COST_VIEW`.

If either fails, the purchase-cost field is omitted from the POS response, not merely hidden with CSS.

Cart line example:

`4" SWR Pipe PPL 2.7  [eye]`

Clicking the eye reveals Product/Variant configured purchase price for **500 ms**, then returns to the eye icon.

This is a negotiation aid, not COGS authority. Historical COGS remains based on actual source allocations.

## 9. Shortage Detection

A cart line compares requested normalized base quantity against own available quantity after considering:

- current physical allocations;
- edit-mode quantity already owned by the invoice being edited;
- serial/batch availability;
- outstanding shortfall state where relevant.

Example:

- own stock = 5 pcs;
- requested = 10 pcs;
- shortfall = 5 pcs.

The cart expands directly below the line:

`Shortfall: 5 pcs — choose how to cover it:`

- `Own Stock (5)`
- `Vendor / Consignment`
- `Negative Stock Sale`

One shortfall uses one resolution. Do not silently split one shortage between Vendor and Negative Stock.

## 10. Own Stock Choice

If available quantity is positive:

- choosing Own Stock changes the cart quantity to exactly available own stock;
- recalculates automatic lot price if line is in automatic mode;
- clears Vendor sourcing data;
- closes the shortage panel.

If available quantity is zero or below:

- choosing Own Stock removes that Product line from the cart;
- show a compact “no own stock available” toast.

This preserves the current mature SherERP behavior.

## 11. Negative Stock Sale

Negative selling is intentional business behavior.

Example:

- own stock = 5;
- customer buys 10;
- cashier chooses Negative Stock Sale.

Sale allocation:

- 5 own-stock allocation;
- 5 negative-shortfall allocation.

Net stock becomes `-5`.

### 11.1 SherHisab improvement: no fake negative physical lot

Do not create an `OVERSOLD` inventory lot with negative remaining quantity.

Create explicit shortage evidence:

`inventory_shortfalls`

Fields include:

- id;
- tenant_id;
- sales_line_id;
- variant_id;
- original_shortfall_base_qty;
- outstanding_base_qty;
- provisional_unit_cost_paisa;
- created_at;
- reconciled_at nullable.

Sale-line stock source can therefore be:

- OWN_LOT;
- NEGATIVE_SHORTFALL;
- VENDOR.

### 11.2 Later purchase reconciliation

Suppose a previous sale has 5 units outstanding negative stock and a later Purchase receives 20.

The receipt remains a real Purchase lot of 20.

Inside the purchase stock transaction:

1. lock outstanding shortfalls for the Variant oldest-first;
2. allocate 5 received units to the previous shortage;
3. create `inventory_shortfall_reconciliations`;
4. reduce shortage outstanding quantity to zero;
5. leave 15 units as physically available inventory;
6. preserve the actual Purchase lot and cost provenance;
7. update profit/COGS projections when the final actual cost differs from provisional cost.

No historical customer invoice revenue is changed.

This model is the approved replacement for legacy `OVERSOLD` lots.

## 12. Vendor / Consignment Shortage Sourcing

When Vendor / Consignment is selected, reveal:

- Vendor selector;
- Sourcing Unit Cost;
- shortage quantity;
- calculated Vendor total;
- quick `+ New Vendor`.

Example:

- own quantity = 5;
- requested = 10;
- shortage = 5;
- Vendor cost = ৳80.

Accounting/stock result:

- consume 5 own units;
- source 5 from Vendor;
- own stock after sale = 0;
- customer invoice contains 10 sold units;
- Vendor-sourced 5 are not added to owned stock;
- Vendor payable/ledger obligation = 5 × ৳80 = ৳400.

Persist explicit sale-line Vendor allocation with:

- sales_line_id;
- vendor_id;
- quantity;
- unit cost;
- total cost;
- source transaction reference;
- settlement/return state.

Vendor sourcing must be reversible during Invoice Edit and source-aware during Sales Return.

## 13. Customer Snapshot vs Customer Account

Every invoice captures customer-facing snapshot fields:

- Name;
- Phone;
- normalized Phone;
- Father/Guardian Name;
- Address.

Name and Phone are required for every sale, preserving the mature SherERP behavior.

A snapshot does not automatically mean a Customer master/ledger account exists.

### 13.1 Fully paid new person

Example:

- Name = Karim;
- Phone = 017…;
- Grand Total = ৳5,000;
- Payments = ৳5,000;
- Due = 0.

Create:

- Invoice: YES.
- Customer master: NO, unless an existing Customer was explicitly selected.
- Customer receivable ledger: NO.
- invoice customer snapshot: YES.

This preserves phone-based Sales History and future Return lookup without filling Customer master with every one-time cash buyer.

### 13.2 Existing Customer selected

If an existing Customer is explicitly selected, store `customer_id` on the invoice even when fully paid.

No receivable is created unless an amount remains due.

### 13.3 Due or Partial sale

If `Due > 0`, a real Customer account is required.

Resolution order:

1. explicitly selected active Customer ID;
2. unique active normalized-phone match;
3. create Customer from invoice snapshot.

If more than one active Customer has the same normalized phone and no exact Customer ID is selected, reject and require exact selection.

Post receivable/customer ledger only for the due amount.

## 14. Customer Picker and Outstanding Due

Both Customer Name and Phone fields are structured selectors.

Search by:

- Customer ID;
- Name;
- Phone.

Selecting a Customer fills:

- exact Customer ID;
- canonical Name;
- canonical Phone;
- Father/Guardian;
- Address;
- Outstanding Due or Customer Credit.

Display:

- positive receivable: `Outstanding Due ৳970`;
- negative balance/advance: `Customer Credit ৳500`.

The amount comes from current ledger/account state, not stale invoice fields.

If the user manually changes identifying text after selecting a Customer, the UI must deliberately clear or re-resolve selected Customer identity; never silently post against a stale hidden ID.

## 15. Father / Guardian and Address

Keep these collapsed by default to preserve counter density.

Collapsed action:

`+ Father / Guardian / Address`

Expanded fields:

- Father / Guardian Name;
- Address.

Existing Customer selection pre-fills these values.

For a fully paid untracked buyer, values remain invoice snapshots without forcing Customer-account creation.

## 16. Sales History from POS

Sales History is enabled when:

- an existing Customer is selected; or
- a valid Phone is present.

Lookup includes:

- exact Customer ID matches;
- exact normalized Phone matches.

This intentionally includes older fully-paid invoices created before the person later became a Customer account.

History displays:

- Invoice Number;
- Date;
- Grand Total;
- current settlement status;
- Return status.

Actions:

- View;
- Print;
- Sales Return;
- Edit Invoice when allowed;
- Duplicate Invoice.

## 17. Discount

POS supports invoice-level discount.

Server validates:

- non-negative;
- cannot make Grand Total negative.

At sale creation, allocate invoice-level discount across sale lines deterministically and store line-level effective net sale amount.

This allocation becomes authoritative for later Return ceilings, so Returns do not need to reconstruct economics from header-level discount.

## 18. Multiple Payment Lines

An invoice may contain any number of payment lines.

Example:

Grand Total = ৳1,000

- Cash = ৳500;
- Bank / DBBL = ৳300;
- bKash / Shop bKash = ৳200.

Checkout UI:

```text
Payments

Cash                       [500]   [remove]
Bank [DBBL]                [300]   [remove]
bKash [Shop bKash]         [200]   [remove]

[ + Add Payment ]

Paid                      ৳1,000
Due                           ৳0
```

### 18.1 Payment line fields

Each line contains:

- method;
- account when required;
- amount;
- optional reference;
- optional note.

Methods in first mature release:

- CASH;
- BANK;
- MOBILE_BANKING;
- CUSTOMER_CREDIT where a valid Customer has available credit.

Bank requires exact Bank Account.

Mobile Banking requires exact wallet/account, for example bKash/Nagad account.

Cash has no Bank/Mobile account.

The same broad method may appear more than once when accounts differ, for example payment into two Bank accounts.

### 18.2 Settlement status is derived

Do not ask the user to select Cash / Partial / Due as a separate business status.

Derive:

- total effective payments = 0 → DUE;
- 0 < total effective payments < Grand Total → PARTIAL;
- total effective payments covers Grand Total → PAID.

### 18.3 Overpayment and change

Only Cash tender can produce physical Change.

Example:

- Invoice = ৳1,000;
- Cash tender = ৳600;
- Bank = ৳300;
- bKash = ৳200;
- total tendered = ৳1,100;
- change = ৳100;
- effective paid = ৳1,000.

Non-cash overpayment without sufficient Cash tender to absorb the excess is rejected. Do not silently create Customer Credit from accidental overpayment.

### 18.4 Payment storage

`sales_payments` is the source of payment truth.

Each row stores:

- tenant_id;
- sale_id;
- payment method;
- financial account ID nullable;
- tendered amount;
- effective applied amount;
- reference;
- note;
- cash_session_id nullable;
- created_by;
- created_at;
- reversal linkage when edited/refunded.

Header `paid_amount` and `due_amount` are derived/projection values, not independent truth.

Cash, Bank, Mobile Banking, and Customer Credit post their own accounting movements.

## 19. Cash Session

Cash Session requirement is configurable per business.

Setting:

`REQUIRE_POS_CASH_SESSION = true | false`

When false:

- POS sale/payment/return does not require an open drawer session.

When true:

- financial POS actions require an active session;
- Cash payments/refunds link to that session;
- session summary tracks opening cash, Cash In, Cash Out, expected cash, counted cash, difference, operator, notes, timestamps.

Cash Session requirement does not apply to pure master-data edits.

## 20. Draft Sale

Draft is an unfinished one-use transaction.

Draft stores:

- Customer ID when selected;
- customer snapshots;
- Cart lines;
- Product/Variant identity;
- quantity representation and conversion inputs;
- price mode and manual price;
- Vendor/Negative shortage decisions;
- serial selections;
- warranty data;
- batch selections;
- Discount;
- all Payment Lines;
- notes;
- version;
- owner;
- timestamps.

Draft causes no business mutation:

- no stock change;
- no sale;
- no cash/bank movement;
- no Customer Due;
- no Vendor payable.

Operations:

- Save Draft;
- Recent Drafts;
- Load;
- Update;
- Delete/Archive;
- Post.

Use optimistic concurrency.

If version 3 was loaded and another session updates to version 4, saving stale version 3 returns a conflict requiring reload.

Posting is idempotent. Repeating a successfully posted Draft request returns the already-created Invoice rather than creating another sale.

## 21. Reusable Invoice Templates

Reusable Templates are intentionally separate from Drafts.

Use case:

`Standard Bathroom Package`

- Product A qty 2;
- Product B qty 6;
- Product C qty 1.

Loading a Template:

1. creates a fresh cart instance;
2. resolves current Product/Variant status;
3. uses current stock state;
4. uses current automatic lot pricing by default;
5. does not preselect Customer;
6. does not load Payment Lines;
7. allows qty edits, removals, additions, Vendor/Negative decisions;
8. completing sale creates a new Invoice;
9. original Template remains unchanged.

Template line price strategy:

- `CURRENT_AUTO` default;
- `FIXED_MANUAL` only when deliberately configured and permission allows.

Template operations:

- Create from current cart;
- Create manually;
- Rename;
- Edit;
- Duplicate;
- Archive;
- Load.

Permissions:

- `SALES_TEMPLATE_VIEW`;
- `SALES_TEMPLATE_MANAGE`.

## 22. Duplicate Invoice

Duplicate Invoice is a one-time convenience, not a Template.

From Sales Invoice:

`Action → Duplicate`

Behavior:

- load original Product/Variant lines into a new POS cart;
- preserve original quantities as starting values;
- do not modify original invoice;
- do not carry Customer;
- do not carry Payment Lines;
- do not carry Draft identity;
- do not carry old Vendor sourcing decision;
- re-evaluate current stock, shortage, and current pricing context.

Three distinct concepts must remain separate:

- Draft = unfinished sale;
- Duplicate Invoice = one-time copy of a completed sale;
- Template = reusable saved cart definition.

## 23. Invoice Reprint

POS keeps a compact Invoice Number + Find & Print control.

Invoice lookup is tenant- and permission-scoped.

Sequential Invoice Number must never make cross-tenant or unauthorized enumeration possible.

Invoice output uses transaction-time snapshots and must not look up current Product Unit/Name to reconstruct historical content.

## 24. Invoice Edit

Sales Invoice action:

`Edit Invoice`

requires:

- Sales Edit permission;
- update reason;
- editable invoice state.

The same Invoice Number is preserved.

POS shows an obvious edit banner with Invoice Number and reason.

### 24.1 Atomic update algorithm

Inside one PostgreSQL transaction:

1. lock Invoice row;
2. check expected revision/version;
3. reject deleted/voided Invoice;
4. reject structural edit when dependent Sales Returns already exist;
5. load old sale lines, stock allocations, Vendor allocations, shortages, payments, Customer settlement;
6. validate complete new proposed state;
7. calculate inventory deltas;
8. calculate shortage/Vendor deltas;
9. calculate serial/batch changes;
10. calculate payment-account deltas;
11. calculate Customer receivable delta;
12. snapshot before/after revision;
13. apply all reversals/deltas;
14. increment revision;
15. commit.

If any step fails, rollback every effect.

### 24.2 Example: fully paid Invoice becomes Due

Original:

- total = ৳5,000;
- collected = ৳5,000;
- Customer ID = null.

Customer immediately adds Product worth ৳2,000.

Edited state:

- total = ৳7,000;
- collected remains ৳5,000;
- Due = ৳2,000.

SherHisab:

- resolve/create Customer from invoice snapshot;
- link invoice to that Customer;
- create/update receivable by ৳2,000;
- deduct stock only for the added delta;
- keep the same Invoice Number;
- retain original payment rows;
- add revision audit.

Do not create a second invoice.

## 25. Payment Editing During Invoice Edit

Original Payment Lines are loaded exactly.

Example:

- Cash ৳500;
- DBBL ৳300;
- bKash ৳200.

Invoice Edit may add/remove/change payment lines subject to validation.

Do not erase payment history and replace it with one new “paid total.”

Use auditable movement/reversal/delta records so Cash/Bank/Mobile ledgers remain explainable.

## 26. Invoice Revision Audit

`sales_invoice_revisions` records:

- tenant_id;
- sale_id;
- revision_no;
- reason;
- before_snapshot;
- after_snapshot;
- actor;
- created_at.

Historical snapshots must include enough information to explain Product quantities, payments, Customer identity, stock source, and totals before and after each edit.

## 27. Custom Conversion Engine

Every stock-bearing Variant has one normalized **base inventory unit**.

All Purchase, POS, Adjustment, Return, Draft, and Template quantities normalize into base quantity.

Money and quantity calculations must use exact integer/NUMERIC arithmetic rather than JavaScript floating-point assumptions.

### 27.1 Pipe example

Configuration:

- base unit = Feet;
- 1 Pipe = 20 Feet.

Buy 10 Pipe:

- normalized inventory increase = 200 Feet.

Sell 1 Pipe + 5 Feet:

- normalized deduction = 25 Feet.

Stock may display `8 Pipe 15 Feet` while internal quantity is 175 Feet.

### 27.2 Fabric example

Configuration:

- base unit = Gira;
- 1 Gaj = 16 Gira;
- sale price defined per Gaj.

POS cart expands:

- Gaj [2];
- Gira [5].

Normalized:

- 2 × 16 + 5 = 37 Gira.

Billable Gaj:

- 37 / 16 = 2.3125 Gaj.

At ৳320/Gaj:

- sales amount = ৳740.

Inventory deduction:

- 37 Gira.

### 27.3 Inline Expandable Conversion Cart Row

The fabric cart screenshot supplied during design review is the visual/interaction reference for compound quantity entry.

This is **not** a popup, modal, side panel, or separate measurement form. The conversion editor belongs directly inside the same cart line and expands downward beneath that Product.

#### Collapsed state

A compound-conversion Product uses the same compact cart-row structure as an ordinary Product:

- Product image when available;
- Product name;
- compact Product metadata such as Width, Color, Code/SKU or Variant;
- configured display/pricing Unit;
- calculated display Qty;
- editable Selling Price when permission allows;
- calculated line Total;
- remove action;
- a small expand/collapse chevron beside the Product name.

Example summary for fabric:

```text
Muslin Fabric Black  [⌄]
Width: 44" | Color: Black | Code: FAB-001

Unit      Qty      Price      Total
Gauge     2.31     300        ...
```

The collapsed row must remain dense enough for normal counter use. The cashier should not be forced to keep every conversion editor open.

#### Expanded state

Clicking the chevron expands a full-width detail area **immediately below that same cart row**.

Fabric example:

```text
Muslin Fabric Black  [⌃]        Gauge   2.31   300   Total

    Gauge                         Gira
    [ 2                         ] [ 5                         ]

                                      Total Amount     [calculated]
```

The expanded panel must visually belong to the Product row. It should use the same subtle border/background treatment as the cart, not look like a detached form.

For the approved fabric profile:

- field 1 = Gauge;
- field 2 = Gira;
- conversion = 1 Gauge = 16 Gira;
- entering Gauge/Gira updates the compact row immediately;
- the compact Qty is a calculated summary, not a second independent quantity source.

For example:

- Gauge = 2;
- Gira = 5;
- normalized quantity = 37 Gira;
- pricing quantity = 37 / 16 Gauge;
- the compact row may display a rounded human-friendly Qty such as `2.31`;
- financial calculation must still use the exact normalized/pricing quantity and configured money-rounding rules, not the rounded display text.

#### Authoritative input rule

For a compound/custom conversion profile, the expanded component fields are the authoritative cashier input.

The compact Qty field is derived from them.

Do not permit two conflicting quantity sources such as:

- compact Qty = 2.50;
- Gauge/Gira = 2 Gauge + 5 Gira.

If the UI visually renders the compact Qty in an input-shaped control to preserve cart alignment, it is read-only for compound profiles unless that profile explicitly implements a deterministic reverse conversion.

Simple products continue to use the ordinary editable Qty field.

#### Generic reuse

The same inline pattern must be reusable for every custom conversion profile.

Examples:

**Pipe**

```text
Unit summary: Pipe / Feet

Expanded:
Pipe [ 1 ]    Feet [ 5 ]
```

If 1 Pipe = 20 Feet:

- normalized base quantity = 25 Feet.

**Fabric**

```text
Expanded:
Gauge [ 2 ]   Gira [ 5 ]
```

If 1 Gauge = 16 Gira:

- normalized base quantity = 37 Gira.

**Carton / Piece**

```text
Expanded:
Carton [ 3 ]  Piece [ 4 ]
```

The Product conversion profile defines:

- labels;
- field order;
- exact conversion ratios;
- base inventory unit;
- pricing unit;
- allowed ranges;
- whether remainder values are bounded;
- display formatting.

Do not hard-code Gauge/Gira behavior inside the POS component.

#### Validation

Client-side validation gives immediate feedback, but the server recalculates the conversion independently.

Examples:

- Gira for a 16-Gira Gauge profile must normally satisfy `0 <= gira < 16`;
- Feet remainder for a 20-Foot Pipe profile must normally satisfy `0 <= feet < 20`;
- negative component quantities are rejected;
- a line whose normalized quantity is zero cannot be sold;
- Product-specific fractional rules are validated from the conversion profile.

If an operator enters a remainder equal to or above one whole parent unit, the UI may normalize it automatically when the profile allows it. Example: 1 Gauge + 18 Gira may normalize to 2 Gauge + 2 Gira. The server remains authoritative.

#### Interaction with price, shortage and stock

Conversion expansion changes quantity only.

After any component change SherHisab must immediately recompute:

1. normalized base quantity;
2. pricing quantity;
3. automatic FIFO/FEFO pricing when the line is in automatic price mode;
4. line Total;
5. available own stock;
6. any shortage amount;
7. Own Stock / Vendor / Negative Stock panel state.

Therefore a Fabric line can show both an expanded conversion editor and, if needed, a shortage-resolution panel beneath it.

The layout order is:

```text
Main cart row
↓
Conversion editor when expanded
↓
Serial/Batch/Warranty controls when required
↓
Shortage resolution when required
```

#### Draft, Template, Edit and Return preservation

The component values are part of transaction state, not temporary UI-only values.

Persist/snapshot them for:

- Draft save/load;
- Reusable Template line defaults;
- Duplicate Invoice starting values when compatible;
- Invoice Edit;
- Invoice print/view;
- Sales Return;
- Batch Return.

A returned Fabric line should therefore be able to show the original human quantity representation, not only an opaque decimal/base quantity.

Historical records preserve both:

- human-entered component snapshot;
- normalized base quantity used for inventory.

Changing the Product's conversion profile later must not reinterpret an old Invoice.

#### Responsive behavior

Desktop/tablet:

- expanded fields remain inline under the row;
- use a compact grid, normally two or three fields per row where space permits.

Mobile:

- the same cart line expands vertically;
- component fields may stack;
- do not move conversion entry into a separate modal solely because the viewport is small.

The interaction principle remains the same at every breakpoint:

> **Select Product → cart row stays compact → expand that row only when the Product needs compound quantity input.**

### 27.4 Conversion profiles

Support reusable profiles:

- SIMPLE;
- PACK;
- LENGTH;
- COMPOUND;
- CUSTOM_FIXED_RATIO.

Product configuration determines UI components.

Examples:

- Simple pcs → one Qty input.
- Pipe → Pipe + Feet inputs.
- Fabric → Gaj + Gira inputs.
- Carton → Carton + pcs if configured.

Avoid an arbitrary expression/formula engine in v1.

### 27.5 Data model

Extend `product_units` / dedicated conversion metadata with exact ratio fields.

Store exact conversion numerator/denominator or NUMERIC factor.

Transaction line stores:

- display quantity components snapshot;
- display unit snapshot;
- base quantity;
- pricing quantity;
- conversion snapshot/version.

Changing Product conversion configuration later cannot alter historical invoices.

## 28. Product Tracking Modes

First mature POS supports:

- SIMPLE;
- SERIAL;
- BATCH_EXPIRY.

Warranty is an independent Product/Variant policy that can be enabled with SIMPLE or SERIAL where applicable.

Examples:

- Hardware pipe → SIMPLE + conversion.
- Battery → SERIAL + Warranty.
- Medicine → BATCH_EXPIRY + FEFO.
- Fabric → SIMPLE + compound conversion.

This mature POS specification intentionally supersedes the earlier Product Master slice’s “serial tracking deferred” boundary.

## 29. Serial-Tracked Sale

If Qty = 2 for a Serial Product, exactly two sellable serials must be selected.

Cart expands under line:

- Serial 1 selector;
- Serial 2 selector.

Server transaction locks and validates each serial:

- belongs to current tenant;
- belongs to exact Variant;
- status = IN_STOCK;
- not already allocated/sold;
- source inventory is still valid.

After sale:

- serial status = SOLD;
- link sales_line_id;
- invoice linkage;
- sold_at.

Return requires exact sold serial selection.

Concurrent cashiers cannot sell the same serial.

## 30. Warranty

Product/Variant configuration may define:

- enabled;
- duration;
- duration unit;
- provider = SELLER or MANUFACTURER;
- default warranty text.

Sale line snapshots warranty at transaction time.

Invoice may show:

- Serial;
- Warranty duration;
- Warranty end date;
- Warranty text/provider.

Changing Product warranty configuration later never rewrites previous invoices.

Default first-release warranty start date is Sale Date.

## 31. Batch / Expiry / Medicine

BATCH_EXPIRY Products maintain batch identity and expiry.

When policy = FEFO:

- select earliest unexpired eligible batch first;
- expired stock cannot be sold through normal POS;
- returned batch/serial evidence must be source-aware.

Invoice snapshots batch code when relevant.

## 32. Product-Specific Capture Fields

Support Product-configured extra sale-line fields for non-inventory metadata.

Types:

- text;
- number;
- date;
- select.

Examples:

- Vehicle Number;
- Installation Site;
- Frame Number;
- Color Note;
- Measurement Note.

Values are immutable sale-line snapshots.

These fields must not be used to implement unit-conversion math. Conversion has its own typed engine.

## 33. Sale Submit Idempotency

Every Complete Sale submission includes a unique client operation UUID.

Unique constraint per tenant.

If the client retries after timeout with the same operation ID:

- return the already-created Invoice;
- do not create duplicate sale;
- do not duplicate stock deduction;
- do not duplicate payment movements;
- do not duplicate Customer Due or Vendor payable.

## 34. Sales Invoice Number

Invoice Number is a tenant-scoped human identifier such as:

`INV-000001`

Use a concurrency-safe tenant-scoped sequence/counter.

Database UUID remains the relational primary key.

Invoice Number uniqueness is enforced per tenant.

## 35. Single Sales Return

Return creates a separate document and never rewrites the original sale into a lower historical total.

Example:

- original paid invoice = ৳1,000;
- later return value = ৳300.

Result:

- original invoice gross remains ৳1,000;
- Return document = ৳300;
- effective Net Sale = ৳700.

Returnable quantity:

`Sold − previous valid returns = available return`

Server enforces this under lock/transaction.

## 36. Return Valuation

Default Return Price is source line’s effective post-discount unit value.

Operator may reduce Return Price where business policy allows.

Server rejects:

- negative Return Price;
- Return Price above remaining economic ceiling;
- quantity above remaining returnable quantity.

Because SherHisab stores line-level discount allocation, the Return ceiling uses stored sale-line net economics rather than reconstructing header discount later.

## 37. Flexible Refund Method

**Approved rule: refund method is chosen by the cashier and does not have to match the original payment channel.**

Examples:

- Original paid entirely by bKash → cashier may refund fully in Cash.
- Original paid Cash + Bank + bKash → cashier may refund entire approved Return amount in Cash.
- Original paid Cash → cashier may refund to Bank/Mobile Banking when business chooses.
- Cashier may choose Customer Credit instead of money refund.

Do not enforce original-payment-channel refund capacity.

The only hard financial ceiling is the remaining approved Return value after previous returns/refunds/credits.

### 37.1 Cash refund

Cash refund:

- posts Cash Out;
- links to active Cash Session when business requires one;
- is allowed even when original invoice received zero Cash.

Original payment provenance remains visible for audit but does not restrict refund choice.

If cash-session expected balance becomes low/negative, UI may warn, but original payment method must not block the Cash refund.

### 37.2 Bank/Mobile refund

Require selected active destination/source financial account as configured by the business.

Post exact refund movement with Return ID reference.

### 37.3 Customer Credit

If Invoice has no Customer ID:

1. use exact invoice snapshot Phone;
2. resolve unique active Customer if one exists;
3. otherwise create Customer from invoice Name/Phone/Address/Guardian;
4. link Return credit to Customer.

Customer Credit may make Customer balance negative/credit.

Fully paid historical invoices sharing the same normalized Phone can appear in Sales History without creating retroactive receivable entries.

## 38. Return Stock Restoration

Owned stock return restores source evidence from original sale allocations where possible.

Do not create an unrelated generic-cost lot.

For Negative Stock source:

- reduce/reverse outstanding shortage quantity;
- if shortage had already been reconciled by a later Purchase, preserve the reconciliation audit and restore inventory consistently.

For Vendor-sourced source:

- do not pretend the returned quantity was owned inventory;
- reverse or settle the Vendor-sourcing obligation according to source-aware Vendor return rules.

For Serial Product:

- exact sold serial must be returned;
- serial transitions to the appropriate return/in-stock state.

For Batch Product:

- restore source batch/expiry evidence when valid.

## 39. Customer-First Multi-Invoice Batch Return

Sales Return supports:

- Find Invoice;
- Find Customer.

Find Customer searches:

- Customer ID;
- Name;
- Phone.

Selecting exact Customer loads that Customer’s invoice history.

Operator may multi-select invoices then open them together.

Rules:

- 2–20 unique invoices;
- same exact Customer;
- maximum 100 selected return lines;
- Return date not before any source Invoice date;
- Backdate permission/reason applies when relevant.

## 40. Batch Return Numbering

Customer-facing batch document:

`BSRT-000001`

Each source invoice also gets its own child Return identity:

- `SRT-000101 → INV-000120`
- `SRT-000102 → INV-000116`
- `SRT-000103 → INV-000104`

`BSRT` is grouping/customer-facing identity.

Each child `SRT` remains the exact stock/accounting link to one source Invoice.

## 41. Atomic Batch Return

Unlike Google Sheets, PostgreSQL makes the entire batch atomic.

Inside one transaction:

1. lock selected Invoices;
2. lock relevant return/stock/serial evidence;
3. validate Customer identity;
4. validate all quantities;
5. validate Return Price ceilings;
6. validate return date;
7. validate refund method/account;
8. plan all stock restorations;
9. plan all Customer Credit/refund effects;
10. allocate BSRT + child SRT numbers;
11. write batch + child returns;
12. restore/reverse stock;
13. reverse COGS/profit evidence;
14. post refund/Credit entries;
15. commit.

Any failure rolls back the entire batch.

No partially completed child Return survives an ordinary application/database error.

## 42. Return Idempotency

Single Return and Batch Return both accept client operation UUID.

Retry with same operation ID returns existing Return/BSRT.

Never duplicate:

- Return documents;
- stock restoration;
- refund movement;
- Customer Credit;
- Vendor reversal.

## 43. Invoice Output

Complete Sale returns assembled invoice payload immediately.

Invoice snapshots:

- Invoice Number;
- Date/Time;
- Customer Name;
- Phone;
- Guardian;
- Address;
- Product name;
- Variant;
- display quantity components;
- base quantity where useful;
- Unit;
- Serial;
- Warranty;
- Batch;
- Unit Price;
- line discount/net amount;
- line total;
- subtotal;
- discount;
- Grand Total;
- individual Payment Lines;
- total paid;
- Due;
- terms.

Actions:

- Print;
- Save JPG;
- Share/WhatsApp when subscription/feature policy permits;
- Close.

Historical invoice rendering must never depend on today’s Product master values.

## 44. Core Data Model Extensions

This specification extends the current Sales foundation rather than discarding it.

Expected focused tables/domains include:

- `sales_invoices`
- `sales_lines`
- `sales_line_lot_allocations`
- `sales_line_vendor_allocations`
- `inventory_shortfalls`
- `inventory_shortfall_reconciliations`
- `sales_payments`
- `sales_drafts`
- `sales_draft_lines`
- `sales_draft_audit`
- `sales_templates`
- `sales_template_lines`
- `sales_invoice_revisions`
- `sales_returns`
- `sales_return_lines`
- `sales_return_batches`
- `sales_return_refunds`
- `customer_ledger_entries`
- `vendor_sourcing`
- `vendor_ledger_entries`
- `inventory_serials`
- `sales_line_serials`
- `warranty_snapshots`
- Product conversion tables/extensions
- Product capture-field definitions and transaction snapshots.

Do not turn the whole domain into one JSONB Invoice blob. JSON snapshots may be used for audit/revision payloads, but accounting/inventory relations remain relational and constrained.

## 45. Server-Authoritative Checkout

The browser is an editor, not accounting authority.

At Complete Sale, server verifies:

- tenant;
- authenticated user;
- permission;
- business configuration;
- Cash Session requirement;
- operation idempotency;
- Customer identity;
- Product/Variant active status;
- conversion definition;
- normalized quantity;
- serial/batch availability;
- current own inventory;
- FIFO/FEFO allocation;
- shortage resolution;
- Vendor validity/cost;
- automatic lot price;
- manual-price permission;
- Discount;
- Payment Lines;
- Bank/Mobile accounts;
- Customer Credit availability;
- Due;
- Backdate authorization;
- Draft source when posting.

Only then does one PostgreSQL transaction mutate data.

## 46. Concurrency

Use row/database locking, not application-memory global locks.

Required race protections include:

- two cashiers selling the last physical unit;
- two cashiers selecting the same serial;
- simultaneous Invoice Edit;
- simultaneous Return against same sale quantity;
- simultaneous negative-shortfall reconciliation during Purchase;
- Draft optimistic-version conflict;
- Invoice Number / BSRT / SRT allocation;
- duplicate submit.

Database constraints are the final uniqueness authority.

## 47. Permissions

At minimum mature POS recognizes:

- `POS_VIEW`
- `POS_SELL`
- `SALES_VIEW`
- `SALES_EDIT`
- `SALES_RETURN`
- `SALES_OVERRIDE_SELLING_PRICE`
- `POS_COST_VIEW`
- `SALES_TEMPLATE_VIEW`
- `SALES_TEMPLATE_MANAGE`
- Backdate permission consistent with project RBAC model.

Owner/Admin may receive broad defaults; Staff uses explicit grants.

Authorization is enforced in service/API paths, not only hidden buttons.

## 48. Suggested API Boundaries

Focused routes, subject to final implementation naming:

- `GET /api/private/pos/bootstrap`
- `GET /api/private/pos/products`
- `GET /api/private/pos/customers`
- `POST /api/private/pos/quote-line`
- `POST /api/private/sales`
- `GET /api/private/sales/:id`
- `PATCH /api/private/sales/:id`
- Draft CRUD routes
- Template CRUD/load routes
- Customer Sales History route
- single Return preparation/commit routes
- Batch Return Customer/invoice preparation routes
- Batch Return commit route.

Tenant identity always comes from authenticated request context.

## 49. Frontend Component Boundaries

Do not recreate the legacy 100k-character `pos.html` as one React component.

Conceptual decomposition:

- `PosPage`
  - `ProductCatalog`
    - ProductSearch
    - ProductFilters
    - ProductGrid
  - `CustomerPanel`
    - CustomerCombobox
    - CustomerBalance
    - CustomerExtraFields
    - SalesHistory
  - `Cart`
    - CartLine
      - PriceEditor
      - CostReveal
      - ConversionEditor
      - SerialWarrantyEditor
      - BatchEditor
      - ShortageResolution
  - `CheckoutSummary`
    - Discount
    - PaymentLines
    - AddPayment
    - Totals
  - RecentDrafts
  - TemplatePicker
  - InvoiceResult.

Business calculations live in server/domain utilities, not React rendering code.

## 50. First-Release Implementation Slices

These are implementation slices, not separate public releases.

The mature POS release is complete only after all required slices are integrated.

1. Quantity/conversion foundation.
2. Serial/warranty/batch tracking foundation.
3. Sales Invoice/customer snapshot/discount/multi-payment accounting model.
4. Stock-source engine: own FIFO/FEFO, Negative Shortfall, Purchase reconciliation, Vendor sourcing.
5. Main POS workspace.
6. Drafts.
7. Reusable Templates.
8. Invoice view/reprint/history/Duplicate/Edit + revision audit.
9. Single Sales Return.
10. Batch Return / BSRT.
11. Configurable Cash Session integration.
12. Production hardening, tenant/RBAC/concurrency/idempotency/performance/E2E.

## 51. Test Requirements

GitHub-first TDD is required.

### Pricing / Stock

Test:

- FIFO multi-lot automatic price;
- exact line-total rounding;
- manual price permission;
- Reset to Lot Price;
- below-cost warning data;
- Purchase cost omitted without permission;
- zero-stock Product can be added;
- Own Stock clamps partial shortage;
- Own Stock removes zero-stock line;
- Negative Stock creates exact shortfall;
- later Purchase automatically reconciles shortfall;
- Purchase reconciliation preserves real lot provenance;
- Vendor sourcing uses exactly shortage quantity;
- Vendor cost/payable posting;
- Invoice Edit reverses/recreates source correctly.

### Conversion

Test:

- simple quantity;
- Pipe ↔ Feet;
- Gaj + Gira;
- decimal exactness;
- Draft round-trip;
- Template load;
- Invoice snapshot;
- Invoice Edit;
- Sales Return;
- Purchase/Adjustment compatibility.

### Serial / Warranty / Batch

Test:

- exact serial count;
- duplicate serial rejection;
- concurrent serial sale;
- serial Return;
- warranty snapshot remains historical;
- FEFO allocation;
- expired batch rejection;
- batch Return restoration.

### Customer

Test:

- fully paid untracked buyer does not create Customer;
- invoice snapshots always stored;
- selected Customer paid sale preserves Customer ID;
- Due sale creates Customer;
- Partial sale creates/reuses Customer;
- duplicate Phone ambiguity fails closed;
- Customer Due display uses live balance;
- Sales History includes Phone-matched pre-account invoices;
- Customer Credit Return creates/reuses Customer from invoice snapshot.

### Multiple Payments

Test:

- Cash only;
- Bank only;
- Mobile Banking only;
- Cash + Bank + bKash on one Invoice;
- multiple Bank accounts;
- missing account rejection;
- zero-payment Due;
- partial multi-payment;
- Cash over-tender produces Change;
- non-cash overpayment without Cash capacity rejected;
- Customer Credit payment;
- Invoice Edit payment delta/reversal;
- retry does not duplicate payment rows.

### Draft / Template

Test:

- Draft create/load/update/delete;
- Draft version conflict;
- Draft posting idempotency;
- Draft preserves all Payment Lines;
- Template persists after sale;
- Template does not carry Customer/Payments by default;
- Template current-auto pricing refreshes on load;
- fixed template price only when explicitly configured;
- Duplicate Invoice never modifies original.

### Invoice Edit

Test:

- add Product;
- remove Product;
- increase/decrease qty;
- fully paid becomes Due and creates Customer;
- Due becomes paid;
- payment-line delta;
- negative-shortfall delta;
- Vendor-source delta;
- serial delta;
- revision audit;
- stale revision conflict;
- structural edit blocked after Return.

### Returns

Test:

- single partial Return;
- full Return;
- repeated Return quantity ceiling;
- effective post-discount Return price;
- lower operator Return price allowed;
- excessive Return price rejected;
- owned-lot restoration;
- Negative Shortfall reversal;
- reconciled-shortfall Return;
- Vendor-source Return;
- serial Return;
- Cash refund even when original payment was Bank/bKash;
- Bank refund after Cash sale;
- Mobile refund after other payment;
- Customer Credit;
- return-value ceiling independent of original channel;
- operation idempotency.

### Batch Return

Test:

- same-Customer requirement;
- 2–20 Invoice limits;
- maximum 100 lines;
- mixed-Customer rejection;
- source invoice quantity ceilings;
- flexible common refund method;
- BSRT + SRT linkage;
- all-or-nothing database rollback;
- shared stock restoration state;
- idempotent retry.

### Security / Concurrency

Test:

- tenant isolation;
- body cannot spoof tenant;
- permission isolation;
- two cashiers selling last stock;
- same serial race;
- simultaneous Return race;
- simultaneous Invoice Edit conflict;
- counter/number uniqueness;
- injected failure rolls back every sale/payment/stock/ledger write.

## 52. GitHub-First Delivery Gate

For each implementation slice:

1. create GitHub feature/fix branch from latest `main`;
2. write failing business/function tests on GitHub;
3. implement on the same GitHub branch;
4. GitHub Actions runs migrations, typecheck, lint, tests, production build;
5. review diff;
6. merge only when green;
7. pull merged `main` locally only when local verification/deployment is explicitly requested;
8. apply local migrations and full regression;
9. deploy same verified `main` commit to Cloudflare;
10. serve LAN from the same commit.

Desktop Commander is not used unless the user explicitly requests it.

## 53. Compatibility With Earlier SherHisab Specs

This mature POS spec intentionally extends or supersedes earlier slice boundaries where necessary.

- The Product Master spec deferred Serial tracking; mature POS v1 now requires it.
- The earlier Product/Inventory design allowed future negative/oversold behavior; this spec chooses explicit `inventory_shortfalls` instead of negative physical lots.
- The Lot Selling Price/FIFO Manual Override design remains authoritative for lot automatic price, manual override permission, COGS, and Reset to Lot Price.
- Current `006_sales_foundation.sql` remains a foundation and will be evolved through additive/controlled migrations rather than discarded.

## 54. Explicit Non-Goals

Do not broaden POS v1 into unrelated enterprise systems.

Out of scope unless required by an approved workflow above:

- multi-warehouse/location inventory;
- arbitrary user-written conversion formulas;
- promotions/coupon engine;
- loyalty points;
- BOM/manufacturing;
- ecommerce order-management automation;
- external payment-provider automatic settlement;
- generalized workflow engine.

## 55. Approved Decision Summary

Approved:

- mature production POS in first release;
- configurable Cash Session per business;
- preserve legacy Customer snapshot/account behavior;
- exact legacy Own Stock / Vendor / Negative shortage UX;
- explicit Negative Stock shortfall + later Purchase reconciliation;
- Vendor shortage sourcing;
- FIFO/FEFO and lot-specific automatic pricing;
- manual price override + Reset to Lot Price;
- purchase-cost eye reveal for 500 ms;
- Customer Due/Credit display;
- collapsible Guardian/Address;
- Phone/Customer Sales History;
- Drafts;
- Reusable Templates;
- Duplicate Invoice;
- native Invoice Edit with revision audit;
- Product-specific conversion engine;
- compound Pipe/Feet and Gaj/Gira input;
- Serial/Warranty/Batch/Expiry support;
- multiple Payment Lines per Invoice;
- Cash + Bank + bKash split payment;
- single and multi-invoice Returns;
- customer-first Batch Return with BSRT identity;
- **cashier may refund the full approved Return value in Cash or another allowed method regardless of how the original Invoice was paid**;
- PostgreSQL atomicity, idempotency, tenant isolation, permissions, concurrency tests.

## 56. Product Principle

> **DON'T COMPLICATE. MAKE IT EASY FOR ALL.**

The system may be sophisticated internally, but the cashier should see only the controls required for the current Product, Customer, shortage, and payment situation.
