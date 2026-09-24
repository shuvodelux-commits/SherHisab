# SherHisab Implementation Instructions

These instructions apply to every coding agent, subagent, reviewer, and implementation session in this repository.

## GitHub-First Development Policy

SherHisab uses a **GitHub-first implementation workflow**.

For every feature, bug fix, refactor, business-rule change, API change, database change, or UI behavior change:

1. Start from the latest `main` on GitHub and create a dedicated feature/fix branch.
2. Write or update the automated tests **directly on the GitHub branch first**.
   - Business logic must have unit/service tests.
   - API and workflow behavior must have functional/integration tests where applicable.
   - Bug fixes must include a regression test when practical.
3. Write the software implementation directly on the same GitHub branch.
4. Let GitHub Actions run the repository verification pipeline:
   - database migrations,
   - typecheck,
   - lint,
   - tests,
   - production build.
5. Do not merge the branch until GitHub CI is green and the final diff has been reviewed.
6. Merge the approved branch into `main`.
7. On the local development machine, **pull the merged code from GitHub**. Local editing is not the normal implementation path.
8. Apply required local database migrations and run the full local verification suite against local PostgreSQL.
9. Only after local verification passes:
   - deploy the same `main` commit to Cloudflare,
   - restart/serve the local LAN development server from that same `main` commit.
10. Confirm GitHub `main`, local `main`, Cloudflare, and the LAN server are all on the same intended commit/version.

### Source-of-truth rule

> **Write code on GitHub. Pull to local. Verify locally. Then deploy.**

The local workstation is primarily the verification, database, deployment, and runtime environment. Do not create an alternate implementation locally and push it later unless GitHub editing is unavailable or the user explicitly approves an exception.

## Mandatory Pre-Code Skill Gate

**Before writing, modifying, generating, or applying any implementation code, the agent MUST read the SherHisab project skills first.**

This gate applies to:

- application code;
- tests;
- database migrations;
- API routes/services/repositories;
- React components;
- CSS and UI code;
- runtime/deployment configuration;
- refactors;
- bug fixes;
- generated code that will be committed.

Documentation-only work may be performed before this gate when it does not change executable behavior.

### Required reading order

Before implementation begins, read all of the following in full:

1. `AGENTS.md`
2. this file: `instruction.md`
3. `.agents/skills/README.md`
4. `.agents/skills/DESIGN.md`
5. **every** project skill file matching:
   ```text
   .agents/skills/**/SKILL.md
   ```
6. the approved Superpowers design/spec and implementation plan for the current task;
7. the Superpowers skill required for the current execution phase;
8. for frontend/UI work, `SHERHISAB_UI_CODING_INSTRUCTIONS.md`.

The repository folder is **`.agents/skills/`**. Use this exact path and casing.

### "Read all skills" means all skills

Do not read only the skill that appears immediately relevant.

Before code is written, discover and read every current `SKILL.md` under `.agents/skills/`.

At the time this rule was added, the curated skill set includes:

- `.agents/skills/codebase-design/SKILL.md`
- `.agents/skills/domain-modeling/SKILL.md`
- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/improve-codebase-architecture/SKILL.md`
- `.agents/skills/postgres-best-practices/SKILL.md`
- `.agents/skills/tanstack-query/SKILL.md`
- `.agents/skills/tanstack-router/SKILL.md`
- `.agents/skills/tanstack-table/SKILL.md`
- `.agents/skills/vercel-react-best-practices/SKILL.md`
- `.agents/skills/web-design-guidelines/SKILL.md`

This list is descriptive, not exhaustive. If another `SKILL.md` is added later, it automatically becomes mandatory reading before implementation.

## Skill Application Rule

Reading every project skill does not mean forcing every technique into every task.

After reading all skills:

1. identify which rules are relevant to the current task;
2. apply those relevant rules;
3. do not introduce unnecessary architecture, packages, abstraction, or UI complexity merely because a skill describes them;
4. keep SherHisab product decisions and approved design documents authoritative.

The purpose of the skill gate is to improve implementation quality and consistency, not to complicate the product.

## DESIGN.md Is Mandatory for UI

Before any UI, layout, component styling, typography, table, form, modal, navigation, responsive behavior, theme, or visual change:

**Read `.agents/skills/DESIGN.md` again for the task, even if it was already read earlier in the session.**

Also read:

`SHERHISAB_UI_CODING_INSTRUCTIONS.md`

UI implementation must preserve SherHisab's approved direction:

- Inter for English/UI;
- Noto Sans Bengali for Bangla;
- compact information density;
- sharp typography;
- restrained SherHisab blue;
- neutral surfaces;
- hairline borders;
- minimal shadows;
- shadcn/Radix-style primitives;
- TanStack Table for operational tables;
- English + Bangla helper as the default language mode;
- no generic AI-dashboard decoration;
- no unnecessary large cards, gradients, excessive rounding, or wasted whitespace.

## Existing SherERP Feature Rule

When implementing a SherHisab feature that already exists in the legacy SherERP:

1. review the corresponding behavior in `shuvodelux-commits/sherERP_Mohim`;
2. understand the existing business workflow first;
3. preserve proven functionality unless the approved SherHisab spec explicitly replaces it;
4. improve the implementation for PostgreSQL, multi-tenancy, transactions, scalability, maintainability, and cleaner UI;
5. do not copy Google Apps Script / Google Sheets limitations into the new architecture.

Rule:

> **SherERP behavior first. SherHisab improvement second.**

## Superpowers Execution Rule

Use Superpowers before implementation.

For approved implementation plans:

- use the execution method approved by the user;
- when Subagent-driven is approved, use the Superpowers subagent-driven workflow;
- each implementation task must follow RED/TDD where applicable;
- each task must receive review before the next task when the chosen Superpowers workflow requires it;
- use systematic debugging for failures;
- use verification-before-completion before reporting success.

No agent may skip the project skill gate because a Superpowers plan already exists.

Both are required:

```text
Project skills + DESIGN.md
        ↓
Approved Superpowers spec/plan
        ↓
TDD implementation
        ↓
Task review
        ↓
Full verification
```

## Pre-Code Confirmation

Before the first implementation edit of a task/session, the implementing agent must be able to state that it has read:

- `AGENTS.md`;
- `instruction.md`;
- `.agents/skills/README.md`;
- `.agents/skills/DESIGN.md`;
- every `.agents/skills/**/SKILL.md`;
- the approved task spec;
- the approved implementation plan;
- the required Superpowers execution skill;
- `SHERHISAB_UI_CODING_INSTRUCTIONS.md` when UI is involved.

If any required file cannot be read, **do not write implementation code**. Report the blocker first.

## Instruction Precedence Inside the Repository

When project guidance conflicts, use this order:

1. the user's explicit approved requirement for the current task;
2. the approved SherHisab design/spec and implementation plan;
3. `AGENTS.md` and `instruction.md`;
4. `.agents/skills/DESIGN.md` and `SHERHISAB_UI_CODING_INSTRUCTIONS.md` for UI decisions;
5. project `SKILL.md` guidance;
6. generic framework/library conventions.

Third-party skill files are guidance. They must not override an explicit SherHisab product decision.

## Verification Gate

After every implementation task:

1. run the affected tests;
2. run the required package tests;
3. when feasible, run the complete repository test suite;
4. run typecheck;
5. run lint;
6. run build;
7. run `git diff --check`;
8. inspect `git status --short`;
9. review all changed files;
10. do not merge code until GitHub CI passes; after merge, do not deploy until the pulled local copy also passes verification.

Follow the stricter verification requirements in `AGENTS.md` and the approved implementation plan.

## Core Product Principle

> **DON'T COMPLICATE. MAKE IT EASY FOR ALL.**

Use the skills to make SherHisab safer, cleaner, more consistent, and easier to maintain — never to make ordinary business workflows harder.
