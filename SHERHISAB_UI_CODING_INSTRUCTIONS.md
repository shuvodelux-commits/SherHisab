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

# 15A. Breadcrumbs

Use the official shadcn `Breadcrumb` component for hierarchical location/context.

Reference: https://ui.shadcn.com/docs/components/base/breadcrumb

Use Breadcrumb when the user is inside a meaningful hierarchy, for example:

```text
Products / Product Details
Products / Edit Product
Customers / Customer Profile
Customers / Ledger
Purchases / Purchase #PUR-00124
Sales / Invoice #INV-00452
Settings / Product Settings
Reports / Sales Report
```

Use the official composition:

- `Breadcrumb`
- `BreadcrumbList`
- `BreadcrumbItem`
- `BreadcrumbLink`
- `BreadcrumbPage`
- `BreadcrumbSeparator`
- `BreadcrumbEllipsis` when collapsing long paths

Rules:

- The current page uses `BreadcrumbPage`; it is not a link to itself.
- Parent levels use `BreadcrumbLink`.
- Use TanStack Router `Link` through the supported shadcn composition pattern for client-side navigation.
- Keep breadcrumbs compact and subordinate to the page title.
- Do not repeat the full sidebar hierarchy mechanically.
- Do not show a breadcrumb on a simple top-level page such as Dashboard or a standalone Products list when it adds no location value.
- Use `BreadcrumbEllipsis` for long/deep paths rather than wrapping a long breadcrumb across the toolbar.
- Do not use breadcrumbs as a substitute for Tabs, Back buttons, or workflow step indicators.
- Breadcrumb text must use real entity names/numbers when useful, but avoid exposing unnecessary internal IDs.
- On narrow screens, collapse intermediate levels while keeping the immediate parent and current page understandable.
- Preserve accessible semantics and separators from the official shadcn component.
- Match SherHisab typography, semantic tokens, and compact control density; do not hand-build breadcrumb separators or custom pill breadcrumbs.

# 16. Tabs

Use the official shadcn `Tabs` component for module-internal navigation.

Reference: https://ui.shadcn.com/docs/components/base/tabs

Inside SherHisab modules, use the line style by default:

```tsx
<TabsList variant="line">
  ...
</TabsList>
```

This is the standard for module sections such as:

- Sales
- Purchases
- Customers
- Suppliers
- Inventory
- Products
- Accounts / Finance
- Reports
- Settings

Examples:

```text
Sales
Overview | Invoices | Returns | Payments

Products
Products | Categories | Units | Settings

Customers
Overview | Ledger | Payments | Purchase History
```

## Why Line Tabs Are the Default

Line tabs keep ERP screens:

- compact;
- visually light;
- easy to scan;
- less card-like;
- consistent with the Tailark/SherHisab direction.

They should read as section navigation, not as large action buttons.

## Use the Official Composition

- `Tabs`
- `TabsList variant="line"`
- `TabsTrigger`
- `TabsContent`

Every `TabsTrigger` must be inside `TabsList`.

## Visual Rules

Recommended module-tab treatment:

```text
height                36–40px
label                 13px / 500
Bangla helper         9–10px / 400 when used
active text           foreground / primary emphasis
active indicator      thin line
inactive text         muted foreground
surface               transparent / low-noise
```

Do not add heavy filled backgrounds, cards, shadows, or large rounded containers around ordinary module tabs.

## When Not to Use Line Tabs

Use another control when the interaction is not module navigation:

| Interaction | Preferred component |
| --- | --- |
| Module/subsection navigation | `TabsList variant="line"` |
| 2–5 compact mode choices | `ToggleGroup` |
| One on/off mode | `Toggle` |
| Persistent boolean setting | `Switch` |
| Step-by-step workflow | Dedicated step/progress pattern |
| Page hierarchy | Breadcrumb |
| Primary navigation | Sidebar / Navigation |

Use filled/default Tabs only when the UI genuinely behaves like a segmented surface and line tabs would reduce clarity.

## State and Routing

- Use route-backed tabs when each section should have a stable URL.
- Preserve the active tab on refresh/navigation when the module benefits from it.
- Do not keep important module state only in ephemeral local state if users need deep links/back-button behavior.
- Lazy-load heavy tab content where useful, but avoid flashes or resetting unsaved work when switching tabs.
- If a tab contains an error/required action, make that state visible without forcing the user to inspect every tab.

## Responsive Rules

- Keep the line-tab row compact on desktop.
- Allow horizontal scrolling on narrow screens when hiding tabs would remove important destinations.
- Do not squeeze many labels into unreadable widths.
- Use concise labels first; avoid converting normal module tabs into a select unless mobile constraints truly require it.

# 17. Buttons

Use the official shadcn Button component as the default action primitive.

Reference: https://ui.shadcn.com/docs/components/base/button

Do not hand-style native buttons when a shadcn Button fits the action.

## Button Variant by Intent

| Situation | shadcn Button | SherHisab examples |
| --- | --- | --- |
| Main positive action on a surface | `default` | Add Product, Complete Sale, Save, Record Payment, Create Customer |
| Secondary but visible action | `outline` | Cancel, Export, Print, View Details, Add Another |
| Lower-emphasis supporting action | `secondary` | Apply Filter, Duplicate, optional secondary workflow action |
| Toolbar / row utility | `ghost` | More actions, Refresh, column controls, compact icon utilities |
| Destructive action | `destructive` | Delete, Remove, Reverse when genuinely destructive |
| Navigation that should visually read as a text link | `link` / semantic link styled with `buttonVariants` | Help, open related record, secondary navigation |

Rules:

- One clear primary/default button per dialog, form footer, or focused action area whenever possible.
- Destructive color is reserved for destructive consequences, not ordinary negative-looking actions.
- Use `outline` or `ghost` for secondary utilities rather than making every action primary blue.
- Prefer the built-in shadcn variants and sizes before custom styling.
- Keep normal ERP action heights aligned with adjacent controls.
- Do not use `rounded-full` for normal SherHisab ERP buttons. Preserve the shared compact radius system.

## Buttons With Icons

Prefer an icon with text when the icon improves recognition or scanning.

Good SherHisab examples:

- Plus + Add Product
- Save + Save Changes
- Check / receipt + Complete Sale
- Printer + Print
- Download + Export
- Refresh + Refresh
- Trash + Delete
- Sliders/filter + Filters

Use the project's configured icon library. For an icon inside shadcn Button, use the official `data-icon="inline-start"` or `data-icon="inline-end"` pattern so spacing is handled by the component.

Icon-only buttons are appropriate only when the action is universally clear and space is constrained, such as close, more actions, refresh, previous/next, or compact table utilities. Icon-only buttons must have an accessible name and, where useful, a Tooltip.

Do not add decorative icons that do not improve recognition.

## Pending / Loading Action Buttons

For an asynchronous action, show the official shadcn `Spinner` inside the Button and change the label to the action-in-progress wording.

Examples:

```text
Save            → Saving…
Complete Sale   → Completing…
Create Product  → Creating…
Delete          → Deleting…
Remove          → Removing…
Post Payment    → Posting…
Return Items    → Returning…
Generate        → Generating…
Download        → Downloading…
Upload          → Uploading…
Refresh         → Refreshing…
```

Rules:

- Put `Spinner` inside the Button with `data-icon="inline-start"` unless a trailing spinner is more natural.
- Disable the action while its mutation is pending unless repeated execution is explicitly supported.
- Keep the button width stable enough that changing to the “-ing” label does not cause disruptive layout jumping.
- Do not show a Spinner on an action that has already completed. After success, return to the normal label or close/advance the workflow.
- Do not replace the meaningful action text with only a spinner for primary financial/stock actions.
- Pending text must describe what the system is doing: `Deleting…`, not generic `Loading…` when the action is delete.
- Mutation/error handling must preserve the user's input and allow retry when appropriate.

## Button Size

Use shadcn sizes intentionally:

```text
xs / sm       compact table, toolbar, inline utility
default       normal form/dialog/page action
lg            rare; only when a larger primary action is justified
icon variants icon-only controls
```

Avoid arbitrary per-page button heights.

# 17A. Button Group

Use the official shadcn Button Group only when adjacent controls represent one tightly related action family.

Reference: https://ui.shadcn.com/docs/components/base/button-group

Use Button Group for:

| Situation | Pattern | SherHisab example |
| --- | --- | --- |
| Same-object action family | Basic Button Group | Print + Download invoice; compact Export actions |
| Primary action plus alternatives | Split Button + Dropdown Menu | Complete Sale + menu for Save Draft / alternate completion action where the workflow supports it |
| Increment/decrement around a value | Button Group + Input/Text | POS quantity decrement / quantity / increment |
| Action plus tightly coupled selector | Button Group + Select | Amount/action control where the selector directly changes that same action |
| Search/input with a directly coupled action | Button Group + Input/Input Group | Compact barcode/search action only when the button operates on that exact input |
| Compact related icon actions | Small Button Group | Previous / Next record when treated as one navigation control |

Rules:

- Button Group is for buttons that **perform related actions**. If controls toggle a state, use shadcn `ToggleGroup` instead.
- Do not group unrelated page actions simply because they are beside each other.
- Use the same size across buttons inside one group unless an official split-button pattern requires otherwise.
- For non-outline grouped buttons, use `ButtonGroupSeparator` where the official pattern benefits visual separation.
- Outline buttons already have borders and normally do not need a separator.
- Use a split Button Group when one dominant action has closely related alternatives in a Dropdown Menu.
- Give Button Group an accessible label via `aria-label` or `aria-labelledby`.
- Horizontal is the normal SherHisab orientation; use vertical only when the workflow/layout genuinely requires it.
- Do not replace Tabs, ToggleGroup, Pagination, InputGroup, or Combobox with Button Group when those components better express the interaction.

# 17B. Tooltips for Compact and Complex Actions

Use the official shadcn `Tooltip` component to explain compact, icon-only, unfamiliar, or complex controls without permanently adding visual noise.

Reference: https://ui.shadcn.com/docs/components/base/tooltip

Use one shared `TooltipProvider` at the application root. Do not create separate providers for ordinary page controls.

Use the official composition:

- `Tooltip`
- `TooltipTrigger`
- `TooltipContent`

## Tooltip Is Required

Use a Tooltip for:

- icon-only buttons;
- compact toolbar icons whose purpose is not fully obvious from surrounding context;
- uncommon/technical actions that use short button text;
- complex actions where a short explanation prevents misuse;
- disabled icon/text actions when the user benefits from knowing why the action is unavailable.

Examples:

```text
[↻]                → Refresh data
[⋮]                → More actions
[columns icon]     → Show or hide columns
[adjust icon]      → Adjust stock
[archive icon]     → Archive product
[calculator icon]  → Open calculator
```

For complex actions:

```text
Adjust Stock
Tooltip: Add or remove stock without editing the product master.

Reverse
Tooltip: Creates a reversing entry; it does not delete the original transaction.

Unpriced Lots
Tooltip: Show received stock lots that do not yet have a final purchase cost.
```

## Tooltip Is Usually Not Needed

Do not add redundant tooltips to self-explanatory text buttons such as:

- Save
- Cancel
- Delete
- Add Product
- Print
- Export
- Next
- Previous

A tooltip is useful only when it adds information that is not already obvious.

## Icon-Only Button Rules

Every icon-only Button must also have:

- an accessible name such as `aria-label`;
- a Tooltip with a short human-readable action label when hover/focus explanation is useful;
- the project's configured icon library;
- the normal shadcn icon/button sizing rules.

Tooltip is **not** a replacement for the accessible name.

## Complex Feature Tooltip Rules

Use a Tooltip to give a short explanation for advanced or unfamiliar actions while keeping the interface clean.

Good tooltip content explains one of:

- what the action does;
- why the action is unavailable;
- what a technical term means;
- a keyboard shortcut;
- a short consequence that prevents confusion.

Keep it concise. If the explanation needs multiple paragraphs, links, controls, or rich interaction, use `Popover`, `HoverCard`, Dialog, or inline helper text instead.

## Disabled Controls

When a disabled Button needs explanation, follow the official shadcn disabled-button Tooltip pattern so the Tooltip can still be triggered even though the Button itself is disabled.

Examples:

```text
Complete Sale (disabled)
Tooltip: Add at least one product before completing the sale.

Delete (disabled)
Tooltip: This product has transaction history and cannot be deleted.
```

## Keyboard Shortcuts

When a control has a useful keyboard shortcut, the Tooltip may show the shortcut beside the action label using the standard keyboard-key presentation.

Example:

```text
Save changes    Ctrl+S
Search products /
```

Do not display shortcuts that are not actually implemented.

## Tooltip UX Rules

- Tooltips must work on keyboard focus as well as pointer hover.
- Keep content short, normally one label or one concise sentence.
- Choose `side` only when placement materially improves usability; otherwise use the shared default.
- Do not hide required validation, payment totals, due balances, stock warnings, irreversible consequences, or other essential business information exclusively in a Tooltip.
- Do not use Tooltip as a confirmation mechanism.
- Do not put buttons/forms/interactive workflows inside Tooltip content.
- Avoid tooltip spam: ordinary labels, badges, and fully clear text controls do not need one.
- Tooltip language follows the active SherHisab language mode.
- For touch/mobile workflows, essential understanding must remain available without depending only on hover behavior.

# 17C. Toggle Buttons

Use the official shadcn `Toggle` component for a single two-state button that can be on or off.

Reference: https://ui.shadcn.com/docs/components/base/toggle

The official component supports default and outline variants, text and icon forms, sizes, and disabled state.

## Use Toggle For

Use `Toggle` when the control behaves like a compact button whose pressed/unpressed state changes an immediate view or tool mode.

Good SherHisab examples:

- Show low-stock only
- Show archived/inactive records in a toolbar
- Pin/favorite a record when that state is represented as a button
- Compact table view on/off
- Show extra table detail on/off
- Lock/unlock an optional editing mode where the state is immediately visible
- Small toolbar mode such as scan mode, focus mode, or preview mode when the feature genuinely exists

## Do Not Use Toggle For Every Boolean

Choose the control by meaning:

| Need | Component |
| --- | --- |
| One button-like on/off mode | `Toggle` |
| Several related selectable modes/options | `ToggleGroup` |
| Persistent setting such as “Allow negative stock” | `Switch` |
| Form acknowledgement / independent option | `Checkbox` |
| Choose exactly one option from a small set | `RadioGroup` |
| Perform an action once | `Button` |

Examples:

```text
Show inactive        → Toggle
Compact view         → Toggle
Allow negative stock → Switch
Include VAT          → Checkbox when part of a form
View: List / Grid    → ToggleGroup
Save                 → Button
```

## Icon and Text Rules

- Prefer icon + short text when the state is not obvious from the icon alone.
- Icon-only Toggle is appropriate for universally recognizable compact toolbar modes.
- Icon-only Toggle must have an accessible name and follow the SherHisab Tooltip rule.
- Do not add decorative icons that do not clarify the state.
- Use the configured project icon library and the official shadcn icon sizing conventions.

## State Rules

- The pressed state must be visually obvious without relying only on color.
- Use the official pressed/unpressed state styling rather than custom page-specific CSS.
- Keep the state controlled when it affects application/filter state that must stay synchronized with URL/query/table state.
- If a toolbar Toggle changes filtering, preserve that state consistently while paging/sorting where appropriate.
- If the state is persisted as a user/tenant preference, treat it as a settings decision and prefer `Switch` unless button-like interaction is genuinely better.
- Disabled Toggle must expose why it is unavailable when that reason is useful; use the established Tooltip pattern.
- Do not use Toggle as a confirmation control for destructive or financial actions.

## Variant and Size

- Use the standard variant for normal toolbar modes.
- Use `variant="outline"` when the surrounding toolbar/control group needs stronger separation.
- Use the smallest size that remains readable and touch-accessible for the context.
- Keep Toggle height aligned with neighboring SherHisab toolbar controls.

# 17D. Keyboard Shortcut Labels with Kbd

Use the official shadcn `Kbd` component wherever a real keyboard shortcut improves speed, discoverability, or understanding.

Reference: https://ui.shadcn.com/docs/components/base/kbd

Use:

- `Kbd` for a single key;
- `KbdGroup` for a key combination or sequence.

Examples:

```text
/               → focus product/global search
Ctrl + K        → open command/search palette
Enter           → confirm the currently focused quick action where supported
Esc             → close dialog/popover or cancel the current lightweight mode
Ctrl + S        → save form when explicitly implemented
F2              → edit selected row only if SherHisab actually implements it
```

## Good Places to Use Kbd

- Tooltip content for icon-only or compact actions;
- InputGroup addon for search shortcuts;
- Command/search palette hints;
- POS keyboard-help areas;
- button labels when a shortcut is an important part of the workflow;
- menus/dropdown items that expose implemented shortcuts;
- dialog/helper text for common keyboard actions;
- onboarding/help content for power-user workflows.

Examples:

```text
Search products        [/]
Save changes           [Ctrl] + [S]
Open command palette   [Ctrl] + [K]
Close                  [Esc]
```

## InputGroup + Kbd

For search fields, a shortcut hint may appear inside `InputGroupAddon` using `Kbd`.

Example:

```text
[search icon] Search products…                         [/]
```

Only show the hint while it is useful. On very narrow/mobile layouts, hide shortcut-only decoration when it competes with the actual input.

## Tooltip + Kbd

When an icon-only control has a shortcut, the Tooltip may show both the action label and the shortcut:

```text
Refresh data        [R]
Search products     [/]
Save changes        [Ctrl] + [S]
```

The tooltip must still explain the action; do not show only the key combination.

## Menu + Kbd

Use `Kbd` in DropdownMenu/Command items when exposing a real implemented shortcut improves discoverability.

Do not create fake shortcut labels just to make menus look more advanced.

## Rules

- Never display a keyboard shortcut that is not implemented.
- Shortcut behavior must not conflict with normal text entry, browser behavior, accessibility, or operating-system conventions.
- Do not hijack common browser shortcuts unless there is a strong, tested product reason.
- Keep shortcut labels secondary and visually quiet; they must not compete with the primary action label.
- Use `KbdGroup` for combinations such as `Ctrl + K`, not plain text like `Ctrl+K` when rendered as UI.
- Prefer platform-appropriate modifier labels where the application supports platform-specific shortcuts.
- Essential workflows must remain fully usable without keyboard shortcuts.
- Do not use Kbd as decorative metadata.
- Keep Kbd styling at the official shadcn size/treatment unless a shared SherHisab variant is explicitly needed.

# 17E. Switches for Persistent Boolean Settings

Use the official shadcn `Switch` component for persistent on/off settings and configuration choices.

Reference: https://ui.shadcn.com/docs/components/base/switch

Use `Switch` when the user is enabling or disabling a setting that remains in effect until changed again.

Good SherHisab examples:

- Allow negative stock
- Enable low-stock alerts
- Enable batch tracking for a supported business mode
- Enable automatic invoice printing
- Require customer for due sales
- Enable barcode scanning helpers
- Show Bangla helper text
- Enable dark mode when presented as a settings choice
- Enable delivery notifications
- Allow sale price override
- Enable tenant/business feature flags exposed to the user
- Enable advanced product features when that setting controls availability across the module

## Switch vs Other Controls

Choose by meaning:

| Need | Component |
| --- | --- |
| Persistent on/off setting | `Switch` |
| One button-like toolbar mode | `Toggle` |
| Several visible modes/options | `ToggleGroup` |
| Independent form option / acknowledgement | `Checkbox` |
| Exactly one choice from several visible options | `RadioGroup` |
| One-time action | `Button` |

Examples:

```text
Allow negative stock → Switch
Enable low-stock alerts → Switch
Show inactive now → Toggle
Include VAT on this form → Checkbox
View: List / Grid → ToggleGroup
Save settings → Button
```

## Official Composition

Prefer combining Switch with the shared shadcn `Field` primitives:

- `Field`
- `FieldContent`
- `FieldLabel`
- `FieldDescription`
- `Switch`

Use `Field orientation="horizontal"` for normal settings rows.

The label should explain the setting itself; the description should explain the effect when needed.

Example structure:

```text
Allow negative stock                         [Switch]
Permit sales when available stock is below zero.
```

## Choice Card Pattern

Use the official Switch choice-card pattern only when the setting is important enough to benefit from a larger clickable surface and short description.

Good examples:

- Enable advanced inventory tracking
- Enable customer due sales
- Enable delivery integration

Do not turn ordinary settings into large cards by default. Normal compact horizontal settings rows remain preferred for dense ERP screens.

## State Rules

- Use controlled state when the value comes from persisted application/tenant/user settings.
- Persist the value through the appropriate mutation rather than keeping it only in local UI state.
- If changing the setting has a meaningful downstream effect, show concise helper text before the change.
- If the setting is dangerous or has financial/stock implications, do not rely only on the Switch label; explain the consequence clearly.
- A Switch change should not silently trigger irreversible destructive work.
- If enabling/disabling requires confirmation, use the appropriate AlertDialog after interaction.

## Disabled and Invalid

Follow the official shadcn Field state pattern:

- disabled: `disabled` on Switch + `data-disabled` on Field;
- invalid: `aria-invalid` on Switch + `data-invalid` on Field.

If a disabled Switch needs explanation, use the established Tooltip pattern.

## Size

Use the official Switch size options.

- default → normal settings/forms;
- small → dense settings/table contexts when readability remains good.

Do not invent arbitrary switch sizes per page.

## Accessibility and Labeling

- Every Switch must have a clear accessible label.
- Do not rely on On/Off color alone to explain meaning.
- Prefer action-oriented labels that describe the enabled state, such as `Enable low-stock alerts`, rather than ambiguous labels like `Alerts`.
- Keep Switch and label aligned and clickable according to the official component pattern.
- Preserve keyboard interaction and focus states.
- Do not use icon-only unlabeled switches.

# 18. Input and Input Group

Use the official shadcn `Input` as the base text-entry control.

References:

- https://ui.shadcn.com/docs/components/base/input
- https://ui.shadcn.com/docs/components/base/input-group

Prefer `InputGroup` whenever useful information, context, or an action can be communicated inside the input without cluttering the surrounding form.

## Plain Input

Use plain `Input` when the field is simple and needs no inline context.

Good examples:

- Product Name
- Customer Name
- Address line
- Notes title
- Reference text
- Simple email field
- Simple phone field when no prefix/action is needed

Use `Field`, `FieldLabel`, and `FieldDescription` for labels/help text. Use `FieldGroup` to organize forms.

For invalid state:

- `data-invalid` on `Field`;
- `aria-invalid` on the `Input`.

For disabled state:

- `data-disabled` on `Field`;
- `disabled` on the `Input`.

Do not remove a meaningful visible/accessibility label simply because the input contains an icon or placeholder.

## Prefer InputGroup for Informative Inputs

Use `InputGroup` when the field benefits from any of:

- leading icon;
- trailing icon;
- currency prefix;
- percentage/unit suffix;
- inline action;
- clear/copy/scan/show-password action;
- keyboard shortcut;
- result count;
- validation/status affordance;
- loading/spinner state;
- directly related dropdown;
- character count/help text;
- block-start/block-end helper content.

Use the official composition:

```text
InputGroup
├── InputGroupInput or InputGroupTextarea
├── InputGroupAddon
├── InputGroupButton
└── InputGroupText
```

Inside `InputGroup`, use `InputGroupInput` or `InputGroupTextarea` rather than a raw `Input` or `Textarea`.

For proper focus behavior, keep `InputGroupAddon` after the input/textarea in DOM order and use its `align` prop for visual placement.

## SherHisab InputGroup Examples

| Business field | InputGroup treatment |
| --- | --- |
| Product search | Search icon + input + optional result count / clear action |
| POS product search | Search/barcode icon + input + shortcut hint or scan action |
| Customer search | Search icon + input + optional clear action |
| Purchase/Sale amount | `৳` prefix when the currency context helps |
| Discount percent | Input + `%` suffix |
| Quantity | Input + current unit suffix such as pcs/kg when unit is fixed for that field |
| Barcode | Barcode icon + input + scan action where scanning exists |
| Phone | Phone icon or a fixed prefix only when the stored/entered format makes it useful |
| Website/reference URL | protocol/prefix text where relevant |
| Password | input + show/hide password action |
| Global search | search icon + input + keyboard shortcut such as `/` or `Ctrl+K` when actually implemented |
| Remote search | search icon + input + inline Spinner while fetching |
| Generated/reference value | input + Copy button when copying is a common task |
| Textarea with limit | textarea + character count at block end |

## Inline Text / Units

Use `InputGroupText` for concise contextual text such as:

```text
৳
%
pcs
kg
cm
BDT
https://
.com
12 results
120 characters left
```

Do not repeat information that is already obvious from the visible label.

For financial entry, the prefix/suffix is presentation only; parsing and storage must still use the canonical numeric value.

## InputGroup Buttons

Use `InputGroupButton` for actions that operate directly on the input value:

- clear;
- copy;
- scan barcode;
- show/hide password;
- search;
- refresh lookup;
- open directly related dropdown.

Icon-only InputGroup buttons must follow the SherHisab Tooltip + accessible-name rule.

Do not place unrelated actions inside an InputGroup.

## InputGroup Loading

Use an inline Spinner when the input itself is actively performing a lookup/process, for example:

- Searching…
- Checking…
- Loading suggestions…
- Refreshing…

For a form submission, keep the Spinner on the submit Button instead of moving all pending feedback into the input.

## InputGroup vs ButtonGroup

Use `InputGroup` when addons/actions are part of one input surface.

Use `ButtonGroup` when a separate Button and Input are adjacent controls but remain distinct actions/surfaces.

Example:

```text
Search icon inside field + clear button → InputGroup
Input field + separate Search button    → ButtonGroup
```

## Input Density

Normal SherHisab desktop Input/InputGroup height should remain aligned with adjacent Button, Combobox, Select, and Date Picker controls, normally around 34–36px.

Keep:

- 13px input text;
- 1px semantic border;
- shared 6px control radius;
- semantic focus ring;
- consistent disabled/invalid states.

Do not invent per-page input dimensions.

## Do Not Overdecorate

InputGroup is preferred for informative UI, but every field does not need an icon.

Use plain `Input` when an addon would merely repeat the label or add visual noise.

The goal is:

> more context inside the control when useful, fewer detached helper elements, and no decorative clutter.

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


# 18B.1 Select vs Combobox Decision Rule

Use the official shadcn `Select` when the user chooses from a known option list and does **not** need to search.

Reference: https://ui.shadcn.com/docs/components/base/select

Use the official shadcn `Combobox` when the user needs to search, filter, clear, group, or select from a larger/dynamic entity list.

Decision rule:

```text
Need to search/filter the options?
├─ No  → shadcn Select
└─ Yes → shadcn Combobox
```

## Use shadcn Select For

Good SherHisab examples:

- Status: Active / Inactive
- Payment method when presented as a dropdown
- Language
- Theme preference
- Small fixed Unit list when search is unnecessary
- Small Category list when search is unnecessary
- Tracking mode: Simple / Lot / Batch
- Order status
- Tax/VAT mode
- Small static warehouse/location list
- Rows per page
- Other short, known option sets

Use the official composition:

- `Select`
- `SelectTrigger`
- `SelectValue`
- `SelectContent`
- `SelectGroup`
- `SelectItem`
- `SelectLabel` when grouping needs a visible label
- `SelectSeparator` when it clarifies grouped options

Do not render `SelectItem` directly without the appropriate `SelectGroup`.

## Use shadcn Combobox For

Use Combobox when search materially helps selection, especially:

- Product
- Customer
- Supplier
- Category when the list is large
- Brand when the list is large
- Unit when there are many/custom units
- Bank/account/entity lookups
- Warehouse/location when there are many entries
- POS customer/product lookup
- Any large or remotely fetched entity list

If the choice is optional and frequently cleared, use the Combobox clear-button pattern.

If the user may select more than one value, use the multiple Combobox pattern.

## Select vs Other Choice Controls

Do not use Select automatically for every choice.

| Situation | Preferred control |
| --- | --- |
| Small dropdown, no search needed | `Select` |
| Searchable dropdown/entity lookup | `Combobox` |
| 2–5 options that benefit from being visible at once | `ToggleGroup` or `RadioGroup` depending semantics |
| One persistent on/off setting | `Switch` |
| Independent form option / acknowledgement | `Checkbox` |
| One button-like on/off tool mode | `Toggle` |

## Rules

- **Do not use shadcn `NativeSelect` anywhere in SherHisab.**
- **Do not use browser-default `<select>` anywhere in SherHisab application UI.**
- If search is unnecessary, use the official shadcn `Select`.
- If search/filtering is needed, use the official shadcn `Combobox`.

- Do not use a Combobox for a tiny fixed list when search adds no value.
- Do not use Select for a long entity list that forces users to scroll excessively.
- Keep Select height, radius, border, focus ring, and typography aligned with adjacent Input/Button/Combobox controls.
- Use semantic shadcn tokens and official component states rather than page-specific styling.
- Preserve keyboard navigation and accessibility behavior from the official component.
- For forms, connect invalid/disabled states through the shared `Field` pattern.
- For large remote datasets, use Combobox with server-backed/debounced search rather than Select.

# 18C. Combobox Selection Rules

Use the official shadcn Combobox as the default searchable/selectable entity control.

Reference: https://ui.shadcn.com/docs/components/base/combobox

Do not use the browser-default `<select>` for workflows that need search, clear, multi-select, grouped results, custom item rendering, or entity metadata. When a workflow needs a combobox, use the official shadcn Combobox or an approved shared SherHisab component built on it.

Choose the combobox variant by business task:

| Business situation | Official shadcn pattern | SherHisab examples |
| --- | --- | --- |
| Normal single selection | Basic Combobox | Category, Brand, Unit, Warehouse, Payment Account |
| Optional entity that users frequently replace/remove | Combobox with Clear Button | POS customer, Sales customer, Purchase supplier when optional, delivery partner |
| Multiple values | Multiple Combobox with chips | Product tags, multiple categories where supported, report dimensions, multi-warehouse/report filters |
| Grouped domain values | Combobox Groups | Products grouped by category/brand, accounts grouped by type, locations grouped by region |
| Rich entity search | Custom Items | Customer showing phone + due, Product showing SKU + stock + unit, Supplier showing phone + balance |
| Keyboard-heavy quick selection | Auto Highlight Combobox | POS product/customer search, rapid purchase-entry lookups |
| Compact trigger with search in popup | Popup Combobox | Dense toolbar filters, compact table filters, constrained forms |
| Control needs a leading/trailing affordance | Combobox Input Group | Currency/unit/location-assisted selectors when the addon improves recognition |

Rules:

- Basic Combobox is the default for most searchable single-selection fields.
- POS / Sales customer selection must support a clear action when customer selection is optional.
- Use `multiple` with `ComboboxChips` when the user must select more than one value.
- For Customer/Product/Supplier lookups, prefer custom items that show the minimum secondary information needed to disambiguate results.
- Do not overload basic entity lists with unnecessary metadata; add secondary information only where it prevents wrong selection.
- Search should match meaningful entity fields where useful (for example product name/SKU/barcode or customer name/phone), while keeping the visible result concise.
- Use grouped comboboxes only when grouping materially improves scanning.
- Preserve keyboard navigation, active/highlight states, empty results, disabled state, invalid state, and accessible labelling from the official component.
- Use `showClear` for fields that are intentionally nullable and frequently cleared; do not add clear buttons to mandatory fields unless the workflow benefits from resetting before a new choice.
- Do not use multi-select where the domain only permits one value.
- Keep normal desktop combobox height aligned with adjacent Input/Button controls.
- For very large remote datasets, use server-backed search/debouncing rather than downloading the entire dataset into the combobox.
- For small static non-searchable option sets, use the official shadcn `Select`.

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

# 19A. Collapsible for Optional Complexity

Use the official shadcn `Collapsible` component when SherHisab needs to keep a screen clean by hiding secondary, advanced, or rarely used controls until the user asks for them.

Reference: https://ui.shadcn.com/docs/components/base/collapsible

Good SherHisab uses:

- Product form: `Advanced options` for variants, alternative units, tracking, specifications, or other uncommon configuration.
- Purchase/Sales forms: optional notes, delivery details, extra reference fields, or uncommon adjustments.
- POS: secondary customer/delivery metadata that is not required for the common cash-sale path.
- Reports: advanced filters beyond the common date/status/entity filters.
- Settings: rarely changed technical/business options.
- Table toolbars: less-used filters or column controls behind `More filters` / `Advanced filters`.
- Detail pages: secondary metadata/history summaries when the main operational information should stay prominent.

Use the official composition:

- `Collapsible`
- `CollapsibleTrigger`
- `CollapsibleContent`

Rules:

- Collapsible is for **optional complexity**, not for hiding critical business information.
- Never hide required form fields, validation errors, payment totals, customer due, supplier payable, stock warnings, destructive consequences, or primary actions inside a collapsed section.
- The most common workflow must remain usable without opening any collapsible section.
- Give the trigger a clear label such as `Advanced options`, `More filters`, `Delivery details`, or `Additional information`; avoid vague labels like `More` when context is unclear.
- Use a chevron/icon state that clearly communicates expanded vs collapsed.
- Preserve keyboard operation and accessible state from the official shadcn component.
- Do not nest multiple collapsibles deeply. If the screen needs several levels of progressive disclosure, reconsider the information architecture.
- Remember expanded state only when it meaningfully helps the workflow; do not persist every temporary expansion globally.
- On edit screens, automatically expose a collapsible section when it contains existing values that the user needs to see or edit.
- On validation failure, open the relevant collapsed section if it contains the invalid field.
- For advanced filters, show active-filter count or visible filter chips outside the collapsed area so users do not forget that hidden filters are active.
- Use `Accordion` instead when there are several peer sections and the user is choosing among multiple titled panels.
- Use `Disclosure/Collapsible` for one optional section; use `Dialog` or `Sheet` when the task needs a focused overlay rather than inline expansion.
- Keep spacing, border, typography, and trigger treatment consistent with the rest of the shadcn/SherHisab system.

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

# 20A. Official shadcn Data Table Standard

Use the official shadcn Data Table pattern as the visual and interaction foundation for SherHisab operational lists.

Reference: https://ui.shadcn.com/docs/components/base/data-table

Required behavior:

- shadcn `Table` primitives for rendering;
- TanStack Table for table state and behavior;
- sortable business columns where sorting is useful;
- sorting indicators in the column header;
- compact filter/search controls above the table;
- pagination for paginated datasets;
- column visibility only where it improves the workflow;
- row actions through the standard action menu;
- row selection only for real bulk actions;
- server-side pagination/filtering/sorting for large ERP datasets;
- stable column definitions and stable row IDs.

Sorting rules:

- Clicking a sortable header cycles through the supported sort states.
- Show a clear sort-direction indicator beside the active column label.
- Do not make every column sortable. Enable sorting only when the order is meaningful.
- Text columns use text/alphanumeric sorting.
- Money, quantity, balance, and percentage columns sort by their underlying numeric values, not formatted strings.
- Date columns sort by their canonical date/time value, not localized display text.
- Status/action/display-only columns are not sortable unless the business workflow specifically needs it.
- Preserve the user's active sorting while paging/filtering when appropriate.
- For large datasets, send sorting state to the server rather than sorting only the current page in the browser.

SherHisab is currently on `@tanstack/react-table ^8.21.3`. The current shadcn documentation shows the TanStack Table v9 feature API. Use the same official shadcn Data Table UX and composition without silently upgrading the TanStack major version. A v9 migration must be an explicit, separately verified dependency task.

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

Use the official shadcn `Pagination` component for paginated SherHisab lists, tables, and reports.

Reference: https://ui.shadcn.com/docs/components/base/pagination

Use the official composition:

- `Pagination`
- `PaginationContent`
- `PaginationItem`
- `PaginationPrevious`
- `PaginationLink`
- `PaginationEllipsis`
- `PaginationNext`

The active page must use the official active state.

## Default ERP Pattern

For normal operational lists, prefer:

```text
Showing 1–50 of 1,248

Rows per page [50 ▾]      Previous   1  2  3  …  25   Next
```

Use the official shadcn `Select` for the rows-per-page control. Never use `NativeSelect`.

Good places:

- Products
- Sales invoices
- Purchases
- Customers
- Suppliers
- Inventory
- Payments
- Returns
- Expenses
- Ledgers
- Reports
- Settings lists

## Numbered vs Compact Pagination

Use numbered Pagination when:

- users benefit from seeing their position in a multi-page dataset;
- they may jump to nearby pages;
- the list is a normal desktop/tablet operational screen.

Use the official previous/next-only or icon-focused pattern when:

- the table is very dense;
- the page count is not useful;
- there is already a rows-per-page selector;
- the layout is narrow/mobile;
- simpler previous/next navigation is clearer.

Do not remove useful page context merely to save a few pixels.

## Ellipsis

Use `PaginationEllipsis` for long page ranges.

Example:

```text
Previous  1  2  3  …  25  Next
```

Do not render every page number for large datasets.

## Data Table Integration

Pagination must integrate with the SherHisab shadcn/TanStack Data Table standard.

For large ERP datasets:

- use server-side pagination;
- send current page/page size to the API;
- preserve sorting and filtering when the page changes;
- reset to a valid page when filters reduce the result count;
- return total row count / page metadata from the server;
- do not fetch thousands of rows merely to paginate them in the browser.

For small local datasets, client-side pagination is acceptable when it is genuinely simpler and does not harm performance.

## URL / Navigation State

When a list benefits from deep links or browser back/forward behavior, synchronize pagination with TanStack Router search params, for example:

```text
?page=3&pageSize=50
```

Use the project's router/link integration rather than full-page browser navigation.

Do not lose the user's current:

- filters;
- search query;
- sorting;
- page size

when they navigate between pages.

## Rows Per Page

Use shadcn `Select` for page size.

Recommended options should remain intentionally small and practical, for example:

```text
25
50
100
```

Do not offer huge page sizes that defeat pagination.

Changing page size should return the user to a valid page while preserving the active search/filter/sort state.

## Disabled / Boundary States

- Disable Previous on the first page.
- Disable Next on the final page.
- Do not allow navigation to invalid page numbers.
- If the current page becomes invalid after deletion/filtering, move to the nearest valid page.
- Preserve accessible labels such as `Go to previous page` / `Go to next page`.

## Responsive Rules

Desktop:
- show row count, rows-per-page, and numbered pagination when useful.

Tablet:
- keep numbered pagination when space allows; collapse distant pages with ellipsis.

Mobile/narrow:
- prefer compact Previous/Next or icon-focused pagination;
- keep current-page context visible when useful;
- move rows-per-page separately if combining everything becomes cramped.

## Loading Behavior

When pagination triggers a remote request:

- keep the existing table structure stable where possible;
- show the appropriate loading/pending state without replacing the whole page with an Empty state;
- prevent duplicate rapid page requests when needed;
- do not reset unrelated UI state.

# 24. Badges and Status Badges

Use the official shadcn `Badge` component for compact status, category, state, count, and short metadata labels.

Reference: https://ui.shadcn.com/docs/components/base/badge

Do not build badge-looking UI from custom styled `span` / `div` elements when shadcn Badge fits the purpose.

## Variant by Meaning

| Situation | shadcn Badge variant | SherHisab examples |
| --- | --- | --- |
| Primary / emphasized state | `default` | Selected/highlighted state only when emphasis is genuinely useful |
| Neutral state / metadata | `secondary` | Draft, category label, ordinary non-critical metadata |
| Destructive / error state | `destructive` | Failed, Rejected, severe overdue/error state |
| Border-only / low-emphasis state | `outline` | Informational labels, low-emphasis status |
| Very low-emphasis metadata | `ghost` | Compact helper/table metadata |
| Badge that is navigation | `link` / Badge rendered as link | Related tag/category/entity when intentionally clickable |

Rules:

- Badge color communicates meaning, not decoration.
- Prefer built-in shadcn variants before custom colors.
- If SherHisab needs success/warning/info states beyond built-ins, define shared semantic Badge variants/tokens centrally.
- Do not hard-code raw page-specific Tailwind badge colors.
- Success/green: Paid, Delivered, Active, In Stock.
- Warning/amber: Partial, Low Stock, Pending.
- Destructive/red: Failed, Rejected, critical error/danger state.
- Ordinary/zero/default states should remain neutral when possible.
- Do not turn every table value into a badge.
- Keep badges compact and readable.
- Do not communicate status by color alone.

## Badge With Icon

Use an icon only when it improves recognition. Use the official `data-icon="inline-start"` / `data-icon="inline-end"` pattern.

Examples: check + Paid, alert + Low Stock, clock + Pending, return + Returned.

## Badge With Spinner

Use Badge + official shadcn `Spinner` only for a live non-action state such as `Generating…`, `Syncing…`, `Importing…`, or `Processing…`.

For user-triggered actions such as Save/Delete/Complete Sale, use Button + Spinner instead.

# 25. Table Row Actions

Use the official shadcn Table row-action pattern for SherHisab operational tables.

Reference: https://ui.shadcn.com/docs/components/base/table

The standard row action is:

```text
[⋯] → DropdownMenu
```

Use one compact icon-only Button with the horizontal-more icon as the trigger, then place row actions inside the official shadcn `DropdownMenu`.

Apply this pattern consistently to:

- Products
- Sales invoices
- Purchases
- Customers
- Suppliers
- Inventory / stock lots
- Payments
- Returns
- Expenses
- Accounts / ledger entries
- Reports with row-level actions
- Settings lists that have per-row actions

## Required Composition

Use:

- `DropdownMenu`
- `DropdownMenuTrigger`
- shadcn `Button` as the trigger
- horizontal-more icon from the configured icon library
- `DropdownMenuContent`
- `DropdownMenuGroup`
- `DropdownMenuItem`
- `DropdownMenuSeparator` before destructive actions when needed

The trigger is an icon-only Button and therefore must follow the SherHisab Tooltip + accessible-name rule.

Recommended trigger:

```text
aria-label="Open actions"
Tooltip: More actions
```

## Menu Structure

Typical pattern:

```text
⋯
├─ View
├─ Edit
├─ Duplicate
├─ Adjust Stock
├─ View Lots
├────────────
├─ Deactivate
└─ Delete
```

Only include actions that are valid for that row and current user/context.

## Destructive Actions

- Put destructive actions at the bottom.
- Separate destructive actions with `DropdownMenuSeparator` when the menu also contains ordinary actions.
- Use the destructive menu variant/state for Delete/Remove or other genuinely destructive actions.
- Opening the menu is not confirmation.
- Actions that require confirmation must still open the appropriate `AlertDialog` / confirmation flow.

## Direct Actions vs Dropdown

For normal SherHisab tables, row-specific actions belong in the `DropdownMenu` even when there are several actions.

Do not place a row full of separate Edit / Delete / Print / View buttons.

A direct action outside the menu is allowed only when it is the table's dominant, extremely frequent workflow and removing the extra click materially improves speed. This must be an intentional exception, not the default.

Examples of possible exceptions:

- selecting a row with Checkbox;
- expanding a row;
- opening a primary clickable entity name/invoice number;
- one high-frequency POS operation where speed is critical.

Even with an exception, keep the `⋯` DropdownMenu for secondary row actions.

## Linkable Identity

When useful, make the primary identity cell clickable:

```text
INV-00452 → opens invoice details
Customer name → opens customer profile
Product name → opens product details
```

This is separate from the row-action menu.

Do not duplicate the same `View` action as both an obvious clickable identity and another permanently visible button.

## Alignment and Density

- Keep the Actions column narrow.
- Right-align or center the trigger consistently across tables.
- Use a compact icon Button size.
- Do not show the word `Actions` inside every row.
- Keep the header label `Actions` or use an accessible visually-hidden label when an unlabeled header produces a cleaner table.
- Preserve sticky action-column behavior when wide tables require horizontal scrolling.

## Data Table Integration

For TanStack/shadcn Data Tables:

- define the Actions column as display-only;
- do not make it sortable;
- do not include it in business-data filtering;
- keep its width stable;
- use the same shared RowActions component/pattern across modules where possible.

# 25A. Popover for Compact Product-Specific Inputs

Use the official shadcn `Popover` when a compact cart/table row needs a small set of additional product-specific fields without permanently expanding the row.

Reference: https://ui.shadcn.com/docs/components/base/popover

This is especially useful in POS / Sales / Purchase rows where different business types require different measurements or attributes.

Examples:

- Fabric: Gauze + Knot
- Fabric: Width + Length
- Wood: Length + Width + Thickness
- Steel: Length + Diameter / Gauge
- Battery: Capacity + Warranty
- Medicine: Batch + Expiry when the workflow requires manual selection
- Furniture/custom goods: Size + Finish when those attributes affect the line item
- Hardware: Piece count + alternate unit conversion detail when needed

The main row stays compact; the Popover exposes only the extra fields for that line.

## Compact Cart Pattern

Example:

```text
Product              Qty    Price      Details
Cotton Fabric        2      ৳450       [Gauze 40 · Knot 12]
                                            ↓
                                      Popover
                                      Gauze [40]
                                      Knot  [12]
                                      [Apply]
```

The trigger should show a concise summary of the current values whenever possible, rather than a vague `Details` label.

Good:

```text
Gauze 40 · Knot 12
6 ft × 4 ft
12V · 100Ah
Batch B-42 · Exp 06/27
```

Less useful:

```text
More
Details
Edit
```

## Official Composition

Use:

- `Popover`
- `PopoverTrigger`
- `PopoverContent`
- `PopoverHeader`
- `PopoverTitle`
- `PopoverDescription` when helpful
- `FieldGroup`
- `Field`
- `FieldLabel`
- shadcn `Input` / `InputGroup` / `Select` / `Combobox` according to the established SherHisab control rules

The official shadcn Popover supports forms inside `PopoverContent`.

## Required Product-Specific Fields

If the extra fields are required to calculate or complete the sale:

- make the incomplete state visible in the cart row;
- do not hide the fact that required information is missing;
- show a small warning/status such as `Details required`;
- prevent final completion when required values are missing;
- when useful, automatically open the Popover immediately after adding that product;
- on validation error, keep/reopen the Popover and focus the invalid field.

The Popover may hide the form fields, but it must not hide the **requirement**.

## Optional Product-Specific Fields

For optional metadata:

- keep the row clean by default;
- open the Popover only when the user chooses to add/edit those values;
- show the summary in the trigger once values exist.

## Calculation Rules

If Gauze/Knot/Length/Width or another product-specific value affects:

- quantity;
- unit conversion;
- sale price;
- line total;
- stock deduction;

then update the visible cart row immediately after Apply/selection.

The row must show the resulting quantity/price/total clearly; the user should not have to reopen the Popover to understand the final financial result.

Business calculations remain domain logic, not Popover-only UI state.

## Apply / Auto-Save

For a tiny local line-item edit, either of these is acceptable:

- explicit `Apply` Button; or
- immediate controlled update when each field is changed.

Prefer explicit Apply when several fields combine to calculate one result, because it prevents half-completed calculations.

If Apply is asynchronous, use the existing Button + Spinner rule:

```text
Apply → Applying…
```

## When Not to Use Popover

Do not use Popover when the extra workflow is too large or important for a small floating surface.

Use:

- `Dialog` for a focused multi-field edit;
- `Sheet` for larger side-panel detail/configuration;
- inline fields when the values are required on nearly every line and hiding them would slow the common workflow.

As a practical rule, Popover is best for a **small, tightly related field set**, usually around 1–4 compact inputs.

## Accessibility / Mobile

- Give the trigger an accessible label.
- Preserve keyboard focus behavior from the official component.
- Keep fields labelled.
- Do not depend on hover.
- On very narrow/mobile POS layouts, ensure the Popover remains usable; if the field set becomes cramped, use the established Sheet/Drawer pattern for that breakpoint.
- Do not allow the floating surface to cover the line total or critical payment controls unnecessarily.

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

Every data screen must distinguish between:

- loading
- true empty
- filtered/search empty
- permission/authorization empty
- error
- retry

Do not render all of these as the same generic message.

## Official shadcn Empty Component

Use the official shadcn `Empty` component for true empty states and no-result states.

Reference: https://ui.shadcn.com/docs/components/base/empty

Use the official composition:

- `Empty`
- `EmptyHeader`
- `EmptyMedia`
- `EmptyTitle`
- `EmptyDescription`
- `EmptyContent`

Use `EmptyMedia variant="icon"` for a restrained icon when an icon helps recognition. Use an avatar/image only when the empty state is about a specific person/entity and the media is meaningful.

## Empty-State Types

### First-use / no records yet

Explain what is missing and give the primary next action.

Examples:

```text
No products yet.
Add your first product to start tracking stock.

[+ Add Product]
```

```text
No customers yet.
Create a customer when you need due tracking or customer history.

[+ Add Customer]
```

### Filtered/search empty

Do not imply the dataset itself is empty.

Example:

```text
No products match these filters.
Try changing the search or clearing one or more filters.

[Clear filters]
```

### Contextual empty

Use specific copy for the current sub-view.

Examples:

```text
No stock lots available.
This product has no remaining FIFO lots.

No payment history yet.
Payments recorded for this customer will appear here.
```

### Permission/availability empty

Use when the user cannot access or use a feature because of permissions/configuration, and provide the correct next action if one exists.

Do not disguise permission errors as "No data".

## Empty Actions

Use `EmptyContent` for the next useful action:

- primary Button to create/add the first record;
- outline/secondary Button for import or alternate setup;
- Clear filters for filtered-empty;
- Input/InputGroup when search is the recovery path;
- semantic link for documentation/help when appropriate.

Use the normal SherHisab Button rules inside Empty states, including icons and Spinner behavior when actions become asynchronous.

## Empty-State Visual Rules

- Keep empty states compact and operational; do not create a large decorative hero inside ERP screens.
- Use at most one simple icon/media element unless the official pattern genuinely benefits from more.
- Do not add decorative gradients, illustrations, or oversized icons.
- Do not use a bordered/boxed Empty by default inside an already bordered table/card; avoid nested boxes.
- Use an outline Empty only when the empty state itself is the primary standalone surface.
- Keep the title short and specific.
- Description should explain what happened and, when useful, what to do next.
- Do not show an action when the user cannot actually perform it.
- Preserve bilingual rendering through SherHisab language components.

## Loading

Use the official shadcn `Skeleton` for structural loading placeholders and `Spinner` for compact active operations.

Do not show the Empty component while the first request is still loading.

## Error

Errors are not Empty states.

Use the appropriate shared error/Alert pattern with:

- clear failure message;
- retry when retry is possible;
- preserve user-entered data where applicable;
- no false "No data" message for network/server failures.

# 35A. Toast Notifications

Use the official shadcn `Toast` component for succinct, temporary feedback that does not need to remain on screen.

Reference: https://ui.shadcn.com/docs/components/base/toast

Install/use the official project toast implementation and mount a single global `Toaster` at the application root. Do not create separate page-level toast systems.

The Base UI implementation supports `default`, `success`, `info`, `warning`, `error`, and `loading` types, actions, and `toast.promise` for asynchronous task progression.

## Use Toast For

| Situation | Toast type | SherHisab example |
| --- | --- | --- |
| Successful mutation | `success` | Product created, changes saved, payment recorded, stock adjusted |
| Non-blocking failure | `error` | Export failed, refresh failed, background save failed |
| Important but non-blocking caution | `warning` | Some rows were skipped during import |
| Informational feedback | `info` | Report is being prepared, copied to clipboard |
| Background async operation | `loading` / `toast.promise` | Importing file, generating report, syncing data |
| Reversible transient action | Toast with action | Item archived + `Undo` when the domain safely supports undo |

## Do Not Use Toast For

- required form-field validation;
- errors that need field-level correction;
- destructive-action confirmation;
- payment/stock/posting confirmation before execution;
- customer due, supplier payable, stock warnings, or other business state that must remain visible;
- legal/compliance information;
- primary page errors that block the entire screen;
- long instructions or multi-paragraph content.

Use inline Field validation for field errors, Alert/ErrorState for persistent blocking problems, and AlertDialog/Dialog for confirmations.

## Success Toast Rules

Use concise, specific success copy:

```text
Product created
Changes saved
Payment recorded
Stock adjusted
Invoice downloaded
Customer updated
```

Do not use vague copy such as `Success!` when the completed action can be named.

Do not show a success toast for every harmless interaction such as opening a menu, changing a tab, selecting a filter, or typing.

## Error Toast Rules

Use a toast only when the error is non-blocking or the surrounding UI already provides the recovery path.

Good:

```text
Export failed
Please try again.
```

Bad:

```text
Something went wrong
```

When the error affects a form submission, preserve the user's input and show field/general form errors in the form as appropriate. A toast may supplement the error but must not be the only explanation when correction is required.

## Loading / Promise Toast

Use `toast.promise` for background tasks where one notification should transition through loading → success/error.

Examples:

- CSV import;
- report generation;
- bulk export;
- long-running synchronization.

For a direct primary action such as `Save`, `Delete`, or `Complete Sale`, keep the existing Button + Spinner pending state. Do not replace the button's local pending feedback with only a loading toast.

## Toast With Action

Use an action only when it is immediately useful and safe, such as `Undo` after an archive operation that is truly reversible.

Do not put destructive confirmation actions inside a toast.

## Toast UX Rules

- Keep title and description short.
- Prefer one useful toast over several duplicate notifications for the same event.
- Do not fire both success and info toasts for one successful operation.
- Avoid toast spam during batch operations; summarize the result.
- Use semantic toast types rather than custom page-specific colors.
- Do not rely on toast alone for information that the user may need to reference later.
- Preserve accessible announcement behavior from the official component.
- Toast content follows SherHisab language mode and should use plain business language.
- Use the global shared toast helper/API so all modules have consistent wording and behavior.

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
