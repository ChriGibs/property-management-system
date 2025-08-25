# Code Review and Improvement Plan

## Overview
This document captures issues, inconsistencies, and improvement opportunities found across the backend (Express/Sequelize) and the React client, followed by a prioritized implementation plan.

---

## Key Findings

### 1) Authentication & Authorization
- Mixed auth mechanisms: server-rendered routes use session cookies (`express-session`) while the SPA API under `/api` uses JWT via `auth_token` cookie. This increases complexity and risk of drift.
- JWT middleware (`requireJwt`) depends on cookies, not Authorization headers; acceptable but should be consistent and documented.
- Missing role-based checks on many `/api` routes; `requireAuth` includes `requireAdmin` only for SSR flows.
- Sessions use `connect-pg-simple` with `DATABASE_URL`, OK, but no session cookie `sameSite` setting; CSRF risk on POST forms.

### 2) Error Handling & Validation
- API endpoints mostly catch and return `{ error: '...' }`, but lack structured error format and validation. Some input sanitation exists, but not consistently (e.g., `/tenants` minimal validation, `/invoices` trusts body fields).
- Server has an EJS error handler for HTML routes, but `/api` relies on inline `try/catch`. No global JSON error middleware.

### 3) Configuration & Security
- `JWT_SECRET` and `SESSION_SECRET` default to insecure literals in development. Should require explicit values.
- Helmet CSP is defined, but `connectSrc` allows only Stripe API; when using the SPA locally (Vite), API calls to `/api` are same-origin via the Node app. Ensure CORS aligns with client origin env.
- CORS in development permits `http://localhost:3000`, `5173`, `5175`; production sets `origin: false` which disables CORS entirely. Acceptable if behind same-origin, but document it.
- Webhook endpoint uses `express.raw` conditionally for Stripe verification, but the global body parser is registered before routes. Since the webhook uses `express.raw`, it's correct as a per-route override; ensure it remains above any JSON middleware that would apply to that path.

### 4) Data Model & Associations
- Models are well-structured and documented in `DATA_MODEL.md`.
- Payment allocation model exists and is used; however, the codebase still supports legacy direct `Payment.invoiceId` accounting. Several routes compute totals by combining legacy and allocation payments. This dual-path introduces complexity and risk of double counting.
- `Invoice.paidAmount` is a mutable field updated in several places while also being recomputed ad-hoc from allocations and legacy payments. Risk of divergence.

### 5) Payments & Invoices Logic
- `/api/payments` allows creating a payment with allocations; sets `invoiceId` to the first allocation to satisfy non-null constraints. The model allows `invoiceId` to be null. Consider allowing null consistently to avoid implying a single-primary invoice for multi-invoice allocations.
- Stripe webhook creates a `Payment` with `invoiceId: null` and then adds `PaymentAllocation` rows. Good. But invoice `paidAmount` updates are done imperatively; better to compute balances from allocations on read (or via a consistent updater service and DB transaction).

### 6) Routing & Separation of Concerns
- `/routes/api.js` is very large (1,100+ lines) and mixes concerns: auth, properties, tenants, leases, invoices, payments, acquisitions, CRM, Stripe integration, dashboard metrics, and mock utilities. Hard to maintain and test.
- SSR routes exist separately but some logic (e.g., payments) is duplicated in `/routes/payments.js` vs `/api` payments.

### 7) Frontend API & Auth
- Client calls `/api` with axios and redirects on 401 via interceptor. Uses `/me` to check auth in `RequireAuth` and `useAuth`. This is fine.
- After login the server sets an HTTP-only cookie; client navigates to `/dashboard`. Works with cookie-based JWT.
- Types: Several places use `any` or loosely typed objects for payloads; could add Zod schemas per endpoint interaction for runtime validation and TS inference.

### 8) DX, Structure, and Testing
- No automated tests. No linting on backend; frontend has ESLint but no checks wired in CI.
- The monorepo contains both server and client without a shared types package for API contracts.
- Docker compose is present; app container runs `npm ci && node server.js` without hot reload, fine for demo.

---

## Inconsistencies and Anti-Patterns
- Dual payment accounting: mixing `Payment.invoiceId` and `PaymentAllocation` while also persisting `Invoice.paidAmount`. Source-of-truth ambiguity.
- God route file (`routes/api.js`): violates separation of concerns. Hard to test and evolve.
- Mixed auth strategies (SSR sessions + SPA JWT). It works but increases complexity.
- Scattered validation; no central request validation or error middleware.
- Imperative invoice status updates sprinkled in routes and webhooks.

---

## Recommendations

### A) Unify Payment Accounting (High impact)
- Make `PaymentAllocation` the single source of truth for payments applied to invoices.
- Deprecate usage of `Payment.invoiceId` for accounting. Keep the column nullable for legacy, but don’t rely on it for totals.
- Stop mutating `Invoice.paidAmount` directly. Compute `paidAmount` from allocations when reading, or maintain via DB-level views/materialization.
- Add a read helper/service: `getInvoiceWithTotals(invoiceId)` deriving totals from allocations only.

### B) Modularize `/routes/api.js` (High impact)
- Split by domain: `api/auth`, `api/properties`, `api/tenants`, `api/leases`, `api/invoices`, `api/payments`, `api/acquisitions`, `api/prospects`, `api/dashboard`, `api/stripe`.
- Add a shared error handler for JSON responses and a request validation layer.

### C) Validation & Error Handling (High)
- Introduce `express-validator` or Zod-based middleware per route. Standardize JSON error shape: `{ error: { code, message, details } }`.
- Central JSON error middleware: convert thrown errors into structured responses.

### D) Auth Consistency and CSRF (Medium)
- Keep SSR session for EJS and JWT for SPA, but document clearly; or migrate SSR admin pages to also check JWT if you plan to consolidate.
- Add `sameSite: 'lax'` and `httpOnly` to session cookies; ensure CSRF protection for form posts (e.g., `csurf`) on SSR routes.
- Document token lifetime and refresh strategy. Consider a `/api/auth/refresh` if needed.

### E) Stripe/Webhooks Robustness (Medium)
- Wrap webhook side effects in a DB transaction; idempotency by checking if payment with `transactionId=session.payment_intent` already processed.
- Move allocation/invoice state updates into a payment service to avoid duplication.

### F) Backend Project Structure (Medium)
- Add `src/` layout for server with `routes/`, `controllers/`, `services/`, `validators/`, `models/`, `lib/`.
- Introduce unit/integration tests: Jest + Supertest for routes; mock Stripe.
- Add linting (ESLint) and Prettier for backend.

### G) Frontend Improvements (Medium)
- Define TypeScript types for API responses in a `types.ts` and use them across pages.
- Use Zod schemas to parse server responses for critical flows (auth, payments).
- Consider central react-query mutation hooks for payments and invoices to avoid duplication across pages.

### H) Configuration Hygiene (Low)
- Make secrets required in development (fail fast). Provide `.env.example` with accurate keys.
- Improve CORS config to accept `CLIENT_BASE_URL` from env in dev.

### I) Data Integrity & Money Handling (High)
- Add DB constraints/indexes:
  - Composite index on `payment_allocations (paymentId, invoiceId)`.
  - Explicit FK `ON DELETE/ON UPDATE` actions aligned to business rules.
  - `CHECK` constraints to prevent negative amounts where not allowed.
- Consider storing money as integer cents to avoid rounding; if staying on DECIMAL, keep all math in SQL and use consistent scale.

### J) Concurrency, Transactions & Idempotency (High)
- Wrap payment creation + allocation writes + invoice state adjustments in a single DB transaction.
- Use row locking (`FOR UPDATE`) when reading/updating invoice-related rows to avoid race conditions.
- Idempotency:
  - Webhook: guard by Stripe `event.id` and `payment_intent` to prevent duplicates.
  - Payments API: accept an optional client idempotency key header to dedupe repeats.

### K) API Design: Pagination, Versioning, Time Zones (Medium)
- Add pagination (limit/offset, cursors later) to list endpoints (`/api/invoices`, `/api/payments`, `/api/tenants`, etc.).
- Version the API under `/api/v1` to enable future breaking changes.
- Standardize to UTC: store as `timestamptz`, return ISO8601 with `Z`, avoid ambiguous local dates.

### L) Security Hardening (Medium)
- `app.set('trust proxy', 1)` in production so `secure` cookies work behind proxies/LB.
- Rate limiting and login hardening:
  - Add `express-rate-limit` to `/api/auth/login` and webhook paths.
  - Backoff/lockout after repeated failed logins.

### M) Observability & Operations (Medium)
- Structured logging (pino/winston) with request IDs; add access logs.
- Health and readiness endpoints: `/healthz`, `/readyz` for containers/orchestrators.
- Error tracking (Sentry) for unhandled exceptions.

### N) Infra & Developer Experience (Medium)
- Enable response compression (`compression`) for text/JSON.
- Offload SendGrid/Twilio sends to a background job queue (BullMQ/Redis) to keep requests fast.
- OpenAPI spec for `/api`; use to generate docs and client types.
- CI hygiene: add audit step and dependency update checks.
- Monorepo shared API contracts package or generated types from OpenAPI.

### O) Frontend UX & Typing (Medium)
- Centralize date/currency formatting and avoid re-computing invoice totals on the client; use server-derived fields where possible.
- Add an Error Boundary and consistent toast/snackbar handling for API errors.
- Configure React Query defaults (`staleTime`, `retry`) and include Devtools in dev.
- Use Zod resolvers with `react-hook-form` for create/update forms.

---

## Prioritized Implementation Plan

### Phase 1: Foundations (1-2 days)
1. Add backend ESLint + Prettier config; wire `npm run lint`.
2. Create `src/` structure; move existing files with minimal code changes.
3. Add centralized JSON error middleware and error shape; add request validation helpers.
4. Fix seed script mismatch (`scripts/seed.js` vs `scripts/seedInvoices.js`).
5. Production hardening: set `app.set('trust proxy', 1)`, enable `compression`.
6. Add rate limiting for `/api/auth/login` and `/api/stripe/webhook`.
7. Implement pagination on list endpoints and standardize UTC serialization.
8. Add `/healthz` and `/readyz`; align CORS with `CLIENT_BASE_URL` for dev and configurable prod.

### Phase 2: Payments Unification (2-3 days)
1. Implement payment service:
   - `computeInvoiceTotals(invoiceId)` reads allocations and returns `{ total, totalPaid, outstanding }`.
   - `applyPaymentAllocations(paymentId, allocations)` in transaction.
2. Refactor `/api/invoices` and `/api/leases/:id` reads to use computed totals only; stop using legacy direct `Payment.invoiceId` amounts for totals.
3. Avoid mutating `Invoice.paidAmount`; optionally migrate existing data by recalculating and setting once, then treat as denormalized cache or remove.
4. Add idempotency to webhook using `session.payment_intent` as `transactionId`.

### Phase 3: Route Modularization (1-2 days)
1. Split `routes/api.js` by domain; add `router.use(requireJwt)` at a central `api/index`.
2. Introduce validators for create/update endpoints (tenants, leases, invoices, payments).
3. Introduce `/api/v1` base path and prepare OpenAPI spec stub covering split routes.

### Phase 4: Auth & CSRF (1 day)
1. Add `sameSite: 'lax'` to session cookie; consider `csurf` for SSR forms.
2. Document auth flows; ensure CORS uses `CLIENT_BASE_URL` in dev.

### Phase 5: Frontend Types & Hooks (1-2 days)
1. Add `src/types.ts` for API contracts.
2. Add zod parsing for critical responses.
3. Extract mutations into dedicated hooks (`useCreateInvoice`, `useRecordPayment`, `useCreatePaylink`).
4. Add Error Boundary, central error/toast handling, React Query defaults, and shared formatters.

### Phase 6: Testing & CI (ongoing)
1. Add Jest + Supertest; write baseline tests for `/api/invoices`, `/api/payments`, webhook.
2. Add GitHub Actions CI: install, lint, test, audit; add dependency update checks.

### Phase 7: Observability & Operations (1 day)
1. Add structured logging with request IDs; wire Sentry for errors.
2. Introduce Redis + BullMQ for email/SMS job queue; move SendGrid/Twilio off request path.

---

## Quick Wins Checklist
- Add `sameSite: 'lax'` to session cookie.
- Require `JWT_SECRET` and `SESSION_SECRET` in dev.
- Add idempotency guard in webhook using `payment_intent`.
- Create `api/utils/errorMiddleware.js` and use across routes.
- Split API routes into domain modules.
 - Fix seed script target in `package.json`.
 - Set `trust proxy` in production and enable `compression`.
 - Add rate limiting on login and webhook endpoints.
 - Add pagination to list endpoints and standardize UTC.
 - Add `/healthz` and `/readyz` endpoints.

---

## Notes
- `DATA_MODEL.md` is strong; keep it the source of truth. Make code comments reference sections in the doc where relevant.
- Keep legacy support paths behind a feature flag while migrating to allocation-only accounting.
