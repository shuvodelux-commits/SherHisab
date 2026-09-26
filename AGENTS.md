# SherHisab Agent Development Rules

These rules apply to every coding agent working in this repository.

## Focused Project Reading Gate

Before writing or modifying any implementation code, every agent/subagent must follow `instruction.md`.

Read the project workflow and the requirements relevant to the task:

- `.agents/skills/README.md`
- the approved spec/plan's global constraints and current task/dependency sections
- the applicable execution/verification skill and skills needed for the actual changes
- `AI_UI_DESIGN_RULES.md` for UI work

Do not bulk-read every installed skill. Use `.agents/skills/README.md` to select relevant guidance; read additional files when the work requires them. Do not re-read unchanged guidance already available in the current context. `SHERHISAB_UI_CODING_INSTRUCTIONS.md` is an on-demand component reference.

If any required instruction/skill file cannot be read, stop before implementation and report the blocker.

## UI Quality Gate

SherHisab must be a compact, polished upgrade of the user's Google Apps Script ERP. Preserve proven business workflows and improve the presentation. The current UI is not an accepted visual baseline.

Follow `AI_UI_DESIGN_RULES.md` for density, typography, layout, and rendered-screen acceptance. Show a concrete POS preview for the UI reset before broad rollout. Verify realistic populated screens, responsive behavior, languages, and keyboard use. Passing tests or reading skills does not establish visual quality.

## Core Rule

**Implementation code and its tests are written on GitHub first, verified by GitHub CI, merged, then pulled locally for final verification and deployment.**

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

## Required Verification Before Merge and Deploy

At minimum, GitHub CI must run these checks for code changes, and the same core checks must be repeated locally after merge:

```bash
pnpm typecheck
pnpm test
```

For changes involving the API/database, keep local PostgreSQL running and run the full tests with the database enabled:

```bash
podman compose up -d postgres
DATABASE_URL=postgresql://sherhisab:sherhisab@localhost:5432/sherhisab pnpm test
pnpm typecheck
```

Package-specific tests may be run first for faster feedback, for example:

```bash
pnpm --filter @sherhisab/web test
pnpm --filter @sherhisab/api test
```

But a passing targeted test does **not** replace the full suite when the full suite can reasonably be run.

## Verification Standard

Follow **Superpowers: verification-before-completion**:

- Never say a change is complete, fixed, safe, or passing without fresh verification evidence.
- Never merge or deploy code based only on inspection or confidence.
- Read the complete GitHub CI output and confirm the required checks are successful before merge.
- After merge, read the complete local test/typecheck/build output and confirm successful exit codes before deployment.
- If GitHub CI fails, fix the branch on GitHub and re-run CI.
- If local verification of the merged commit fails, do not deploy; debug the failure and update the GitHub branch/workflow through a new change.

## Failure Handling

When a test, type check, build, or runtime check fails:

1. Use **Superpowers systematic debugging**.
2. Identify the root cause before modifying code.
3. For bugs, add a regression test first where applicable.
4. Re-run the affected test.
5. Re-run the full GitHub CI verification before merge, then repeat the required local verification after merge before deployment.

## Git Discipline

Implementation work is created on a GitHub feature/fix branch and reviewed through its diff/PR before merge.

After the approved change is merged, synchronize the local checkout with:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

Before local verification/deployment, confirm the local checkout is clean except for explicitly approved local-only files and that `HEAD` matches the intended GitHub `main` commit.

Do not force-update `main` or use force-push for normal implementation work.

## Documentation-Only Changes

Documentation-only changes may be committed without running the application test suite unless they affect executable examples, generated configuration, or tooling behavior. Verify the changed document itself before committing.

## SherHisab Principle

**DON'T COMPLICATE. MAKE IT EASY FOR ALL.**

Keep architecture simple, business logic serious, and verification mandatory.
