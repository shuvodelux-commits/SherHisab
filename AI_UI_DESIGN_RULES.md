# SherHisab AI UI Design Rules

**Updated:** 2026-09-26 · **Owner direction:** compact, polished, easy daily ERP work.

This is the single visual rulebook for AI agents working on SherHisab. Read it for UI work. Read component references and skills only when the task needs them. A passing test suite proves behavior; rendered screens and actual use must also prove UI quality.

## 1. Product promise

Build the polished successor to the user's Google Apps Script ERP. Preserve its useful business workflows and improve how easily people see, understand, and complete them. The user has rejected the current visual quality; existing screens are evidence to inspect, not an accepted design target.

**Compact means more useful work visible with readable text, clear grouping, and fewer unnecessary steps.** Achieve it through layout and progressive disclosure. Keep required information, validation, and financial accuracy intact.

The audience is shop owners, cashiers, and staff doing repeated work. Prioritize product search, editable rows, amounts, balances, and the next action. Every visible element must help that work.

## 2. Source of truth and focused reading

Use the user's latest direction, then this rulebook for visual decisions. The approved feature spec governs business behavior. If they genuinely conflict, identify the exact conflict before changing business behavior.

| Source | Use it for |
| --- | --- |
| [Legacy POS](legacy/google-apps-script-reference/2026-09-22/pos.html) and the corresponding legacy feature | Workflow, field meaning, fast counter interactions; inspect the rendered screen when comparing appearance. |
| This document | Compact layout, visual hierarchy, typography, density, and acceptance. |
| Latest user-accepted screen preview | Concrete visual target. Record its screenshot/link, viewport, and date in the task. |
| Existing shared components | Accessible behavior and consistent implementation; inspect before adding variants. |
| [Component reference](SHERHISAB_UI_CODING_INSTRUCTIONS.md) | Relevant component details only; this rulebook wins when guidance conflicts. |

The old Tailark gallery extraction is not the ERP layout authority. Marketing layouts, large display headings, and gallery spacing do not become ERP requirements. External references may support a specific choice; explain what is borrowed and why it helps this workflow.

Do not read every installed skill or restart research for an already accepted pattern. Follow [instruction.md](instruction.md) and the [skill map](.agents/skills/README.md). Reading more files is not a UI deliverable.

## 3. Compact visual defaults

These are design targets for normal desktop use at 100% zoom. Content, translation, zoom, and touch may require more height; never clip content to satisfy a number.

| Element | Default |
| --- | --- |
| English font | Geist Variable; Inter/system sans fallback. |
| Bangla font | SolaimanLipi; Noto Sans Bengali fallback. Verify that the font actually loads. |
| Body, inputs, labels, tables, buttons | 14px; about 20px line height, with enough height for Bangla glyphs. |
| Page/section title | 16px, weight 600. Use alignment and weight for hierarchy. |
| Secondary metadata | 12–13px English; keep Bangla helpers readable at 14px. Never shrink working amounts or inputs to metadata size. |
| Desktop input, select, button | 34–36px high. |
| Ordinary table row | 36–40px; taller only for meaningful wrapped content or an expanded editor. |
| Icon action | 16px icon inside a 28–32px desktop hit area, with spacing and an accessible name. |
| Touch controls | At least 44px hit area; reflow the layout to make room. |
| Spacing | 4px rhythm; 8–12px within/between related controls. |
| Page / panel padding | 12–16px / 12px. Avoid extra wrappers that multiply padding. |
| Radius | 6px controls, 8px panels, 10–12px dialogs. |
| Borders / shadows | 1px borders; shadows only where floating layers need separation. |
| Color | Neutral surfaces, restrained existing SherHisab blue for primary/active states; semantic colors for actual status. |
| Money and quantity | Right aligned, tabular numerals in the UI font. Preserve meaningful precision; display `1.00` as `1`. Monospace is for technical identifiers. |

Reuse shared tokens and variants. Avoid page-specific font, radius, and color systems. Support light and dark themes with readable text, focus, and status contrast.

## 4. Screen composition

- Use available workspace width. One compact page heading, a purposeful toolbar, then the work surface. Avoid duplicate titles and introductory prose on routine screens.
- Make one primary action obvious within each active workflow. Group secondary actions; reserve destructive styling for destructive actions.
- Default to aligned rows, sections, and dividers. Use a card only when its boundary explains a distinct interaction or object. Avoid cards inside cards.
- Align labels, fields, column headers, numbers, and actions to shared edges. Keep row actions in a consistent location.
- Show common fields immediately. Put infrequent fields in a clearly labelled disclosure. Automatically reveal a section containing an error or newly required input.
- Keep visible labels; placeholders are examples, not the only label. Use searchable comboboxes for large entity lists.
- Preserve the existing shadcn sidebar's navigation, collapse, focus, and mobile behavior. Apply shared density carefully; extra page headers must not consume the working area.
- Use concise business language. Keep implementation details, internal IDs, and explanations of architecture out of ordinary user flows.

## 5. ERP patterns

### POS

- Preserve the desktop Product search workspace and Customer/Cart/Checkout workspace. Give cart editing and checkout enough width for readable names and aligned amounts.
- Keep search prominent. Present Drafts and Templates as compact entry points; open management controls on demand. Reprint stays easy to reach without dominating Product results.
- Keep product cards/results short and consistent: name, variant when relevant, price, stock, and unit. Avoid decorative images, large badges, and duplicated metadata.
- Put Customer Name and Phone on the same row when width permits. Keep optional Guardian/Address collapsed. Show Due/Credit clearly when relevant.
- Use a compact cart table with a stable ordinary row. Place conversion, tracking, and shortage editors directly beneath the affected row, preserving the feature spec's order and required visibility.
- Show payment rows and financial totals as aligned groups. Support every existing payment line and business state. Complete Sale is the primary action; Save Draft is secondary.
- Prefer one intentional scroll region per workspace. Keep totals/actions reachable; sticky regions must never cover the last row, an error, or a focused field.

### Lists, forms, and details

- Products, parties, invoices, and ledgers use compact operational tables. Put search/filter controls together; keep sorting, selection, pagination, and row actions predictable.
- Right align quantities and money. Give names useful width. Long names must remain discoverable without relying only on hover; never truncate an amount silently.
- Use short, aligned form groups, with two columns only when field width remains usable. Prefer a focused dialog for short tasks and a page for substantial editing.
- Details and reports prioritize the actual record, balance, or table. Add summary metrics only when they help a decision on that screen.
- Keep loading, empty, error, disabled, permission-limited, and saving states compact and informative. Never leave stale totals looking current during recalculation.

## 6. Language, keyboard, and responsive behavior

- Preserve all three language modes: English + Bangla helper, English, and Bangla. Use the shared bilingual component. Keep short helpers inline when readable; allow longer text to wrap. User-entered data is not translated.
- Preserve scan/search → select → quantity → payment → complete keyboard flow. Focus must be visible and restored after dialogs; icon actions need accessible names.
- At narrow widths, reflow groups and provide clear access between Product search and Cart. Contain wide-table scrolling within the table; avoid whole-page horizontal overflow.
- Check zoom, long Bangla labels, touch use, and the mobile keyboard. Readability and required controls take priority over fitting everything into one viewport.

## 7. Reject these outcomes

- Huge page titles, welcome/hero sections, decorative KPI rows, gradients, glass effects, oversized rounded cards, or empty padding around ordinary ERP work.
- A copied legacy screen with only new colors; the upgrade must improve grouping, alignment, density, and interaction consistency.
- Tiny text, cramped hit targets, hidden required fields, or removed functionality presented as compactness.
- Every action styled as primary, every status in a large badge, or optional editors permanently expanded.
- A screen demonstrated only with empty data, English-only labels, short product names, or an unusually large monitor.
- Claims such as “polished” or “done” based only on code review, component-library usage, or green tests.

## 8. Required design and visual review

Before coding, write a short task brief: the user's work, the legacy behavior to preserve, the current layout problem, what stays visible, what opens on demand, and the intended improvement. Name the actual reference and shared components. Keep this to a few bullets in the task or PR.

For the current UI reset, prepare one representative POS preview before spreading the pattern across the ERP. Show it with realistic data and make it reviewable. Record the user's visual acceptance of that concrete preview before broad rollout. Existing acceptance remains valid for later screens using the same pattern; do not repeatedly request approval for routine changes.

After rendering, inspect and correct the actual result:

| Check | Evidence required |
| --- | --- |
| Ordinary desktop sale | At 1366×768 and 1280×720, show six ordinary cart lines, a selected Customer, and one payment. Target six visible rows plus totals and Complete Sale with optional sections closed. Record any necessary scroll; do not reduce font size or hide required information to pass. |
| Complex sale | Show long English/Bangla names, compound quantity, required tracking/shortage editing, multiple payments, large amounts, and validation. No overlap, clipped amount, or lost action. |
| Responsive | Check 1024×768 and 390×844, plus desktop 200% zoom. Necessary content reflows or scrolls within its intended region; focus and checkout remain reachable. |
| Shared styles | Verify light/dark and all language modes on affected patterns; inspect fonts, row heights, alignment, contrast, and focus. |
| Improvement over baseline | Capture before/after at the same viewport, theme, language, and comparable data. Identify concrete improvements and unresolved defects. |

Use representative test/demo data and label it as such. Save screenshots or a usable preview link with the task/PR, identifying the commit and viewport. Inspect the images yourself and fix visible defects before handoff. If browser inspection is unavailable, state that visual verification is pending; do not claim visual completion.

Keep functional verification under [AGENTS.md](AGENTS.md). Test observable behavior when it changes; CSS class assertions alone do not prove appearance. Report functional verification and visual acceptance separately.

**Completion standard: familiar work becomes clearer and faster in a visibly compact, consistent interface.**
