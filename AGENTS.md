# SherHisab Agent Development Rules

These rules apply to every coding agent working in this repository.

## Mandatory Project Skill Gate

Before writing or modifying any implementation code, every agent/subagent must follow `instruction.md`.

That means, at minimum, reading:

- `.agents/skills/README.md`
- `.agents/skills/DESIGN.md`
- every `.agents/skills/**/SKILL.md`
- the approved Superpowers spec/plan and execution skill
- `SHERHISAB_UI_CODING_INSTRUCTIONS.md` for UI work

If any required instruction/skill file cannot be read, stop before implementation and report the blocker.

## Core Rule

**Do not push generated or modified code to GitHub until it has been verified.**

For every feature, bug fix, refactor, runtime configuration change, or other code change:

1. Use the relevant **Superpowers** workflow before implementation.
2. For behavior changes and bug fixes, follow **Superpowers TDD**:
   - write or update the test first,
   - confirm the test fails for the expected reason,
   - make the minimal implementation,
   - confirm the test passes.
3. Run the tests for the affected package or module.
4. Run TypeScript type checking.
5. When feasible, run the **full repository test suite**, not only the changed package.
6. Review the final diff and verify there are no unexpected files or regressions.
7. Only after fresh verification succeeds may the change be committed/pushed to GitHub.

## Required Verification Before Push

At minimum, for code changes:

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
- Never push code based only on inspection or confidence.
- Read the complete test/typecheck output and confirm the exit code is successful.
- If tests or type checking fail, fix the issue and re-run verification before pushing.
- If the current environment cannot run the required verification, **do not push the code**. Report the blocker and get verification from a suitable local/CI environment first.

## Failure Handling

When a test, type check, build, or runtime check fails:

1. Use **Superpowers systematic debugging**.
2. Identify the root cause before modifying code.
3. For bugs, add a regression test first where applicable.
4. Re-run the affected test.
5. Re-run the full verification required above before push.

## Git Discipline

Before pushing:

```bash
git status --short
git diff --check
```

Confirm only intended files changed.

Do not use force-push for normal implementation work.

## Documentation-Only Changes

Documentation-only changes may be committed without running the application test suite unless they affect executable examples, generated configuration, or tooling behavior. Verify the changed document itself before committing.

## SherHisab Principle

**DON'T COMPLICATE. MAKE IT EASY FOR ALL.**

Keep architecture simple, business logic serious, and verification mandatory.
