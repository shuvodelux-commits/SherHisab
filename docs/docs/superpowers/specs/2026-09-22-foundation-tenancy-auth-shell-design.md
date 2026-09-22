# SherHisab Foundation, Tenancy, Auth & App Shell Design

Date: 2026-09-22  
Status: Draft

## Goal

Build the SherHisab foundation as a simple modular monolith using:

- React + TypeScript + Vite
- shadcn/ui
- TanStack Router
- TanStack Query
- TanStack Table
- Hono
- PostgreSQL
- Podman for local containers
- Cloudflare + VPS deployment support
## Architecture

SherHisab will start as a modular monolith.

Frontend:
- React
- TypeScript
- Vite
- shadcn/ui
- TanStack Router
- TanStack Query
- TanStack Table

Backend:
- Hono
- TypeScript

Database:
- PostgreSQL

Business modules stay separated in code, but run inside one application initially.
## Multi-Tenancy

- SherHisab is multi-tenant from day one.
- Tenant-owned records must contain `tenant_id`.
- Tenant identity comes from the authenticated session.
- Never trust `tenant_id` from request body as access authority.
- All repository queries must filter by tenant.
- Tenant-specific unique constraints must include `tenant_id`.
## Authentication

- Use secure server-managed HttpOnly session cookies.
- Session identifies the User and Tenant.
- All protected routes require authentication.
- Passwords must be securely hashed.
- Support login, logout, password reset, and session expiry.
- Permissions are checked on the server.
- MFA and OAuth can be added later if needed.
## Deployment

- Cloudflare is supported from the beginning.
- VPS is supported from the beginning.
- Cloudflare runs React/Vite + Hono.
- VPS runs the same Hono application with Node.js.
- PostgreSQL runs separately.
- Local development uses Podman.
- Business logic must remain runtime-independent.
## UI Rules

- Keep the interface compact and information-dense.
- Avoid oversized cards and unnecessary whitespace.
- Use searchable Comboboxes for important selections.
- Use fuzzy search where useful.
- Tables support sorting, filtering, pagination, and column visibility where needed.
- Desktop, tablet, and mobile use the same React application.
- Numbers must hide unnecessary trailing decimal zeros.

## Service Boundaries

Start with one Hono application and one PostgreSQL database.

Keep business modules separated in code:

- inventory
- sales
- purchases
- finance
- parties
- expenses
- reports

Do not split them into network microservices initially.
## Database Rules

- Use UUID primary keys.
- Keep legacy/display numbers separately.
- Store money as integer paisa using `bigint`.
- Store quantity with decimal precision.
- Use PostgreSQL transactions for atomic business operations.
- Use parameterized SQL.
- Keep a lightweight repository layer.
## Out of Scope

Foundation does not yet implement:

- purchases
- sales
- FIFO inventory
- returns
- expenses
- finance
- subscriptions
- SMS
- WhatsApp automation
- advanced reporting
- microservices
- Kubernetes
