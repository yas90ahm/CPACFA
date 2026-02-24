# Full Product Audit — Backend + Frontend

> Generated 2026-02-23 from actual code. No .md files were read. Every finding traced to .ts/.tsx/.sql source.

---

## Section 1: What a User Can Actually Do Today

This is the complete user walkthrough — every screen, every action, every API call.

### Step 1: User opens the app at localhost:3002

They see the **login page**. Email + password + optional tenant ID field. No registration link (registration endpoint exists but no UI for it beyond the initial seed).

They log in with credentials. The app calls `POST /api/auth/login`, receives a JWT token with `{userId, tenantId, role}`.

**Role-based routing:**
- `operating_partner` or `admin` → redirected to `/portfolio`
- Everyone else → redirected to `/close`

### Step 2: Portfolio Dashboard (admin/operating_partner only)

User sees a **multi-entity dashboard** at `/portfolio`:
- Summary cards: total entities, closed, in progress, not started, needs attention
- Period selector with previous/next navigation
- "Needs Attention" section highlighting overdue/problematic companies
- Searchable, filterable table of all portfolio companies with status, gates passed, open issues, revenue, margin
- Financial overview with close duration trend sparklines

**Actions:** Search by company name. Filter by status. Click a company row to jump into its close session.

**API calls:** `GET /api/portfolio/entities`, `GET /api/portfolio/summary`. Both are real, hitting PostgreSQL with cross-tenant aggregation.

### Step 3: Close Sessions List

User navigates to `/close`. They see:
- "Month-End Close" header for their entity
- A **"New Close Session"** button
- Table of all sessions: period label, status badge, duration, preparer, reviewer, gates summary, issue count

**Actions:**
- Click "New Close Session" → side panel with entity dropdown, period start/end date pickers → Create Session button calls `POST /api/close/sessions`
- Click any session row → opens that session's dashboard

**API calls:** `GET /api/settings/entities`, `GET /api/close/sessions?entityId=X`

### Step 4: Session Dashboard (the command center)

At `/close/{sessionId}/dashboard`, user sees the **main close cockpit**:

**Layout:**
- **TopBar:** Entity selector, period selector, state badge (OPEN/IN_PROGRESS/UNDER_REVIEW/CERTIFIED/LOCKED), user avatar, settings link
- **Sidebar** (9 items): Dashboard, Trial Balance, Mapping, Reconciliation, Adjustments, Statements, Variance, Review & Certify, Audit Trail — each with live badge counts (unmapped accounts, incomplete recons, pending JEs, stale statements, unexplained variances)
- **State Machine Banner** below topbar: visual 5-step progression (OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED) with action buttons (Submit for Review, Certify, Lock)
- **Issue Panel** (floating FAB button, bottom-right): sliding panel showing critical/blocking/warning/info issues grouped by severity, each linking to the relevant page

**Dashboard content varies by state:**

**OPEN state:** Shows the GL upload interface:
- **GL Upload Flow** component: drag-and-drop CSV file upload zone, column auto-detection preview with editable mappings, preview table showing parsed rows, "Upload & Ingest" button
- **TB Upload Flow** component: alternative direct TB upload
- On successful GL upload: system auto-derives trial balance, advances session to IN_PROGRESS

**IN_PROGRESS / UNDER_REVIEW / CERTIFIED / LOCKED states:**
- Phase progress list showing 7 phases with completion status: Ingest, Mapping, Recon, AJEs, Statements, Variance, Review
- Next actions panel (dynamic list of what needs attention — links to specific accounts/items)
- Recent activity feed (last 8 audit events)
- Readiness gates sidebar (X/Y gates passing)
- Issue summary (critical/blocking/warning/info counts)
- Session info card

**API calls:** 8+ real endpoints — session, readiness, issues, reconciliations, templates, journal entries, variances, audit events.

### Step 5: Trial Balance Page

At `/close/{sessionId}/trial-balance`:
- Toggle: Unadjusted / Adjusted trial balance
- Summary bar: total debits, credits, difference, account count, unmapped count
- Searchable, sortable table: account code, account name, account type, debit, credit, net balance, mapping status
- Click any row → expands to show GL entries for that account with detail table
- Footer row with column totals
- "Map this account →" link for unmapped accounts

**API calls:** `GET /api/close/sessions/{id}/trial-balance?type=unadjusted|adjusted`

### Step 6: COA Mapping Page

At `/close/{sessionId}/mapping`:
- Progress bar: X/Y accounts mapped
- Filter by account type or show unmapped only
- Account table: code, name, type, balance, current mapping, action dropdown
- **Right sidebar with two tabs:**
  - AI Suggestions: suggested mappings with confidence scores — Apply or Dismiss each
  - Taxonomy: tree view of all financial statement line items

**Actions:**
- Apply individual AI suggestions or bulk apply high-confidence ones
- Select/change mapping from dropdown for each account
- All changes persist to `POST /api/coa-mapping/rules`

**API calls:** `GET /api/coa-mapping/taxonomy`, `GET /api/coa-mapping/suggestions?sessionId=X`

### Step 7: Reconciliation List

At `/close/{sessionId}/reconciliation`:
- Summary bar: total required, completed, in progress, not started, approved, over tolerance, progress %
- Status filter pills (All, Not Started, In Progress, Completed, Approved) + "Over tolerance only" checkbox
- Sortable table: account code, account name, GL balance, supporting balance, variance, unexplained variance, tolerance, status, evidence count, preparer, reviewer
- Color-coded left borders: red = over tolerance, amber = completed but not approved
- Footer row with GL/supporting/variance totals

**Auto-initialization:** If zero reconciliations exist, the page automatically calls `POST /api/close/sessions/{id}/reconciliations/initialize` which auto-generates requirements from ASSET + LIABILITY accounts in the TB ($100 default tolerance).

**Actions:** Click any row → opens reconciliation detail page.

**API calls:** `GET /api/close/sessions/{id}/reconciliations`, auto-init POST

### Step 8: Reconciliation Detail

At `/close/{sessionId}/reconciliation/{reconId}`:
- Navigation header: back button, previous/next recon buttons, status badge
- **Balance comparison card:** GL balance (read-only) vs supporting balance (editable input), variance display with color coding
- **Reconciling items table:** description, amount, type dropdown, date, delete button
- **Add Item form:** description, amount, type (Outstanding Check, Deposit in Transit, Bank Fee, Timing Difference, Error Correction, Other), date
- **Notes textarea**
- **Right sidebar:**
  - Supporting documents: drag-and-drop file upload (PDF, PNG, JPG, XLSX, CSV, max 10MB), list of uploaded files with hashes
  - Approval info: preparer, reviewer, timestamps
  - History: status changes

**Actions:**
- Edit supporting balance → calls `POST .../supporting-balance`
- Add reconciling item → calls `POST .../items`
- Delete reconciling item → calls `DELETE .../items/{itemId}`
- Upload evidence → multipart `POST .../evidence`
- Mark Complete (preparer) → calls `POST .../complete` — requires supporting balance set, within tolerance, at least 1 evidence file
- Approve (reviewer, different person) → calls `POST .../approve` — enforces segregation of duties
- Reject (reviewer) → calls `POST .../reject` with reason (min 10 chars)

### Step 9: Adjustments (AJE Templates + Journal Entries)

At `/close/{sessionId}/adjustments`:

**Two tabs:**

**Templates tab:**
- Lists all AJE templates with status (Pending, Applied, Skipped)
- Apply template → creates draft JE with pre-filled lines
- Skip template → requires reason (min 5 chars)
- Undo skip
- Bulk apply all pending templates

**Journal Entries tab:**
- Summary bar: total entries, draft, pending approval, approved, posted, total debit impact
- Table: JE #, date, memo, status, source, evidence count
- Expandable rows show full line details (account code, debit, credit, description)
- Side form for create/edit/view

**JE lifecycle actions:**
- Create new entry: memo (required), add line items with account code + debit/credit amounts + descriptions
- Save draft
- Propose (draft → proposed) — re-validates balance
- Approve (proposed → approved) — enforces segregation of duties (approver ≠ creator)
- Reject (proposed → rejected) — requires reason (min 10 chars)
- Post (approved → posted) — checks evidence threshold, runs shadow auditor, triggers cascade
- Delete (draft/rejected only)

**API calls:** Template status GET, journal entries CRUD, propose/approve/reject/post/delete endpoints — all real.

### Step 10: Financial Statements

At `/close/{sessionId}/statements`:
- Stale banner if statements are outdated (upstream changes since last generation)
- Generate/Regenerate button, Export PDF button
- "Show prior period" and "Show changes" toggle checkboxes
- **Five tabs:** Income Statement, Balance Sheet, Cash Flow, Stockholders' Equity, Validation

Each statement tab shows:
- Tabular format with line items, amounts, indentation levels, grand totals
- Prior period comparison column (if enabled)
- Change amounts (if enabled)

**Validation tab:** Cross-statement validation checks:
- Balance sheet equation (A = L + E)
- Net income tie (IS ↔ Equity)
- Cash tie (CF ↔ BS)
- Equity tie (Equity ↔ BS)

**Known issue:** The Generate button currently uses a fake 1.5-second timeout spinner instead of calling the real `POST /api/close/sessions/{id}/statement-packages/generate` endpoint. Statement display is real (reads from API), but the trigger button is a stub.

**API calls:** `GET /api/close/sessions/{id}/statement-packages`, `GET /api/close/statement-packages/{pkgId}/lines`

### Step 11: Variance Analysis

At `/close/{sessionId}/variance`:
- Summary bar: total line items analyzed, material variances, explained, unexplained, approved
- Filters: material only, unexplained only, statement filter (IS/BS/CF/EQ), sort dropdown
- Expandable table: statement, line item, prior amount, current amount, change $, change %, material indicator, explanation status, approval status
- **Expanded row shows:**
  - AI draft explanation (if available) — Use or Dismiss
  - Explanation textarea (min 20 chars to save)
  - Save explanation button
  - Approve explanation button (reviewer only)

**API calls:** `GET /api/close/sessions/{id}/variances` — real endpoint with AI draft explanations

### Step 12: Review & Certify

At `/close/{sessionId}/review`:
- Content changes by session state:

**IN_PROGRESS:** Pre-submission checklist showing all gates. "Submit for Review" button enabled when all hard gates pass. Calls `POST /api/close/sessions/{id}/advance`.

**UNDER_REVIEW:**
- Read-only banner for preparers
- Reviewer sees "Certify" and "Send Back" buttons
- Certify requires typing "CERTIFY" in confirmation dialog → calls `POST /api/close/sessions/{id}/certify`
- Send Back requires reason → calls `POST /api/close/sessions/{id}/reject`

**CERTIFIED:**
- Displays certification record: timestamp, certifier, snapshot hash, signature
- "Lock Period" button (irreversible) → calls `POST /api/close/sessions/{id}/lock`
- "Reopen" button (reviewer only) → requires typing "REOPEN" + reason → calls `POST /api/close/sessions/{id}/reopen`

**LOCKED:** "This period is permanently locked" display. No actions available.

**Three summary cards:** Financial Highlights, Activity Summary (JE/recon/variance counts), Evidence Manifest (file list with SHA-256 hashes)

**API calls:** Session, readiness, certification artifact, team members, statements, audit trail, journal entries, reconciliations, variances, evidence manifest — all real.

### Step 13: Audit Trail

At `/close/{sessionId}/audit-trail`:
- Hash chain integrity status banner (valid/invalid count)
- Filter panel: event type checkboxes (JE, Recon, Mapping, Variance, Evidence, Certification, Lock, Reopen, State Change), user dropdown, date range, search
- Sort order toggle (newest/oldest first)
- Expandable event cards: icon, event type, timestamp, user, hash chain info
- Expanded details: before state, after state, changes diff, hash values

**API calls:** `GET /api/close/sessions/{id}/audit-events?filters...`

### Step 14: Settings

**General Settings** (`/settings/general`) — WORKING:
- Entity name, fiscal year end, base currency
- Auto-lock days after certification, variance materiality thresholds
- Save changes → `PUT /api/settings/general`

**Reconciliation Settings** (`/settings/reconciliation`) — WORKING:
- Requirements table: account code, name, tolerance, evidence required, source document
- Add/edit/delete requirements
- Auto-generate from GL button
- All CRUD via real API endpoints

**Team Management** (`/settings/team`) — WORKING:
- Team members table: name, email, role badge, status, last active
- Invite new member (email, role: Controller/Reviewer/Certifier/Admin)
- Edit role, deactivate member
- Segregation of duties info card

**Evidence Policy, Templates, Taxonomy, Integrations** (`/settings/evidence-policy`, `/settings/templates`, `/settings/taxonomy`, `/settings/integrations`) — STUB: Pages exist but have no implemented content.

---

## Section 2: Backend vs Frontend Coverage Matrix

| Capability | Backend | Frontend | Status |
|---|---|---|---|
| **Auth: Login** | Working (JWT) | Working (login page + auth context) | Complete |
| **Auth: Register** | Working (creates tenant + user) | No registration page | Backend only |
| **GL Upload (CSV)** | Working (parse, validate, persist) | Working (drag-drop, column mapper, preview) | Complete |
| **GL Upload (XLSX/PDF)** | Not implemented | Not implemented | Missing |
| **TB Derivation from GL** | Working (automatic after GL ingest) | Working (displays derived TB) | Complete |
| **TB Direct Upload** | Working (ingest endpoint) | Working (TB upload flow component) | Complete |
| **Trial Balance Display** | Working (unadjusted + adjusted) | Working (toggle, search, filter, expand to GL) | Complete |
| **COA Upload** | Working (CSV) | No dedicated page (used during onboarding) | Backend only |
| **COA Mapping Rules** | Working (CRUD, versioned, cascading) | Working (mapping page with AI suggestions) | Complete |
| **Mapping Completeness Gate** | Working (100% required) | Working (shows unmapped count, links) | Complete |
| **Recon Requirements CRUD** | Working (full CRUD + auto-generate) | Working (settings page) | Complete |
| **Recon Auto-Initialize** | Working (from TB ASSET/LIABILITY) | Working (auto-calls on empty list) | Complete |
| **Recon: Enter Supporting Balance** | Working | Working (editable input) | Complete |
| **Recon: Add/Remove Items** | Working | Working (form + delete buttons) | Complete |
| **Recon: Upload Evidence** | Working (multipart, SHA-256 hash) | Working (drag-drop upload) | Complete |
| **Recon: Complete** | Working (validates balance, evidence, tolerance) | Working (button with validation) | Complete |
| **Recon: Approve/Reject** | Working (segregation enforced) | Working (buttons, reject requires reason) | Complete |
| **Recon Completeness Gate** | Working (blocks advancement) | Working (shown in readiness gates) | Complete |
| **AJE Template CRUD** | Working | No template editor page | Backend only |
| **AJE Template Proposal** | Working (auto-propose for period) | Working (templates tab) | Complete |
| **AJE Template Apply/Skip** | Working | Working (apply/skip/undo/bulk buttons) | Complete |
| **JE: Create Draft** | Working (memo required, balance check) | Working (form with line items) | Complete |
| **JE: Propose** | Working (re-validates balance) | Working (button) | Complete |
| **JE: Approve** | Working (segregation enforced) | Working (button) | Complete |
| **JE: Reject** | Working (reason required) | Working (dialog with reason) | Complete |
| **JE: Post** | Working (shadow audit, evidence check, cascade) | Working (button) | Complete |
| **JE: Delete** | Working (draft/rejected only) | Working (button) | Complete |
| **JE: Evidence Upload** | Working (multipart) | Working (upload in JE detail) | Complete |
| **JE Immutability** | Working (DB triggers block UPDATE/DELETE on posted) | N/A (backend enforced) | Complete |
| **Statement Generation** | Working (4 statements, deterministic) | **PARTIAL** — display works, Generate button is fake spinner | Frontend stub |
| **Statement Display** | Working (lines with hierarchy) | Working (5 tabs: IS, BS, CF, Equity, Validation) | Complete |
| **Cross-Statement Validation** | Working (6 tie checks) | Working (validation tab) | Complete |
| **Variance Computation** | Working (automatic after statements) | Working (displays with materiality flags) | Complete |
| **Variance AI Draft** | Working (returns draft, NOT auto-saved) | Working (Use/Dismiss buttons) | Complete |
| **Variance Explanation** | Working (human writes, min 20 chars) | Working (textarea + save) | Complete |
| **Variance Approval** | Working | Working (approve button) | Complete |
| **Variance Completeness Gate** | Working (material variances must be explained) | Working (shown in readiness gates) | Complete |
| **Session State Machine** | Working (OPEN→IN_PROGRESS→UNDER_REVIEW→CERTIFIED→LOCKED) | Working (banner + action buttons) | Complete |
| **Advance Session** | Working | Working (Submit for Review button) | Complete |
| **Certify** | Working (13+ hard gates, Ed25519 signature) | Working (type "CERTIFY" dialog) | Complete |
| **Lock** | Working (terminal, irreversible) | Working (Lock Period button) | Complete |
| **Reopen** | Working (CERTIFIED only, reason required) | Working (type "REOPEN" + reason dialog) | Complete |
| **Reject (send back)** | Working | Working (reason required) | Complete |
| **Readiness Gates** | Working (13+ gates) | Working (gates list with pass/fail) | Complete |
| **Issue Detection** | Working (5 issue types auto-detected) | Working (issue panel, badges) | Complete |
| **Issue Auto-Resolution** | Working (auto-verify when fixed) | Working (issues disappear from panel) | Complete |
| **Cascade Engine** | Working (synchronous, <2s, max depth 3) | N/A (backend only, frontend refreshes via React Query) | Complete |
| **Audit Trail** | Working (hash-chained, append-only) | Working (filtered list with chain integrity) | Complete |
| **Evidence Manifest** | Working (SHA-256 hashes, file metadata) | Working (displayed on review page) | Complete |
| **Certification Artifact** | Working (Ed25519 signed, snapshot hash) | Working (displayed on review page) | Complete |
| **Ledger Snapshot** | Working (TB + GL + evidence, SHA-256 hash) | Working (hash displayed in certification) | Complete |
| **Checklist (close steps)** | Working (initialize, complete, skip items) | Working (dashboard + review page) | Complete |
| **Team Management** | Working (invite, roles, deactivate) | Working (settings/team page) | Complete |
| **Entity Settings** | Working (fiscal year, currency, thresholds) | Working (settings/general page) | Complete |
| **Portfolio Dashboard** | Working (cross-tenant aggregation) | Working (admin view with entity list) | Complete |
| **ERP Sync: QuickBooks** | STUBBED (mock adapter) | No UI | Not implemented |
| **ERP Sync: Xero** | STUBBED (mock adapter) | No UI | Not implemented |
| **ERP Sync: NetSuite** | STUBBED (mock adapter) | No UI | Not implemented |
| **Google OAuth** | Working (real token exchange) | No UI (settings/integrations page is stub) | Backend only |
| **Onboarding Wizard** | Working (7-step state machine + AI) | No dedicated pages | Backend only |
| **Data Quality Rules** | Working (configurable rules, exceptions) | No UI | Backend only |
| **Approval Workflows** | Working (multi-step, configurable) | No UI | Backend only |
| **Controls & Assertions** | Working (full CRUD, evidence linking) | No UI | Backend only |
| **Recon Runs (bank rec)** | Working (items, matching, sign-off) | No UI | Backend only |
| **Decision Records** | Working (append-only audit) | No UI | Backend only |
| **HITL Staging** | Working (staging area, webhook) | No UI | Backend only |
| **Export: PDF** | Working (endpoint exists) | Stub button (no actual download) | Frontend stub |
| **Export: CSV** | Working (GL export endpoint) | No UI | Backend only |
| **Verification Portal** | Working (public key, artifact verify) | No UI | Backend only |
| **AI Boundary Enforcement** | Working (assertNoAiMutationContext, assertNoNumericAmountsInAgentOutput) | N/A (backend enforced) | Complete |
| **Evidence Policy Settings** | Working (backend configurable) | Stub page | Frontend stub |
| **AJE Template Editor** | Working (full CRUD) | Stub page | Frontend stub |
| **Taxonomy Editor** | Working (backend CRUD) | Stub page | Frontend stub |
| **Integrations Settings** | Working (Google OAuth backend) | Stub page | Frontend stub |

---

## Section 3: What's Missing to Ship v1

These are the actual blockers preventing a controller from completing a full close cycle through the UI today.

### Critical (Blocks the Close Flow)

1. **Statement Generation Button is Fake**
   - The "Generate Statements" button on `/close/{id}/statements` uses a fake 1.5-second timeout instead of calling `POST /api/close/sessions/{id}/statement-packages/generate`. Statements display correctly once generated (e.g., via API call or test), but the user cannot trigger generation from the UI.
   - **Fix:** Wire the button to call the real endpoint. The backend is fully functional.

### Important (Degrades the Experience)

2. **No PDF Export from UI**
   - The Export PDF button on the statements page doesn't trigger a real download. Backend `POST /api/export/pdf` exists.
   - **Fix:** Wire the button to call the endpoint and trigger a browser download.

3. **Settings Stub Pages (4 pages)**
   - `/settings/evidence-policy` — Backend supports configurable evidence thresholds but no UI to set them.
   - `/settings/templates` — Backend supports AJE template CRUD but no UI to create/edit templates (only apply/skip in the adjustments page).
   - `/settings/taxonomy` — Backend supports taxonomy line CRUD but no UI.
   - `/settings/integrations` — Backend has Google OAuth but no UI to initiate the flow.
   - **Impact:** Users must rely on defaults or API calls for these configurations.

4. **No Registration Page**
   - `POST /api/auth/register` exists and works (creates tenant + user). No UI for it.
   - **Impact:** New tenants must be created via API or seed script.

### Nice-to-Have (Not Blocking Close Flow)

5. **ERP Integration is Stubbed**
   - QuickBooks, Xero, NetSuite adapters all return mock data. Connection CRUD works (metadata stored in DB) but actual sync/push/pull is fake.
   - **Impact:** Users must upload GL via CSV. No automated ERP pull.

6. **Backend Features Without Frontend**
   - **Recon Runs (bank rec matching):** Full backend with item ingestion, match proposals, sign-off — no UI.
   - **Data Quality Rules:** Configurable rule engine with exceptions — no UI.
   - **Approval Workflows:** Multi-step configurable workflows — no UI.
   - **Controls & Assertions:** SOX-style control framework — no UI.
   - **Decision Records:** Append-only reasoning audit trail — no UI.
   - **HITL Staging:** Human-in-the-loop staging area — no UI.
   - **Onboarding Wizard:** 7-step guided setup — no UI.
   - **Verification Portal:** Auditor can verify certification artifacts — no UI.
   - **Impact:** These are power features. The core close flow works without them, but they represent significant backend investment with no user-facing surface.

7. **XLSX/PDF Upload**
   - GL upload accepts CSV only. No Excel or PDF parsing.
   - **Impact:** Controllers with XLSX exports must save as CSV first.

### Summary: Minimum Fix List for v1

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Wire statement Generate button to real API | Small (1 line change) | **Unblocks close flow** |
| 2 | Wire PDF Export button to real API | Small | Professional output |
| 3 | Wire 4 settings pages to real APIs | Medium | Self-service configuration |
| 4 | Add registration page | Small | New tenant onboarding |

**Everything else works.** A controller can upload GL, see the derived TB, map accounts, reconcile every balance sheet account with evidence, create/approve/post journal entries, view all 4 financial statements, explain material variances, submit for review, certify with digital signature, and lock the period — all through the UI, all hitting real backend endpoints, all with enforced gates and segregation of duties.
