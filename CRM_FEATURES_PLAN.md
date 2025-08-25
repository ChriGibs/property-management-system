## CRM Features Strategy and Implementation Plan

### Overview
This plan adds CRM-like capabilities to support business growth in two areas:
- New Property Acquisition
- New Tenant Acquisition

It is tailored to the existing stack: Express, Sequelize (PostgreSQL), EJS views, and the current models/routes. The plan includes data model extensions, routes/controllers, views, background jobs, AI-assisted evaluations, third-party integrations, analytics, and rollout steps.

---

## 1) New Property Acquisition

### Goals
- Upload and manage prospective properties (pipeline, not yet owned).
- Mine the web for potential deals matching criteria.
- Use AI to evaluate investment quality (cash flow, cap rate, risk flags).

### Data Model Changes
Add a new entity for pipeline properties that is distinct from `properties` (owned/managed inventory):

- `AcquisitionProperty` (table: `acquisition_properties`)
  - id (PK)
  - createdByUserId (FK -> users.id)
  - status (ENUM: 'new', 'screening', 'contacted', 'offer-prep', 'offer-sent', 'under-contract', 'won', 'lost')
  - source (ENUM: 'manual-upload', 'web-scrape', 'referral', 'mls', 'other')
  - headline (short name/title)
  - address, city, state, zipCode, county
  - propertyType (mirror options from `properties`)
  - bedrooms, bathrooms, squareFootage, yearBuilt (nullable)
  - listedPrice (DECIMAL)
  - url (text) – original listing page
  - notes (TEXT)
  - aiScore (INTEGER 0-100)
  - aiSummary (TEXT)
  - underwriting: JSONB { taxes, insurance, hoa, maintenancePct, vacancyPct, expectedRent, other }
  - computedMetrics: JSONB { capRate, cashOnCash, monthlyCashFlow, dscr }
  - tags: TEXT[] (Postgres ARRAY) or JSONB array
  - lastEvaluatedAt (DATE)
  - timestamps

- `AcquisitionActivity` (table: `acquisition_activities`) for timeline and communications
  - id (PK)
  - acquisitionPropertyId (FK)
  - type (ENUM: 'note', 'call', 'email', 'meeting', 'status-change', 'offer')
  - direction (ENUM: 'inbound', 'outbound', null)
  - channel (ENUM: 'phone', 'email', 'sms', 'in-person', 'system')
  - subject (string, nullable)
  - body (TEXT)
  - metadata JSONB (attachments, contact info, durations)
  - createdByUserId (FK -> users.id)
  - occurredAt (DATE)
  - timestamps

Migrations:
- Create both tables with proper indexes on `status`, `city/state`, `aiScore`, `createdAt`.

Associations:
- `AcquisitionProperty.hasMany(AcquisitionActivity)` and `belongsTo(User)`.

### Routes/Controllers
Create routes under `/acquisitions`:
- GET `/acquisitions` – list with filters (status, city/state, price range, aiScore range, tags)
- GET `/acquisitions/new` – form to add a property
- POST `/acquisitions` – create
- GET `/acquisitions/:id` – detail, activities timeline, AI evaluation
- GET `/acquisitions/:id/edit` – edit
- PUT `/acquisitions/:id` – update
- DELETE `/acquisitions/:id` – delete
- POST `/acquisitions/:id/activities` – add activity (note/call/email)
- POST `/acquisitions/:id/evaluate` – trigger AI underwriting/evaluation

### Views
EJS pages under `views/acquisitions/`:
- `index.ejs` – filters, saved searches, table/cards, bulk actions
- `new.ejs` – manual entry/upload form, CSV import option
- `show.ejs` – property details, computed metrics, AI summary card, activities timeline, quick actions
- `edit.ejs` – edit form
- partials: filters, activity composer, metrics, AI summary

### Background Jobs / Services
- Scraper Service (Node job or serverless cron):
  - Sources: public listing portals, Craigslist (respect ToS), Zillow/Redfin via APIs if available, MLS if permitted.
  - Configurable criteria (zip, price, beds/baths, property type, cap rate proxies).
  - Dedup by address/url hash.
  - Inserts as `AcquisitionProperty` with `source='web-scrape'`.
- AI Evaluation Service:
  - Given an `AcquisitionProperty`, run rules + model to compute metrics and summary.
  - Pull comps via external APIs (e.g., Estated, Zillow API, RentCast) when available.

### AI Integration
- Provider: OpenAI (via function calling) or local model endpoint.
- Inputs: property features, estimated rent, taxes/insurance, assumptions.
- Outputs: `aiScore`, `aiSummary`, computed metrics.
- Safety: store prompt, version, and inputs in `metadata` for reproducibility.

### Security/Permissions
- Reuse `requireAuth` and role-gate actions (e.g., only `admin` can delete).

---

## 2) New Tenant Acquisition

### Goals
- Manage onboarding stages through verification steps.
- Track payment behavior and present risk signals.
- Log all communications, including offline.
- Integrate with credit/background checks or capture results manually.

### Data Model Changes
Add a funnel separate from existing `tenants` and `leases` to support prospects:

- `ProspectTenant` (table: `prospect_tenants`)
  - id (PK)
  - firstName, lastName, email, phone
  - stage (ENUM: 'lead', 'pre-screen', 'application', 'screening', 'approved', 'waitlist', 'rejected', 'converted')
  - source (ENUM: 'website', 'referral', 'inbound-call', 'listing-portal', 'other')
  - interestedPropertyId (FK -> properties.id, nullable)
  - notes (TEXT)
  - applicationUrlToken (string) for self-service portal
  - screening: JSONB { creditScore, backgroundStatus, incomeVerified, docs[] }
  - communicationPrefs: JSONB { email, sms }
  - aiRiskScore (INTEGER 0-100)
  - aiSummary (TEXT)
  - timestamps

- `ProspectActivity` (table: `prospect_activities`) – log communications/events similar to acquisition activities
  - id, prospectTenantId (FK)
  - type, direction, channel, subject, body, metadata JSONB
  - createdByUserId, occurredAt, timestamps

- `PaymentBehavior` (table: `payment_behaviors`) – aggregate per-tenant over time
  - id, tenantId (FK -> tenants.id)
  - period (e.g., '2025-07')
  - onTimePayments, latePayments, avgDaysLate, totalPaid, totalDue
  - riskFlags: JSONB { consecutiveLates, partialPayments, nsfEvents }
  - computedScore (0-100)
  - timestamps

Migrations:
- Create the three tables with indexes on `stage`, `createdAt`, `tenantId+period`.

Associations:
- `ProspectTenant.hasMany(ProspectActivity)`; `ProspectTenant.belongsTo(Property)`.
- `PaymentBehavior.belongsTo(Tenant)`.

#### ProspectTenant conversion, screening, interest, and attribution
- Data model extensions (ProspectTenant):
  - marketingAttribution JSONB: { heardAboutUs, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, referrerUrl }
  - interestedPropertyDetails JSONB: { buildingName, unit, floorplan, amenities }
  - desiredTerms JSONB: { targetRentMin, targetRentMax, leaseTermMonths, moveInDate, occupants, pets, parking, utilitiesIncluded, depositBudget }
  - screening fields:
    - screening.provider, creditScore, backgroundStatus, incomeVerified, docs[], rawReportUrl
    - screeningDecision ENUM: 'pending' | 'approved' | 'approved-with-conditions' | 'declined'
    - screeningReviewedByUserId (FK -> users.id), screeningReviewedAt (DATE), screeningNotes (TEXT)

- Conversion flow and approval gating:
  - Only allow transition to stage 'approved' when screeningDecision is 'approved' or 'approved-with-conditions'.
  - Block conversion to `Tenant` unless: stage is 'approved', `interestedPropertyId` present, and minimal `desiredTerms` provided (leaseTermMonths, moveInDate, targetRent within property policy).
  - On convert: create `Tenant` from prospect profile; optionally create draft `Lease` prefilled from desiredTerms; leave lease in 'pending' until signed; log `ProspectActivity` for conversion.

- Routes additions:
  - POST `/crm/tenants/:id/screen/review` – save screeningDecision, reviewer, reviewedAt, notes.
  - POST `/crm/tenants/:id/convert` – enforce gating; create Tenant and optional draft Lease.

- UI updates:
  - `views/crm/tenants/show.ejs`: add screening review panel (decision + notes), interested property & desired terms panel, and prominent Convert button when eligible.
  - `views/crm/tenants/new.ejs`: capture "How did you hear about us?" and UTM metadata if present.

### Routes/Controllers
Tenant CRM routes under `/crm/tenants`:
- GET `/crm/tenants` – list prospects with filters (stage, source, property)
- GET `/crm/tenants/new` – add lead
- POST `/crm/tenants` – create
- GET `/crm/tenants/:id` – detail, activities, docs, screening status
- PUT `/crm/tenants/:id` – update stage, notes, property interest, prefs
- POST `/crm/tenants/:id/activities` – log communication
- POST `/crm/tenants/:id/invite` – send application link (email/SMS)
- POST `/crm/tenants/:id/screen` – submit to screening provider or record results
- POST `/crm/tenants/:id/evaluate` – AI risk assessment
- POST `/crm/tenants/:id/convert` – create `Tenant` and optionally `Lease`

Payment behavior service:
- Nightly/weekly aggregator computes metrics from `payments` and `invoices` into `payment_behaviors`.

### Views
EJS pages under `views/crm/tenants/`:
- `index.ejs` – stage pipeline/kanban, filters, bulk stage updates
- `new.ejs` – lead capture form
- `show.ejs` – profile, activity timeline, screening panel, AI risk, convert button
- partials: stage chips, activity composer, screening results, payment behavior widget

### Integrations
- Screening: Plaid Income, TransUnion SmartMove, Experian Connect, or manual recording.
  - Create an `IntegrationResult` generic table (JSONB payload) keyed to `prospectTenantId` with `provider`, `type`, `status`, `payload`.
- Email/SMS: SendGrid/Mailgun + Twilio (or SMTP + Twilio). Start with manual logging + templates.

### AI Integration
- Prospect risk model using: income-to-rent ratio, payment history (if any), credit/background results, communication sentiment (optional), late fee history if pre-existing.
- Output: `aiRiskScore` and `aiSummary`; suggestions for next best action.

### Security/Permissions
- Reuse `requireAuth`; restrict PII; log access for screening data.

---

## 3) Analytics & Dashboard
- Add CRM widgets to `/dashboard`:
  - Property pipeline counts by stage, average days in stage, win rate.
  - Prospect pipeline by stage, conversion rate, time-to-approve.
  - Top lead sources, campaign effectiveness (later if you add campaigns).
  - Payment behavior heatmap and risk list.

---

## 4) Implementation Steps (Phased Rollout)

### Phase 1: Foundations (week 1)
- Add models + migrations: `AcquisitionProperty`, `AcquisitionActivity`, `ProspectTenant`, `ProspectActivity`.
- Add routes and basic views for CRUD & timelines.
- Add authorization controls.

### Phase 2: AI & Metrics (week 2)
- Implement underwriting calculator (rules-based) for `AcquisitionProperty`.
- Integrate AI summarization/scoring endpoints (env-driven provider keys).
- Add payment behavior aggregation job and widget in tenant profile.

### Phase 3: Integrations & Automation (weeks 3-4)
- Add scraping service with basic sources and dedup.
- Add email/SMS sending and activity auto-logging.
- Add screening integration flow or manual results capture.

### Phase 4: UX Polish & Analytics (week 5)
- Pipeline/kanban UI, saved filters, exports.
- Dashboard widgets and reports.
- Access logging and data retention policies.

---

## 5) Technical Notes
- Use Sequelize models and JSONB columns to stay flexible.
- Background jobs: simple Node cron (node-cron) or external scheduler; store job runs in a `job_runs` table.
- Feature flags via environment variables for AI and scraping.
- Rate limits and retries for external APIs; exponential backoff.
- Audit trail on sensitive updates (screening results, offers).

---

## 6) Security & Compliance
- Protect PII, especially screening data; restrict to `admin` role.
- Encrypt sensitive fields at rest if feasible (e.g., using pgcrypto or app-layer crypto for SSNs if ever stored; prefer not to store SSNs).
- Log access to screening results (who viewed, when).
- Consent for communications; honor opt-outs for SMS/email.

---

## 7) Env & Config
Add to `.env` (example names):
- AI: `OPENAI_API_KEY` (or `LLM_API_URL`, `LLM_API_KEY`)
- Email/SMS: `SENDGRID_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `SMS_FROM`
- Scraping: `SCRAPE_CRON="0 */3 * * *"`, `SCRAPE_SOURCES="craigslist,portalX"`
- Screening: `SCREENING_PROVIDER="manual|transunion|experian"`, provider keys

---

## 8) Deliverables Checklist
- Models/migrations for acquisition and prospect funnels
- CRUD routes/controllers and EJS views
- Activity timelines (+ offline logging)
- AI evaluation endpoints and UI cards
- Scraper job scaffold and config
- Payment behavior aggregator and widget
- Screening integration or manual results capture
- Dashboard widgets for pipeline metrics
- Documentation (this file) and onboarding guide
