## Stripe Email/SMS Payment Links – Implementation Plan

### Goals
- **Collect payments via Stripe** by sending secure links over email and SMS.
- **Map successful Stripe payments back to our invoices** and create `Payment` + `PaymentAllocation` rows.
- **Track request lifecycle** (created → sent → completed/failed/expired) for auditability.
- **Support multiple invoices in a single payment** with clear itemization for the payer.

### High‑Level Approach
- Use **Stripe Checkout Sessions (mode=payment)** to generate a hosted payment page (acts like a “payment link”).
- Build line items from selected invoice allocations using `price_data` (dynamic amount and name per line).
- Store an internal `PaymentRequest` record to track delivery channel, recipient, totals, and Stripe IDs.
- Deliver links via **email (SendGrid)** and **SMS (Twilio)** or show the link for manual copy.
- Handle Stripe **webhooks** to mark requests completed, create `Payment` and `PaymentAllocation` rows, and update invoice statuses.

### User Flows
- **Manager flow** (Lease Detail or Invoices page)
  1. Select invoices and amounts (we already have the Apply UI + validations).
  2. Choose delivery method(s): Email, SMS, or Copy Link.
  3. Confirm recipient (prefilled from tenant records; can edit) and message.
  4. Click “Create & Send Payment Link”.
  5. See success toast with link and a “Payment Request” entry in history with status “sent”.

- **Tenant flow**
  1. Receives link by email or SMS.
  2. Opens Stripe Checkout and completes payment (Apple Pay/Google Pay/cards supported).
  3. Gets Stripe receipt; our system records the payment via webhook.

### Data Model
- **New: `PaymentRequest`**
  - id (PK)
  - leaseId (FK, optional)
  - primaryTenantId (FK, optional)
  - amountTotal (DECIMAL 10,2)
  - currency (default `usd`)
  - deliveryMethod ENUM(`email`,`sms`,`link`,`email+sms`)
  - toEmail (nullable), toPhone (nullable)
  - message (TEXT, nullable)
  - stripeCustomerId (nullable)
  - stripeCheckoutSessionId (nullable)
  - stripePaymentIntentId (nullable)
  - status ENUM(`draft`,`sent`,`completed`,`failed`,`expired`,`cancelled`) – default `sent`
  - expiresAt (nullable)
  - metadata (JSONB) – stores allocations snapshot: `[ { invoiceId, amount } ]`
  - createdByUserId (FK to `users`)

- Existing:
  - `Payment` (already supports `invoiceId` nullable). We’ll set `paymentMethod='online'` and keep Stripe IDs in description/notes or add optional columns later.
  - `PaymentAllocation` (already created). We’ll populate from webhook using the snapshot.

### Backend
- Dependencies: `stripe` (SDK), `@sendgrid/mail` or SMTP client, `twilio` (optional), `express-async-handler` (optional).

- **Environment variables**
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PUBLIC_KEY` (for client if needed)
  - `SENDGRID_API_KEY` (or SMTP creds)
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (optional)
  - `APP_BASE_URL` (e.g., `http://localhost:5175`) for success/cancel URLs

- **Endpoints**
  - `POST /api/paylinks`
    - Body: `{ allocations: [{ invoiceId, amount }], leaseId?, tenantId?, toEmail?, toPhone?, deliveryMethod: 'email'|'sms'|'link'|'email+sms', message? }`
    - Server actions:
      1. Validate allocations against outstanding balances.
      2. Resolve tenant and/or create/find Stripe Customer (by email/phone if provided).
      3. Create Stripe Checkout Session (`mode='payment'`) with `line_items` using `price_data`:
         - `product_data.name = 'Invoice INV-XXXX'`
         - `unit_amount = amount * 100`, `currency = 'usd'`
      4. Set `metadata` on session and/or PaymentIntent: `{ paymentRequestId, allocationsJson }`.
      5. Save `PaymentRequest` with `sent` status and store Stripe IDs + snapshot.
      6. If deliveryMethod includes `email` or `sms`, send message containing the Checkout URL.
      7. Response: `{ data: { paymentRequest, url } }`.

  - `GET /api/paylinks` – list/filter by status, tenant, lease.
  - `GET /api/paylinks/:id` – detail view with Stripe status if available.
  - `POST /api/paylinks/:id/resend` – resend link via email/SMS.
  - `POST /api/paylinks/:id/cancel` – optional: expire the session or mark internal request cancelled.

  - `POST /api/stripe/webhook` – webhook receiver
    - Verify signature using `STRIPE_WEBHOOK_SECRET`.
    - Handle events: `checkout.session.completed` (primary), `payment_intent.succeeded`, `payment_intent.payment_failed`.
    - On success:
      1. Look up `PaymentRequest` by `metadata.paymentRequestId` or `stripeCheckoutSessionId`.
      2. Idempotently create a `Payment` with `amount` = session/intent amount, `status='completed'`, `paymentMethod='online'` and store Stripe IDs in `notes/description` (or future columns).
      3. Create `PaymentAllocation` rows from the **stored snapshot** in `PaymentRequest.metadata`.
      4. Update associated invoices’ `paidAmount/status` and mark `PaymentRequest.status='completed'`.
    - On failure: mark `PaymentRequest.status='failed'`.

- **Security & Idempotency**
  - Verify Stripe signatures.
  - Use idempotency keys when creating checkout sessions if retried.
  - Only authenticated managers can create/resend/cancel paylinks.

### Frontend (React)
- **Request Payment Dialog** (reusable)
  - Entry points: `LeaseDetail` and `Invoices` pages.
  - Reuse the existing allocations table. Add a “Send Payment Link” tab.
  - Fields: Delivery method(s), Email(s), Phone(s), Optional message, and preview of line items + total.
  - On submit → call `POST /api/paylinks` → show the generated URL and a success toast.

- **Payment Requests List/Detail**
  - New page to view requests, statuses, channel, recipient, amounts, and quick actions (Copy/Resend/Cancel).
  - Link into `PaymentDetail` after completion (created by webhook).

### Email/SMS Content
- Email (SendGrid): Tenant-friendly template with property name, lease, line item summary, total, and a prominent “Pay Now” button.
- SMS (Twilio): Short message with property/lease context and shortened link.
- Include support contact and note about Stripe security.

### Success/Cancel URLs
- `success_url = {APP_BASE_URL}/payments/success?req={paymentRequestId}`
- `cancel_url = {APP_BASE_URL}/payments/cancel?req={paymentRequestId}`
- Success page can poll `GET /api/paylinks/:id` for final status and link to the `PaymentDetail` entry created by webhook.

### Testing Plan
- **Stripe Test Mode** with standard test cards.
- Unit tests for: allocations validation, snapshot persistence, webhook signature verification, idempotent creation.
- Integration tests: end‑to‑end link creation → webhook event ingestion → DB side‑effects (Payment, PaymentAllocations, invoice updates).
- Manual tests: Apple Pay/Google Pay in supported browsers, email and SMS deliverability.

### Observability
- Log `paymentRequestId`, `checkoutSessionId`, and `paymentIntentId` across services.
- Metrics: number of links sent, conversion rate (completed/sent), average payment amount, failure reasons.

### Rollout Steps
1. Create Stripe account & obtain keys; add `.env` entries.
2. Implement `PaymentRequest` model + migration.
3. Add `/api/paylinks` endpoints and webhook handler.
4. Create Request Payment UI and Requests list.
5. Configure webhook endpoint in Stripe dashboard (point to `/api/stripe/webhook`).
6. Test end‑to‑end in test mode with multiple invoice allocations.
7. Enable in production; monitor metrics and logs.

### Risks & Mitigations
- **Partial/over‑payment mismatches**: We clamp UI to outstanding and re‑validate on backend.
- **Duplicate webhooks**: Idempotent processing keyed by `payment_intent.id` and `paymentRequestId`.
- **Email/SMS deliverability**: Use verified sender domains, opt‑out support, and proper error handling.
- **Refunds/chargebacks**: Add follow‑up feature to reconcile Stripe refunds back to `Payment` and reverse allocations.

### Future Enhancements
- Support **Stripe Payment Links API** (prebuilt links) for static amounts/prices.
- Self‑service portal for tenants to view open balances and pay without a manager‑initiated link.
- Surcharges/fees and split payments (if legally permissible).

### Implementation Milestones & Estimate (rough)
- Backend models, endpoints, webhook: **2–3 days**
- Email/SMS integration + templates: **1–2 days**
- Frontend Request dialog + list: **2 days**
- E2E tests and polish: **1–2 days**
- Total initial delivery: **~1–2 weeks** including review and refinements.


