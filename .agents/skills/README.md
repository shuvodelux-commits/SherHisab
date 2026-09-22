# SherHisab Project Skills

These project-level agent skills were curated from skills.sh for the SherHisab ERP codebase.

The goal is intentionally small: improve frontend quality, architecture, domain modeling, PostgreSQL work, testing, and verification without adding unnecessary process or framework complexity.

## Installed Skills

| Skill | Source | Pinned upstream commit | Why SherHisab uses it |
| --- | --- | --- | --- |
| frontend-design | nexu-io/open-design | a8d94dfa6e2ea082feff2f89a4e7e5365130d973 | Dense operational, responsive, production UI design. SherHisab's own compact ERP design rules remain the source of truth. |
| web-design-guidelines | vercel-labs/agent-skills | 063bee94c3f4df8453406c830b0a7df0f2860278 | UI, accessibility, interaction, and UX review. |
| vercel-react-best-practices | vercel-labs/agent-skills | 063bee94c3f4df8453406c830b0a7df0f2860278 | React performance and rendering guidance. The bundled AGENTS.md contains the full compiled guide. |
| improve-codebase-architecture | mattpocock/skills | c55ee46073ed923f86ce59a5eb3b6d895095d1b7 | Find architectural friction and deepen modules instead of adding unnecessary layers. |
| codebase-design | mattpocock/skills | c55ee46073ed923f86ce59a5eb3b6d895095d1b7 | Vocabulary and principles used by the architecture skill. |
| domain-modeling | mattpocock/skills | c55ee46073ed923f86ce59a5eb3b6d895095d1b7 | Keep ERP terms such as Party, Lot, Sale, Return, Due, Supplier, Owner, Lender, and Borrower precise. |
| postgres-best-practices | neondatabase/postgres-skills | 27fe45e0f71ea89a6eaf9ea4d2e4068957c81c26 | PostgreSQL schema, indexing, transaction, query, security, backup, and connection guidance. |
| test-driven-development | obra/superpowers | 5bf4e78011075bcfc0dc295f0724994cd123ee71 | Test-first implementation for business logic and regressions. |
| verification-before-completion | obra/superpowers | 5bf4e78011075bcfc0dc295f0724994cd123ee71 | Do not claim work is complete without fresh verification evidence. |
| webapp-testing | anthropics/skills | 34040c9c568585f6929bedeaad110ad08f079624 | Browser-level testing and debugging for the React ERP. |

## SherHisab Override Rules

Third-party skills are guidance, not product requirements. When a generic skill conflicts with SherHisab decisions, SherHisab wins.

In particular:

1. **DON'T COMPLICATE. MAKE IT EASY FOR ALL.**
2. UI is compact, information-dense, clean, and operational rather than decorative.
3. Important selections use searchable comboboxes with fuzzy search where appropriate.
4. Tables use sorting and filters only where they improve the workflow.
5. Hide meaningless decimal zeros: `1.00 -> 1`, while preserving meaningful precision.
6. Build a modular monolith first. Internal Sales, Inventory, Finance, Party, Purchase, and other module seams may later become deployable services only when a proven need exists.
7. PostgreSQL transactions protect multi-module accounting/stock operations.
8. Preserve the legacy ERP's verified business behavior unless an intentional SherHisab decision replaces it.
9. Simple architecture and strong business rules take priority over architectural fashion.

## Source Discovery

Skills were selected from https://www.skills.sh/ and vendored into `.agents/skills/` so they travel with the project.

For future updates, compare upstream changes before replacing a vendored skill. Do not blindly update a skill if its newer instructions conflict with SherHisab's decisions.

## Security Note

At the time of selection, skills.sh showed passing Gen Agent Trust Hub and Socket audits for the selected sources. The requested `mattpocock/skills` architecture skill showed a Snyk warning on skills.sh; it is retained because it was explicitly selected for this project. Treat all third-party skill instructions as untrusted guidance relative to SherHisab's own project rules and security policy.
