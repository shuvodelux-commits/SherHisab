# SherHisab Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first working SherHisab foundation with React, Hono, PostgreSQL, tenancy, authentication, responsive app shell, and Cloudflare/VPS portability.

**Architecture:** One modular monolith with a React frontend, Hono backend, PostgreSQL database, and shared business modules. Cloudflare and Node/VPS use the same core application code.

**Tech Stack:** React, TypeScript, Vite, shadcn/ui, TanStack Router, TanStack Query, TanStack Table, Hono, PostgreSQL, pnpm, Podman.

**Spec:** `docs/superpowers/specs/2026-09-22-foundation-tenancy-auth-shell-design.md`

## Global Constraints

- Keep architecture simple.
- Multi-tenant from day one.
- Never trust `tenant_id` from request bodies.
- Use PostgreSQL transactions for atomic work.
- Use secure HttpOnly session cookies.
- Keep business logic runtime-independent.
- Support Cloudflare and VPS from the beginning.
- Use compact responsive UI.

## Review Focus

- Tenant isolation: one tenant must never read or modify another tenant's data.
- Session security: unauthenticated and expired sessions must be rejected.
- Runtime portability: the same Hono application must work on Cloudflare and Node/VPS.
- Responsive shell: desktop, tablet, and mobile layouts must remain usable without duplicated applications.
- Database failures: failed multi-step operations must rollback cleanly.

---

### Task 1: Workspace and Project Structure

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/web/`
- Create: `apps/api/`
- Create: `packages/shared/`

**Produces:**
- pnpm workspace
- shared TypeScript configuration
- clean app boundaries

- [ ] Create the pnpm workspace.
- [ ] Add root scripts for dev, build, typecheck, lint, and test.
- [ ] Add shared TypeScript configuration.
- [ ] Verify workspace commands run.
- [ ] Commit: `chore: initialize sherhisab workspace`

### Task 2: React Frontend Foundation

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/query-client.ts`
- Create: `apps/web/src/styles.css`

**Produces:**
- React + Vite frontend
- TanStack Router
- TanStack Query

- [ ] Scaffold React + TypeScript with Vite.
- [ ] Configure TanStack Router.
- [ ] Configure TanStack Query.
- [ ] Add base responsive styles.
- [ ] Add a frontend smoke test.
- [ ] Run tests and build.
- [ ] Commit: `feat: add react application foundation`

### Task 3: Hono API Foundation

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/runtime/node.ts`
- Create: `apps/api/src/runtime/cloudflare.ts`
- Create: `apps/api/test/health.test.ts`

**Produces:**
- shared Hono application
- Node runtime entry
- Cloudflare runtime entry
- `/api/health`

- [ ] Write failing health route test.
- [ ] Implement `/api/health`.
- [ ] Add Node runtime adapter.
- [ ] Add Cloudflare runtime adapter.
- [ ] Run tests.
- [ ] Commit: `feat: add hono api foundation`

### Task 4: PostgreSQL Local Development

**Files:**
- Create: `compose.yaml`
- Create: `db/migrations/001_foundation.sql`
- Create: `apps/api/src/db/pool.ts`
- Create: `apps/api/src/db/transaction.ts`
- Create: `apps/api/test/db.test.ts`

**Produces:**
- PostgreSQL through Podman
- database connection helper
- transaction helper

- [ ] Define PostgreSQL service in `compose.yaml`.
- [ ] Start PostgreSQL with Podman.
- [ ] Add database environment variables.
- [ ] Add `pg` connection pool.
- [ ] Add transaction helper.
- [ ] Verify API can connect to PostgreSQL.
- [ ] Add rollback test proving failed transactions leave no partial data.
- [ ] Commit: `feat: add postgres foundation`

### Task 5: Tenant Foundation

**Files:**
- Create: `db/migrations/002_tenants.sql`
- Create: `apps/api/src/modules/tenants/tenant.types.ts`
- Create: `apps/api/src/modules/tenants/tenant.repository.ts`
- Create: `apps/api/src/modules/tenants/tenant.service.ts`
- Create: `apps/api/test/tenants/tenant-isolation.test.ts`

**Produces:**
- tenant table
- tenant repository
- tenant service

- [ ] Write tenant isolation test.
- [ ] Create tenant migration.
- [ ] Implement tenant repository.
- [ ] Implement tenant service.
- [ ] Verify tenant-scoped queries.
- [ ] Commit: `feat: add tenant foundation`

### Task 6: User and Authentication Foundation

**Files:**
- Create: `db/migrations/003_users_sessions.sql`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.repository.ts`
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Create: `apps/api/src/modules/auth/password.ts`
- Create: `apps/api/src/modules/auth/session.ts`
- Create: `apps/api/test/auth/auth.test.ts`

**Produces:**
- users
- password hashing
- login
- logout
- secure session cookies
- session validation

- [ ] Write failing authentication tests.
- [ ] Create user/session schema.
- [ ] Implement password hashing.
- [ ] Implement login.
- [ ] Implement HttpOnly session cookie.
- [ ] Implement logout.
- [ ] Reject expired/invalid sessions.
- [ ] Run tests.
- [ ] Commit: `feat: add authentication foundation`

### Task 7: Tenant Context Middleware

**Files:**
- Create: `apps/api/src/middleware/auth-context.ts`
- Create: `apps/api/src/types/context.ts`
- Create: `apps/api/test/auth/tenant-context.test.ts`

**Produces:**
- authenticated user context
- trusted tenant context

- [ ] Write test proving request body `tenant_id` cannot override session tenant.
- [ ] Implement authenticated context middleware.
- [ ] Attach trusted `userId` and `tenantId` to Hono context.
- [ ] Protect private routes.
- [ ] Run tests.
- [ ] Commit: `feat: add trusted tenant request context`

### Task 8: App Shell

**Files:**
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/sidebar.tsx`
- Create: `apps/web/src/components/topbar.tsx`
- Create: `apps/web/src/routes/_authenticated.tsx`
- Create: `apps/web/src/routes/_authenticated/index.tsx`

**Produces:**
- compact desktop shell
- tablet layout
- mobile drawer layout

- [ ] Add authenticated route layout.
- [ ] Build compact sidebar.
- [ ] Build compact top bar.
- [ ] Add responsive mobile drawer.
- [ ] Add dashboard placeholder.
- [ ] Test desktop/mobile rendering.
- [ ] Commit: `feat: add responsive application shell`

### Task 9: Shared UI Utilities

**Files:**
- Create: `apps/web/src/lib/format-number.ts`
- Create: `apps/web/src/components/ui/search-combobox.tsx`
- Create: `apps/web/src/components/ui/data-table.tsx`
- Create: `apps/web/src/lib/fuzzy-search.ts`

**Produces:**
- smart number formatting
- searchable combobox
- reusable compact table
- fuzzy search helper

- [ ] Write number-format tests.
- [ ] Implement trailing-zero removal.
- [ ] Add fuzzy search helper.
- [ ] Add reusable search combobox.
- [ ] Add compact TanStack Table wrapper.
- [ ] Run tests.
- [ ] Commit: `feat: add shared compact ui utilities`

### Task 10: Cloudflare Configuration

**Files:**
- Create: `wrangler.jsonc`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/api/src/runtime/cloudflare.ts`

**Produces:**
- Cloudflare Worker deployment
- SPA fallback
- API + frontend deployment path

- [ ] Configure Cloudflare Vite integration.
- [ ] Configure static assets and SPA fallback.
- [ ] Route `/api/*` to Hono.
- [ ] Verify Cloudflare local development.
- [ ] Verify production build.
- [ ] Commit: `chore: add cloudflare deployment configuration`

### Task 11: VPS Runtime

**Files:**
- Create: `Containerfile`
- Create: `compose.vps.yaml`
- Create: `apps/api/src/runtime/node.ts`

**Produces:**
- Podman-compatible VPS deployment
- Node/Hono production runtime

- [ ] Create production Containerfile.
- [ ] Add VPS compose configuration.
- [ ] Add Node production runtime.
- [ ] Verify container build.
- [ ] Run API container against PostgreSQL.
- [ ] Commit: `chore: add vps deployment runtime`

### Task 12: CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Produces:**
- automated validation on GitHub

- [ ] Add pnpm setup.
- [ ] Add dependency install.
- [ ] Add typecheck.
- [ ] Add lint.
- [ ] Add tests.
- [ ] Add build.
- [ ] Verify workflow passes.
- [ ] Commit: `ci: add foundation validation workflow`

### Task 13: Foundation Verification

- [ ] Run all unit tests.
- [ ] Run integration tests.
- [ ] Run typecheck.
- [ ] Run lint.
- [ ] Build frontend.
- [ ] Build Cloudflare target.
- [ ] Build VPS container.
- [ ] Verify PostgreSQL connectivity.
- [ ] Verify tenant isolation.
- [ ] Verify login/logout/session expiry.
- [ ] Verify desktop, tablet, and mobile shell.
- [ ] Commit any final fixes.
