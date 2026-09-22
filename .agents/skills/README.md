# SherHisab Project Skills

These project-level agent skills are intentionally curated for the SherHisab ERP.

The rule is simple: keep only skills that directly help the approved stack and product workflow. Do not add skills just because they exist.

## Installed Skills

| Skill | Source | Pinned upstream commit | SherHisab use |
| --- | --- | --- | --- |
| frontend-design | nexu-io/open-design | a8d94dfa6e2ea082feff2f89a4e7e5365130d973 | Compact, dense, responsive, production UI design. |
| web-design-guidelines | vercel-labs/agent-skills | 063bee94c3f4df8453406c830b0a7df0f2860278 | Accessibility and UI/UX review. |
| vercel-react-best-practices | vercel-labs/agent-skills | 063bee94c3f4df8453406c830b0a7df0f2860278 | React performance and rendering guidance. |
| tanstack-query | tanstack-skills/tanstack-skills | 6f5521ecbdfbfa3d54d335eba6c8b4df0b804c03 | Server-state fetching, caching, invalidation, mutations, pagination. |
| tanstack-table | tanstack-skills/tanstack-skills | 6f5521ecbdfbfa3d54d335eba6c8b4df0b804c03 | Compact ERP tables, sorting, filtering, pagination, fuzzy filtering and column state. |
| tanstack-router | tanstack-skills/tanstack-skills | 6f5521ecbdfbfa3d54d335eba6c8b4df0b804c03 | Type-safe Vite/React routing and URL search/filter state. |
| improve-codebase-architecture | mattpocock/skills | c55ee46073ed923f86ce59a5eb3b6d895095d1b7 | Review architecture when real friction appears; do not use it to add unnecessary layers. |
| codebase-design | mattpocock/skills | c55ee46073ed923f86ce59a5eb3b6d895095d1b7 | Supporting architecture vocabulary used by the architecture skill. |
| domain-modeling | mattpocock/skills | c55ee46073ed923f86ce59a5eb3b6d895095d1b7 | Keep ERP business terminology precise. |
| postgres-best-practices | neondatabase/postgres-skills | 27fe45e0f71ea89a6eaf9ea4d2e4068957c81c26 | PostgreSQL schema, indexing, transactions, security and operations. |

## Deliberately Not Vendored

The following were removed from this project-local folder because they are redundant with the installed Superpowers workflow or not specific enough to justify carrying another project copy:

- test-driven-development
- verification-before-completion
- webapp-testing

SherHisab can still use the installed Superpowers testing and verification skills when needed.

## SherHisab Override Rules

Third-party skills are guidance, not product requirements. SherHisab decisions always win.

1. **DON'T COMPLICATE. MAKE IT EASY FOR ALL.**
2. Use compact, information-dense UI without hurting readability.
3. Important selections use searchable comboboxes; use fuzzy search where useful.
4. Tables use sorting and filters only where they improve the workflow.
5. Hide meaningless decimal zeros: `1.00 -> 1`, while preserving meaningful precision.
6. Frontend stack: React + TypeScript + Vite + shadcn/ui + TanStack Router + TanStack Query + TanStack Table.
7. Backend stack remains Hono + PostgreSQL.
8. Cloudflare is the first deployment target; the same business code must remain portable to Node/Docker/VPS.
9. Build a modular monolith first. Sales, Inventory, Finance, Party, Purchase and other module seams may become separate services only when a proven need exists.
10. PostgreSQL transactions protect multi-module stock/accounting operations.
11. Preserve verified legacy ERP behavior unless an explicit SherHisab decision replaces it.
12. Do not add TanStack Start, TanStack Form, TanStack Virtual, TanStack Store, or other TanStack packages until a concrete requirement justifies them.

## Skill Update Policy

Before updating any vendored skill:

1. compare the upstream change,
2. review the new instructions,
3. keep SherHisab project rules authoritative,
4. do not blindly upgrade project skills.

## Security

skills.sh is a third-party skill directory. Review skill source before use. The TanStack Query, Table, and Router skills selected for SherHisab were chosen from the TanStack-focused skill repository and pinned to a specific upstream commit.
