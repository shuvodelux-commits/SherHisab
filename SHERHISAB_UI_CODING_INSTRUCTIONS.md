# SherHisab UI Coding Instructions

> Professional multi-tenant ERP SaaS for Bangladesh  
> Product principle: **DON'T COMPLICATE. MAKE IT EASY FOR ALL.**

## 1. Purpose

This file is the implementation authority for SherHisab UI work.

Use it whenever creating or modifying:

- application shell
- sidebar/navigation
- page headers
- tables
- forms
- dialogs/drawers
- POS
- products/inventory
- purchases
- sales
- customers/suppliers
- ledgers
- reports
- settings
- dashboards
- empty/loading/error states
- light/dark themes
- bilingual UI

SherHisab is a professional evolution of the existing Google Apps Script ERP.  
Preserve familiar workflows where they are proven, but make the new SaaS cleaner, tighter, more consistent, and more scalable.

---

# 2. Required Design References

Before implementing UI, read these files when available:

```text
DESIGN.md
Tailark_DESIGN.md
```

Reference roles:

### Primary reference: `Tailark_DESIGN.md`

Use Tailark as the primary source for:

- compact typography
- 4px spacing rhythm
- 6px controls
- hairline borders
- white / near-white surfaces
- restrained visual hierarchy
- shadcn-like component treatment
- dense professional UI
- low-noise layout
- precise table/filter/form styling

### Secondary reference: `DESIGN.md`

Use Dub selectively for:

- blue accent discipline
- border-first surfaces
- minimal shadows
- soft active navigation state
- restrained semantic color
- flat professional SaaS appearance

Do **not** copy either reference literally.

SherHisab must remain its own ERP product.

---

# 3. Technology Constraints

Frontend stack:

- React
- TypeScript
- Vite
- shadcn/ui
- TanStack Router
- TanStack Query
- TanStack Table

Prefer existing shadcn/ui primitives before building custom controls.

Use TanStack Table for data-heavy grids.

Do not create one-off component styling when a shared primitive can handle the same role.

---

# 4. Core Visual Direction

SherHisab must feel:

- minimal
- sharp
- dense
- business-focused
- consistent
- professional
- fast
- calm
- low-noise
- readable for ordinary shop owners

Avoid:

- flashy SaaS dashboard design
- colorful card walls
- gradient-heavy UI
- huge headings
- oversized controls
- glassmorphism
- excessive shadows
- large empty areas
- decorative illustrations inside operational screens
- generic AI-generated admin-dashboard appearance
- random border radii
- random spacing values
- inconsistent component variants

The product should feel like:

> precise business software with strong typography, compact tables, restrained blue accents, subtle Bangla assistance, and minimal visual noise.

---

# 5. Typography

## Primary Font

Use **Inter** for all English UI.

```css
font-family: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Do not use Satoshi in the ERP application.

## Bangla Font

Use **Noto Sans Bengali** for Bangla text.

```css
font-family: "Noto Sans Bengali", "Nirmala UI", sans-serif;
```

## Monospace Font

Use Geist Mono or JetBrains Mono only where a technical identifier benefits from monospace:

- invoice number
- purchase number
- lot ID
- SKU
- reference number
- transaction ID
- system code

Do not use monospace for normal money values or body text.

## Recommended Type Scale

```text
Page title                    18px / 600
Section title                 14–16px / 600
Tabs                          13px / 500
Body                          13–14px / 400
Form label                    12–13px / 500
Bangla helper                 10–11px / 400
Table header                  11px / 600
Table body                    13px / 400–500
Button                        13px / 500
Badge                         11–12px / 500
Large dashboard metric        22–26px / 600
Technical ID                  12px / 500 mono
```

Avoid unnecessary `700` weight.

Use `600` only when the interface needs strong emphasis.

For financial values:

```css
font-variant-numeric: tabular-nums;
```

---

# 6. Language Modes

SherHisab must support three UI language modes.

## Mode A — Default

**English + Bangla Helper**

Example:

```text
Purchase Price
কেনা দাম
```

English is primary.

Bangla helper text is:

- smaller
- muted
- secondary
- plain everyday Bangla
- not decorative

## Mode B — Full English

Show English UI text only.

## Mode C — Full Bangla

Show Bangla UI text as the primary label.

Do not store three copies of user-entered business data.

Translation applies to application UI:

- navigation
- labels
- validation messages
- system statuses
- actions
- generated descriptions
- empty states
- confirmations

User data such as product names, customer names, supplier names, addresses, and notes remain exactly as entered.

---

# 7. Color System

SherHisab should be mostly neutral.

Approximate visual balance:

```text
90% neutral
8% SherHisab blue
2% semantic color
```

## Light Theme

Recommended roles:

```text
Page background      neutral-50 / near-white
Surface              white
Border               neutral-200 / zinc-200
Primary text         neutral-950
Secondary text       neutral-600
Muted text           neutral-500
Primary accent       blue-600
Primary hover        blue-700
Active nav bg        blue-50
Focus ring           blue-500
```

## Semantic Colors

Use semantic colors only when meaning requires them.

```text
Success / Active / Paid        green
Warning / Partial / Low Stock  amber/orange
Danger / Due / Error           red
Info / selected / action       blue
```

Never use semantic colors as decorative page backgrounds.

---

# 8. Dark Theme

Dark theme must use the same component hierarchy and density as light mode.

Do not create a separate visual design.

Use token-driven theme values.

Dark theme should preserve:

- hairline separation
- strong text contrast
- restrained blue accent
- subtle status colors
- compact tables
- flat surfaces

Avoid:

- glowing blue borders
- neon effects
- heavy gradients
- overly black `#000` surfaces everywhere

---

# 9. Spacing System

Use a **4px base grid**.

Preferred spacing values:

```text
4px
8px
12px
16px
20px
24px
32px
```

Avoid arbitrary values such as:

```text
7px
13px
19px
27px
```

unless required by a specific browser/control alignment issue.

Typical usage:

```text
icon gap            8px
field gap           8–12px
toolbar gap         8px
card padding        12–16px
page padding        16–20px
section gap         16–24px
table cell x pad    10–12px
```

SherHisab should be compact, not cramped.

---

# 10. Radius System

Use a small controlled radius vocabulary.

```text
Inputs               6px
Buttons              6px
Tabs/segmented        6px
Cards/panels          8px
Large panels/modals  10–12px
Badges                full/pill when semantically appropriate
```

Do not make ordinary ERP cards 16–24px rounded.

Do not turn every control into a pill.

---

# 11. Border and Elevation Rules

Use borders as the primary separation mechanism.

Default:

```css
border: 1px solid var(--border);
```

Cards and tables should usually use:

- 1px border
- no shadow

Use shadows only for floating layers:

- dropdown
- popover
- command menu
- modal
- drawer
- context menu
- tooltip

Even there, shadows must remain soft and restrained.

Do not use heavy card shadows.

---

# 12. Application Shell

Preserve the SherERP navigation model.

## Normal Desktop State

Use a compact collapsed icon rail.

Recommended:

```text
Collapsed width: 60–64px
```

## Expanded Sidebar

On user action, expand to:

```text
250–260px
```

Expanded sidebar contains:

- business logo/initial
- business name
- English navigation name
- Bangla helper text in default bilingual mode
- grouped navigation
- settings near bottom
- sign-out / user action near bottom

### Navigation Typography

```text
English nav        13px / 500
Bangla helper      10px / 400
Icon               18px
```

### Active State

Use:

- pale blue background
- blue icon
- stronger primary text
- no thick left border
- no gradient

Desktop expansion should not feel like a mobile modal.

Use:

- no backdrop, or
- very faint backdrop only if necessary

Mobile/tablet drawer may use a stronger scrim.

---

# 13. Topbar

Recommended desktop topbar:

```text
Height: 52px
```

Contains only useful global controls.

Typical content:

- sidebar toggle
- page title / breadcrumb
- optional Bangla helper
- current date
- calculator
- theme/language/user controls
- refresh only where useful

Avoid crowding the topbar with page-specific actions.

Page-specific actions belong inside the page toolbar.

---

# 14. Page Layout

SherHisab should use the available viewport width.

Do not use Tailark's marketing-style fixed `1280px` max-width for ERP pages.

Preferred:

```css
width: 100%;
max-width: none;
```

Use page padding around:

```text
16–20px desktop
12–16px tablet
12px mobile
```

Wide tables should use the available space.

---

# 15. Page Headers

Use compact headers.

Preferred pattern:

```text
Products
পণ্য ও স্টক

[filters/search................................]   [+ Add Product]
```

Do not add a large decorative page banner.

If KPIs are operationally useful, use a **thin compact summary strip**, not large colorful cards.

Example:

```text
128 Products    ৳348,920 Stock Value    6 Low Stock
```

Keep summary blocks flat and neutral.

---

# 16. Tabs

Tabs must be consistent across:

- Sales
- Purchases
- Customers
- Suppliers
- Bank
- Expenses
- Finance
- Reports
- Settings

Recommended:

```text
height                38–40px
label                  13px / 500
Bangla helper          9–10px / 400
active text            blue
active indicator       1–2px blue underline
inactive text          muted neutral
```

Do not use large filled tabs unless the interaction is truly a segmented control.

---

# 17. Buttons

shadcn Button is the default primitive.

Recommended desktop heights:

```text
Small       28–30px
Normal      32–34px
Large       36–38px
```

Primary button:

- SherHisab blue
- white text
- one dominant primary action per surface

Secondary:

- white/neutral surface
- hairline border

Ghost:

- icon/text utilities
- toolbar controls

Destructive:

- red only for destructive actions

Avoid making every action blue.

---

# 18. Inputs, Selects, Comboboxes

Recommended desktop height:

```text
34–36px
```

Use shadcn primitives where possible.

Inputs should have:

- 1px border
- 6px radius
- subtle blue focus ring
- 13px text

Use searchable comboboxes for:

- products
- customers
- suppliers
- vendors
- categories with many values
- bank accounts
- finance persons

Avoid huge select controls.

---


# 18A. Official shadcn Component Standard

For application controls and common UI patterns, the official shadcn/ui component or block is the implementation starting point.

Priority:

```text
official shadcn component/block
        ↓
official shadcn semantic theme tokens
        ↓
SherHisab business formatting and bilingual behavior
        ↓
Tailark compact density/typography refinement
```

Do not recreate a shadcn control from a screenshot or hand-style native browser controls to imitate one.

Use the official shadcn pattern for:

- Button
- Input / Input Group / Search
- Select
- Combobox
- Dropdown Menu
- Table / Data Table
- Dialog / Alert Dialog / Sheet / Popover
- Calendar / Date Picker
- Checkbox / Radio Group / Switch
- Tabs / Pagination
- Tooltip
- Chart and chart tooltip
- Sidebar

Project block choices:

- application shell/sidebar: start from official `sidebar-07`;
- login screen: start from official `login-04` and preserve SherHisab session validation/authentication behavior;
- operational tables: shadcn Table + TanStack Table;
- charts: official shadcn Chart components and `ChartTooltip` / `ChartTooltipContent` patterns.

Theming must use shadcn semantic CSS variables such as `background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, `ring`, `popover`, `destructive`, chart tokens, and sidebar tokens.

Do not hard-code a separate color/radius system inside individual controls.

For normal desktop page-toolbar controls, target one consistent compact height (normally 34–36px) and use shared Button/Input/Combobox/Select sizing rather than per-page heights.

# 18B. Date Picker Selection Rules

Use the official shadcn Date Picker pattern that matches the business task. A shadcn Date Picker is composed from `Popover` + `Calendar`; do not build a separate custom calendar control.

Choose by situation:

| Business situation | Official pattern | SherHisab examples |
| --- | --- | --- |
| One business date | Basic single-date picker | Purchase date, invoice date, expense date, stock adjustment date |
| Start/end period | Range Picker | Sales report, purchase report, ledger filter, dashboard period |
| Birth date / long historical date | Date of Birth pattern with month/year navigation | Customer/person date of birth when required |
| Fast keyboard entry plus calendar assistance | Input Date Picker | Back-office historical entry, due date, document date where direct typing improves speed |
| Date plus exact user-selected time | Time Picker | Scheduled delivery, appointment, reminder, future task |
| Month/year reporting period only | Month/year-specific selection | Monthly closing, VAT/reporting period; do not force the user to choose an arbitrary day |
| Natural-language date | Natural Language Picker only for low-risk convenience workflows | Reminder or scheduling text such as “next Monday”; never use for financial posting dates |

Rules:

- Do not use the same date picker variant everywhere.
- Do not use natural-language parsing for accounting, stock, payment, invoice, purchase, return, or other posting dates.
- Server-generated audit timestamps are not editable date-picker fields.
- Constrain dates when business rules require it.
- Use the same SherHisab date display format after selection across forms, filters, tables, and tooltips.
- Range filters must clearly expose both start and end dates and provide an obvious clear/reset action.
- Preserve keyboard navigation, focus states, labels, and mobile usability from the official shadcn pattern.


# 19. Forms

Use predictable grids.

Desktop:

```text
2-column by default
1-column for long text or narrow forms
```

Example:

```text
Product Name
পণ্যের নাম
[................................]

Brand                    Category
ব্র্যান্ড                 ধরন
[.................]       [.................]

Purchase Price           Selling Price
কেনা দাম                 বিক্রির দাম
[.................]       [.................]
```

Rules:

- align labels
- align input heights
- keep form widths consistent
- avoid random inline widths
- helper text must not shift layout unpredictably
- place validation under the relevant field
- reserve destructive actions for modal footer or explicit danger zone

---

# 20. Dialogs and Drawers

Use shadcn Dialog / Sheet.

Dialogs should have:

```text
radius            10–12px
header            compact
body padding      16–20px
footer            12–16px
```

Do not use giant modals for simple CRUD.

Use larger dialogs only for:

- stock lots
- transaction detail
- multi-line editing
- reports
- complex configuration

For quick create/edit flows, keep modal width focused.

---

# 21. TanStack Table Rules

TanStack Table is the standard data-grid foundation.

Tables are a core visual identity of SherHisab.

## Density

Recommended:

```text
Header height       34px
Normal row          38–40px
Dense row           34–36px
```

## Typography

```text
Header              11px / 600
Body                13px / 400–500
Meta/helper         10px / 400
```

## Alignment

Left align:

- names
- parties
- descriptions
- statuses
- categories

Right align:

- money
- quantities
- balances
- percentages

Center only when semantically appropriate.

## Borders

Use:

- bottom hairline row separators
- optional outer border
- minimal or no vertical grid lines

## Sorting

Sorting controls should feel like table labels, not large buttons.

## Sticky Regions

Use sticky headers when useful on long tables.

Sticky action/identity columns may be used where data width requires it.

## Horizontal Scroll

Wide ERP tables must remain usable without requiring the user to scroll to the bottom of a long page first.

Provide a reliable horizontal-scroll experience where needed.

---

# 22. Table Toolbars

Use a standard toolbar pattern.

Order:

```text
Search
Primary filter
Secondary filter
Date range / status filters
Spacer
Utility action
Primary action
```

Example:

```text
[Search products...] [Category ▾] [Brand ▾]       [Unpriced Lots] [+ Add Product]
```

Avoid scattered filter controls.

Keep all toolbar controls around the same height.

---

# 23. Pagination

Use consistent pagination across all lists.

Preferred:

```text
Showing 1–50 of 1,248
Rows per page [50 ▾]   Previous   1 2 3 ... 25   Next
```

For large datasets, use server-side pagination.

Do not load thousands of rows into the browser only to paginate client-side.

---

# 24. Status Badges

Status badges must be compact.

Examples:

```text
Active
Inactive
Paid
Due
Partial
Low
Oversold
Depleted
Draft
Returned
```

Use:

- small text
- subtle tinted background
- pill radius
- no heavy borders
- optional tiny dot only when it improves scanning

Avoid large chips.

---

# 25. Action Menus

Rows should not contain many individual action buttons.

Use one compact action menu:

```text
Actions ▾
```

Possible entries:

```text
View
Edit
Adjust Stock
View Lots
Deactivate
────────────
Delete
```

Danger actions must be visually separated.

Prefer menus for secondary actions.

Keep frequent primary row actions directly visible only when speed justifies it.

---

# 26. POS Rules

POS may be denser than other pages.

Preserve the proven two-pane workflow:

```text
Product search/results     | Customer
                           | Cart
                           | Totals
                           | Payment
                           | Complete Sale
```

Priorities:

1. speed
2. keyboard use
3. product search
4. customer lookup
5. cart editing
6. payment
7. completion

Product cards must be compact.

Do not rely on large product images.

Images are optional and should not consume valuable space unless meaningful for that business.

Support:

- keyboard shortcuts
- barcode scanning
- fast customer search
- quick-add customer
- editable quantity
- editable unit
- editable sale price when permitted
- clear stock status
- due visibility
- negative stock handling when allowed

---

# 27. Products Screen

Products screen should prioritize table usability.

Recommended structure:

```text
Products
পণ্য ও স্টক

compact optional KPI strip

[Smart Search] [Category] [Brand] [Status]        [Unpriced Lots] [+ Add Product]

TABLE
```

Table should support:

- sort
- filter
- pagination
- responsive columns
- compact actions
- low-stock badge
- active/inactive status
- units
- variants where enabled
- stock quantity
- stock value

Avoid oversized product cards on the main Products page.

---

# 28. Customers and Suppliers

Keep list pages simple:

```text
Search                              + Add Customer
--------------------------------------------------
Customer | Phone | Address | Current Due | Status | Actions
```

Names may be clickable to open ledger/profile.

Due amounts should use semantic emphasis only when non-zero.

Do not visually overload zero balances.

---

# 29. Ledger Screens

Ledger screens should emphasize:

- party identity
- current due / credit
- primary payment action
- filters
- chronological transaction table
- running balance

Use one compact party summary panel.

Avoid huge profile cards.

Transaction table is the main content.

---

# 30. Purchase Screen

Purchase entry should remain fast and business-oriented.

Recommended structure:

```text
tabs

Supplier                      Purchase Date

Add Product
Category | Brand | Search

Product table
Product | Unit | Qty | Purchase Price | Sale Price | Total | Action

Notes                         Summary
Payment Method                Subtotal
                              Discount
                              Grand Total
                              Paid Now
                              Due to Supplier

                              Complete Purchase
```

Do not scatter totals around the screen.

Keep one clear purchase summary area.

---

# 31. Dashboard

Dashboard should be useful, not decorative.

Prefer:

- Today Sales
- Today Collection
- Today Expense
- Today Purchase
- Customer Due
- Supplier Payable
- Cash Balance
- Low Stock

Possible secondary blocks:

- recent transactions
- quick actions
- small business overview

Do not use colorful icon cards for every metric.

Use mostly neutral cards.

Semantic color only when needed.

---

# 32. Dashboard Metrics

Metric cards should use:

```text
small label
large value
optional tiny context
```

Example:

```text
CUSTOMER DUE
কাস্টমারের বাকি

৳383,403
```

Use icons sparingly.

The number is the hero.

---

# 33. Responsive Behavior

## Desktop

- collapsed rail by default
- optional expanded sidebar
- full tables
- compact controls

## Tablet

- collapsible drawer/sidebar
- preserve tables where possible
- allow horizontal scrolling
- stack dense toolbars intelligently

## Mobile

- drawer navigation
- single-column forms
- card/table transformation only when needed
- POS should become a deliberate mobile workflow, not a squeezed desktop screen
- bottom navigation may be used for core destinations

Do not hide important business data just to avoid horizontal scrolling.

---

# 34. Accessibility

All interactive controls must support:

- keyboard navigation
- visible focus state
- semantic labels
- correct button types
- accessible dialogs
- accessible menus
- adequate contrast
- touch target sizing on mobile

Do not use color alone to communicate status.

---

# 35. Loading, Empty, Error States

Every data screen must handle:

- loading
- empty
- filtered-empty
- error
- retry
- permission denied

Examples:

```text
No products yet.
Add your first product to start tracking stock.

No results found.
Try changing the search or filters.
```

Avoid decorative empty-state illustrations unless they clearly improve comprehension.

---

# 36. Confirmation Rules

Use confirmation only when the action has meaningful consequence.

Confirm:

- delete
- financial posting
- return
- reverse
- deactivate when it affects workflow
- destructive edit
- closing cash session

Do not confirm harmless navigation or ordinary form edits.

Financial confirmations should clearly show:

- amount
- party
- method
- date
- important balance effect

---

# 37. Theme and Language Preferences

Prefer:

- tenant-level default
- user-level preference override

Examples:

```text
Tenant default language: English + Bangla Helper
User override: Full English

Tenant default theme: Light
User override: Dark
```

Theme and language are independent settings.

---

# 38. Shared Components to Prefer

Build reusable components instead of page-specific styling.

Recommended component families:

```text
AppShell
Sidebar
SidebarNavItem
Topbar
PageHeader
PageTabs
PageToolbar
StatStrip
DataTable
TablePagination
StatusBadge
MoneyText
QuantityText
SearchInput
EntityCombobox
DateRangeFilter
FilterPopover
ActionMenu
FormField
BilingualLabel
ConfirmDialog
EntityDialog
DetailDrawer
EmptyState
ErrorState
LoadingState
```

Do not duplicate these patterns across modules.

---

# 39. Bilingual Component Pattern

Create one reusable component for bilingual labels.

Concept:

```tsx
<BilingualLabel
  en="Purchase Price"
  bn="কেনা দাম"
/>
```

Rendering depends on language mode.

Default:

```text
Purchase Price
কেনা দাম
```

Full English:

```text
Purchase Price
```

Full Bangla:

```text
কেনা দাম
```

Do not manually hard-code the language mode logic in every page.

---

# 40. shadcn/ui Usage Rules

Use shadcn/ui as the implementation foundation, not as the final visual identity.

Do not ship default shadcn appearance unchanged.

Customize shared tokens and component variants to match this file.

Prefer:

- Button
- Input
- Select
- Dialog
- Sheet
- DropdownMenu
- Popover
- Command
- Tabs
- Tooltip
- Checkbox
- RadioGroup
- Switch
- Badge
- ScrollArea
- Separator

Avoid adding unnecessary libraries for components already covered by shadcn/Radix.

---

# 41. Anti-AI-Slop Rules

Before completing UI work, verify:

- no giant hero header inside ERP screens
- no gradient card backgrounds
- no random pastel cards
- no decorative blobs
- no arbitrary colored icons
- no excessive rounded containers
- no glassmorphism
- no inconsistent font weights
- no huge spacing between ordinary controls
- no repeated nested cards without purpose
- no duplicate page title inside another large title card
- no large empty decorative area
- no unnecessary animations
- no colored shadows
- no overdesigned status indicators
- no mobile-app aesthetic imposed on desktop ERP
- no generic admin-template layout that ignores SherHisab workflows

---

# 42. Implementation Discipline

For every UI implementation:

1. Read this file.
2. Review `DESIGN.md` and `Tailark_DESIGN.md` when available.
3. Inspect the existing SherHisab shared components before adding new ones.
4. Reuse shadcn/ui primitives.
5. Reuse shared SherHisab components.
6. Use TanStack Table for tabular data.
7. Keep tenant-owned data tenant-scoped.
8. Keep UI text translation-ready.
9. Use RED/TDD where applicable.
10. Run affected tests.
11. Run full tests before completion.
12. Run:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm build`
   - `git diff --check`
   - `git status --short`
13. Do not push unverified code.
14. Report all changed files.

---

# 43. Visual QA Checklist

Before marking any UI task complete, compare the rendered screen against this design system.

Check:

### Typography
- Inter used consistently
- Bangla helper smaller and muted
- page titles not oversized
- table text compact
- numeric columns aligned

### Layout
- 4px spacing rhythm
- no wasted space
- full-width ERP use where beneficial
- page toolbar aligned
- form grids consistent

### Components
- 6px controls
- 8px cards
- hairline borders
- minimal shadows
- shared variants used

### Color
- neutral majority
- blue only for active/primary use
- semantic colors only for meaning
- no decorative gradients

### Tables
- dense but readable
- right-aligned numeric data
- reliable scrolling
- consistent actions
- proper pagination

### Language
- default English + Bangla helper works
- Full English works
- Full Bangla works
- user-entered data is not translated

### Responsive
- desktop
- tablet
- mobile
- narrow modal
- wide table

---

# 44. Reference Lock

Use this as the final visual reference lock for SherHisab.

```text
Primary design foundation:
Tailark Pro compact component system

Secondary visual influence:
Dub border-first SaaS system

Typography:
Inter for English/UI
Noto Sans Bengali for Bangla
Geist Mono / JetBrains Mono only for technical IDs

Brand accent:
SherHisab blue

Surfaces:
Neutral / white / near-white

Borders:
1px hairline

Shadows:
Minimal; floating layers only

Controls:
6px radius

Cards/panels:
8px normal
10–12px large/floating

Density:
Compact

Tables:
Primary operational UI pattern

Navigation:
Collapsed icon rail + expandable labelled sidebar

Default language:
English + Bangla helper

Additional language modes:
Full English
Full Bangla

Themes:
Light + Dark

Primary rule:
Do not complicate the interface.
Make common business work fast and obvious.
```

---

# 45. Final Rule

When design references conflict with proven SherERP business workflow:

> **Preserve the workflow. Improve the presentation.**

When Tailark and Dub conflict:

> **Use Tailark for structure and typography. Use Dub for blue accent discipline and flatter border-first surfaces.**

When a design choice makes the UI prettier but slower or harder for ordinary shop owners:

> **Choose clarity and speed.**

SherHisab is business software first.
