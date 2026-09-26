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

## Focused Pre-Code Reading Gate

Before implementation, read `AGENTS.md`, this file, and `.agents/skills/README.md`. Then read the approved spec/plan's global constraints, the current task, and the business/dependency sections needed to implement it correctly.

Select skills for the work being changed: database guidance for SQL, query guidance for fetching, table guidance for table behavior, and so on. Read a selected skill's instructions and follow its applicable references. Do not load every installed skill or unrelated reference directory as a ritual. Adding a skill does not expand mandatory reading for unrelated tasks.

Read unchanged guidance once while it remains available in context. Re-read when it changed, context was lost, or a specific question needs it. A task spanning domains needs the relevant guidance for each affected domain.

This gate applies to application code, tests, migrations, UI, configuration, generated code, and refactors. Documentation-only work may be performed before the implementation gate when it does not change executable behavior.

If a file genuinely required for the task cannot be read, report the exact missing file before implementation. An unavailable optional design gallery or unrelated skill is not a blocker.

## UI Direction and Acceptance

Read [AI_UI_DESIGN_RULES.md](AI_UI_DESIGN_RULES.md) for UI work. It is the single visual rulebook: compact, readable, polished ERP screens that improve the user's Google Apps Script ERP workflows.

- `.agents/skills/DESIGN.md` maps references; it is not another visual specification.
- `SHERHISAB_UI_CODING_INSTRUCTIONS.md` is a component reference. Read the needed section only.
- Use Geist Variable for English and SolaimanLipi for Bangla, with the fallbacks defined in the UI rules.
- Inspect existing shared components and the corresponding legacy workflow before changing them.
- Keep the design brief short and specific to the user's work. Preserve required business information while reducing repeated labels, padding, wrappers, and permanently expanded optional controls.
- For the UI reset, show a concrete populated POS preview and record visual acceptance before broad rollout. Reuse that accepted pattern for later screens.
- Inspect rendered screens at the defined viewports, with real or representative data, language modes, themes, keyboard use, and error states. Capture comparable before/after evidence and correct visible defects.
- Report functional verification and visual acceptance separately. Reading skills and passing automated tests do not prove the screen looks good.

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

Use the focused reading gate above. Follow the user's current execution preference: continue without subagents unless they change it.

Before the first implementation edit, identify the task's requirements, relevant guidance, affected files, and verification needed. Keep this brief; do not narrate a long reading inventory.

## Instruction Precedence Inside the Repository

The user's explicit current requirement takes precedence over repository guidance. `AGENTS.md` and this file govern the development workflow; the approved feature spec governs business behavior; `AI_UI_DESIGN_RULES.md` governs visual design. Relevant plan steps implement those requirements.

The UI rules supersede older visual prescriptions in plans, gallery references, and the component manual. They do not silently change business behavior. Surface an actual business/design conflict before changing the workflow.

Third-party skills and generic framework conventions support these decisions. They must not override explicit SherHisab product requirements.

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
