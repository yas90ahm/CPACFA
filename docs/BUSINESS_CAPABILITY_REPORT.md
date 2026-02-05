# Business Capability Report

**Basis:** Codebase only (routes, services, tests). No markdown/specs. No intent comments. Only what is wired, reachable, and executable.  
**Purpose:** What the application can actually do today for a real accounting user. If you had to sell this tomorrow, what could you truthfully promise?

---

## 1. Executive summary

- The application is a **close engine**: it accepts trial balance uploads (CSV/XLSX), enforces double-entry balance and human-in-the-loop for imbalanced data, persists unadjusted and adjusted trial balance by period, and produces financial statements (balance sheet, P&L, cash flow, equity) and exportable PDF/CSV. It does **not** perform forecasting, budgeting, or real ERP posting.
- **Core flow:** Upload TB → if imbalanced, data is staged and the user must supply a balancing adjustment via resolve-ingest; if balanced (or after resolve), TB is saved. Users create close sessions, run a checklist, lock the period, certify the session, then can export draft or certified PDF/CSV and a certified-only audit binder. Journal entries follow draft → proposed → approved → posted, with a deterministic shadow auditor blocking post on restricted accounts, negative amounts, or zero lines.
- **Gates:** Certified export and audit binder require a certified close session, readiness (no hard blockers), audit ledger chain verification, server-side materiality checks (no client-supplied flags), and a final integrity check (debits = credits, assets = liabilities + equity, plug/Suspense detection). Draft export has no certification requirement and can be watermarked.
- **Persistence:** Tenant-scoped: period trial balance, HITL staging, close sessions, checklist items, journal entries and lines, adjustments, recon runs, issues, decision records, justifications, audit ledger (hash-chained), statement packages, export checks. Integration tests prove the certification pipeline and export gates end-to-end.
- **Production:** Safe for a small number of tenants (1–10) from a controls perspective: deterministic math, no client-controlled materiality, tamper-evident audit trail, and certified export strictly gated. Not a full ERP; no real ERP sync or posting.

---

## 2. User workflows that actually exist

### 2.1 Upload trial balance

- **Trigger:** `POST /api/trial-balance/ingest` (multipart: file, body: tenantId, periodLabel, etc.).
- **Processing:** File parsed (CSV or XLSX only; column standardization for messy headers). If columns cannot be mapped to debit/credit/amount, returns 200 with `requiresColumnConfirmation` and no save. If debits ≠ credits (within rounding tolerance), creates a HITL staging item with payload `trial_balance_ingest` (raw rows, periodLabel, imbalanceAmount) and returns 200 with `status: 'staged'`, `stagedId`; **nothing is written to period_trial_balance**. If balanced, continues: optional classification, bridge SaveTrialBalance (writes to period_trial_balance), build statements, optional professional review; returns full statement output and optional HITL info.
- **Result:** Either staged (user must resolve-ingest) or saved TB + statements; in both cases response is JSON. Persisted when saved: period_trial_balance (and optionally session upload, decision record, statement generation registration).

### 2.2 Resolve ingest (fix imbalanced upload)

- **Trigger:** `POST /api/hitl/resolve-ingest` (body: stagedId, adjustment array with amountProvenance).
- **Processing:** Loads staging item; validates payload is `trial_balance_ingest`; validates adjustment amounts have valid provenance; merges raw rows + adjustment; recomputes debits/credits; if still not balanced returns 422 MathematicalIntegrityError; if period locked returns 409; otherwise runs bridge command ApplyHitlAdjustmentToTrialBalance (writes to period_trial_balance, updates staging status).
- **Result:** 200 with ok: true; period_trial_balance updated; staging item updated. Integration test proves this path.

### 2.3 Create close session and move to locked

- **Trigger:** `POST /api/close/sessions` (entityId, periodStart, periodEnd, basis, standard). Then `POST /api/close/sessions/:id/checklist/initialize`; then complete or skip checklist items; then `PATCH /api/close/sessions/:id/status` with status in sequence: in_progress → ready_for_review → finalized → locked.
- **Processing:** Session created (or existing returned) with status draft. Allowed transitions enforced (draft → in_progress → … → locked). For finalized/locked, readiness is computed: if any hard blocker (checklist not complete, cash rec not signed off, critical issues open, draft/proposed JEs, audit chain invalid, rounding/materiality) then status change is rejected. Period lock is separate: `POST /api/close/period-lock` (periodLabel, lockedBy, reason).
- **Result:** Close session in status locked; checklist initialized and required items completed/skipped; period locked. All proven in certification_pipeline test.

### 2.4 Certify close session

- **Trigger:** `POST /api/close/sessions/:id/certify` (certifiedBy, memo).
- **Processing:** Session must be in status locked. Readiness recomputed; if any hard blocker, certification throws. Role check: certify_close requires approver (unless overridden). Updates session to status certified, sets certified_by, certified_at, certification_memo; appends certify_close event to audit ledger.
- **Result:** Session certified; certified export and audit binder become allowed (subject to export gate and final integrity check). Proven in test.

### 2.5 Draft journal entries

- **Trigger:** `POST /api/close/journal-entries` (closeSessionId, memo, source, lines with accountRef, debit, credit, description).
- **Processing:** Validates lines balance (debits = credits); inserts JE with status draft and lines.
- **Result:** Journal entry created in draft; listable and editable in flow.

### 2.6 Propose / approve / reject / post journal entry

- **Trigger:** `POST /api/close/journal-entries/:id/propose` (draft → proposed); `POST .../approve` (proposed → approved, body approvedBy; segregation: approver ≠ creator unless env override); `POST .../reject` (proposed → rejected); `POST .../post` (approved → posted).
- **Processing:** Post runs shadow auditor first: deterministic checks (restricted accounts from env, negative debit/credit block, zero line warn, materiality threshold warn). If severity === 'block', post throws and JE stays approved. If ok, status updated to posted, je_posting written to audit ledger, and a justification row ensured for the JE.
- **Result:** JE in posted state; audit ledger and (if configured) tenant_shadow_audit_findings and tenant_justifications updated.

### 2.7 Export draft financials

- **Trigger:** `POST /api/export/pdf` or `POST /api/export/csv` with body (e.g. clean_ledger, financial_statements, cover, periodLabel); exportMode omitted or 'draft'.
- **Processing:** No closeSessionId or certification required. Optional finalIntegrityCheck on supplied data can still block (imbalance, plug/Suspense). PDF built with draft watermark/disclaimer; filename indicates draft. CSV with draft filename.
- **Result:** PDF or CSV returned (and optionally stored to object storage if storeExport=1). Draft naming so it is not mistaken for certified.

### 2.8 Export certified financials

- **Trigger:** `POST /api/export/pdf` or `POST /api/export/csv` with exportMode: 'certified' and closeSessionId (and tenant context).
- **Processing:** Validates closeSessionId present; loads session; requires session.status === 'certified'; computes readiness and blocks if hard blockers; runs checkExportGate (audit ledger chain, period_export_checks materiality, optional conflict check); then builds payload and runs finalIntegrityCheck (Truth Gate: debits = credits, assets = liabilities + equity, plug detection); on failure returns 403 or 422. On success builds PDF/CSV with certified filename (no watermark).
- **Result:** Certified PDF or CSV; no bypass in production (client cannot supply materiality flags or certification bypass). Proven in export_certified_gate test.

### 2.9 Export audit binder (certified-only)

- **Trigger:** `GET /api/audit/binder?closeSessionId=...&periodStart=...&periodEnd=...` (and tenant context). PDF: `GET /api/audit/binder/export/pdf?...`; CSV: `GET /api/audit/binder/export/csv?...`.
- **Processing:** requireCertifiedSession (closeSessionId required, session must be certified); runBinderExportGates (checkExportGate + finalIntegrityCheck on last statement generation); build binder (statements, justifications, chain verification); for PDF/CSV export, stream file with certified filename.
- **Result:** Binder JSON or PDF/CSV; chain verification included. 403 if not certified or gates fail. Draft alternative: `GET /api/audit/draft-package` (no certification; same content shape with draft watermark).

### 2.10 Justification and audit defense

- **Trigger:** `POST /api/justification/chat` (question, optional framework); `GET /api/justification/audit-defense/summary` (period range); `GET /api/justification/audit-defense/export` (period, title); `GET /api/justification/list`.
- **Processing:** Chat calls RAG + LLM (e.g. FASB/IFRS chunks), returns IRAC-style response; can be stored. Audit-defense summary/export aggregate justifications for period and produce HTML or PDF. List returns stored justifications (optionally by period).
- **Result:** IRAC justifications for audit trail; exportable “audit defense” report. Persisted in tenant_justifications when tenant/pool provided.

### 2.11 Other reachable workflows (brief)

- **Statements from JSON:** `POST /api/trial-balance/statements` with body (entries, standard, etc.) returns built statements without file upload; supports period/adjusted TB fetch by periodLabel.
- **Classification:** `POST /api/trial-balance/classification-suggestions` and `apply-classification`; confirm-standard; narrative endpoints (cash-flow, notes, equity-changes) — all wired.
- **Close adjustments:** Add JEs or accruals as adjustments (POST from-je, from-accruals); list/patch adjustments. Adjustments feed into adjusted TB when approved/posted.
- **Recon runs:** Create recon runs, add items, match groups, propose matches, signoff, timing difference, emit issues — routes and services wired.
- **Issues:** Create/list/patch issues (status, assign). Readiness uses critical open issues as hard blocker.
- **Period lock:** Lock/unlock period by periodLabel; calendar config and calendar entries.
- **Data quality:** Rules and exceptions (list, create, patch); evaluation uses balance sheet/P&L context.
- **Approvals:** Workflows and requests (create, submit, list, approve/reject, summary) — wired.
- **Accounting integration:** Create/list connections; sync-trial-balance, push-journal-entry, pull-transactions. **Implementation is mock adapters only** (no real QuickBooks/Xero/NetSuite API); returns mock TB and mock push success.
- **Onboarding:** State, steps, advance, entity-info, coa-import, suggest-coa-mapping, first-close-guide, first-tb-uploaded, first-close-completed — all wired.
- **Pipelines:** Bank, ap-aging, ar-aging, payroll-accrual, bank-rec (with narrative/suggest-adjustments/explain), cash-position — call real services; return reports/narratives.
- **Ingestion agent:** `POST /api/ingestion/agent` (file) — file type detection and classification (e.g. bank_statement, tax_form); returns classification and route; pipeline runs ingestion and optional cleaning.
- **Knowledge-base / vector-store:** Search, precedent, ingest, query — wired.
- **Tenants:** PATCH/GET tenant (e.g. database_url for BYOD) with auth and same-tenant enforcement.
- **HITL:** Staging list/get, resolve (approve/reject), resolve-ingest, webhook, drafts (save for later), context-memory — all wired. Dev-only: `/api-dev` mounts trial-balance and a 410 for supervisor; no production supervisor route.

---

## 3. Concrete capabilities (business language)

**What you can truthfully say it does:**

- Accepts CSV and XLSX trial balance uploads and normalizes messy column names (e.g. Balance, Amt, Dr, Cr).
- Rejects or stages imbalanced uploads: if debits ≠ credits, data is staged for human fix; no unbalanced data is written to the ledger.
- Requires a human-supplied adjustment to fix staged imbalanced uploads; re-checks balance before saving to period trial balance.
- Saves unadjusted trial balance by tenant and period (upload or post-resolve).
- Builds balance sheet, P&L, cash flow, and equity statements from trial balance (with optional classification and standard).
- Exposes adjusted trial balance (unadjusted + approved HITL adjustments + posted close adjustments) by period/session.
- Supports close sessions with explicit status flow: draft → in_progress → ready_for_review → finalized → locked → certified.
- Enforces close readiness before finalize/lock/certify: e.g. required checklist complete, no open critical issues, no draft/proposed JEs, valid audit ledger chain, no materiality/rounding blockers.
- Locks period (separate from session lock) with reason and locker.
- Allows certification only from locked and only when readiness has no hard blockers; records certification on the session and in the audit ledger.
- Creates and manages journal entries: draft → propose → approve/reject → post; blocks post when shadow auditor flags block (restricted accounts, negative amounts, etc.); ensures a justification record for posted JEs.
- Enforces segregation of duties on JE approval (approver ≠ preparer unless explicitly overridden).
- Exports draft PDF/CSV with clear draft naming and watermark so they are not mistaken for certified.
- Exports certified PDF/CSV only when the close session is certified and export gates pass (audit chain, materiality from DB, optional conflicts); no client-supplied materiality or bypass in production.
- Produces an audit binder (statements + justifications + chain verification) only for certified sessions and only after the same export gates and Truth Gate (debits = credits, assets = liabilities + equity, plug/Suspense check).
- Maintains a hash-chained audit ledger for material events and overrides (e.g. certify_close, je_posting, staging_approval).
- Stores justifications (IRAC-style) linked to ingest, JEs, HITL, etc., and can export an “audit defense” report.
- Runs a Truth Gate before export: mathematical integrity (TB and BS equation) and optional plug-account detection.
- Supports bank reconciliation pipeline (match, narrative, suggest adjustments, explain) and other pipelines (AP/AR aging, payroll accrual, cash position) with real service logic.
- Provides CoA mapping (taxonomy, rules, map), data quality rules/exceptions, approvals workflows, and onboarding steps; accounting integration endpoints exist but use mock adapters only (no live ERP).

**What you cannot claim:**

- Forecasting, budgeting, or driver-based reforecast (no such routes or logic in the wired surface).
- Real ERP integration (QuickBooks/Xero/NetSuite are mock only).
- Full AR/AP or payments or inventory management as a general ledger subsystem (pipelines support aging and bank rec, not full subledger).
- A “supervisor” or orchestrated agent in production (route quarantined; tools that depended on it return a clear “not available” message).

---

## 4. Explicit non-capabilities (from code absence)

- **Forecasting:** No routes or services for 13-week cash, quarterly/annual forecast, or similar. No forecasting pipeline in the mounted API.
- **Budgeting:** No budget version, driver-based budget, or reforecast endpoints mounted. Catalog dataset type “budget_version” is quarantined (returns empty).
- **Valuation / DCF / LBO:** No valuation or DCF/LBO routes mounted; migrations and some services exist but are not on the request path.
- **Reporting pack / commentary:** No /api/reporting/pack-templates, pack, or commentary routes mounted.
- **Access / dashboards:** No /api/access/dashboards or alerts routes mounted.
- **Orchestrator:** No /api/orchestrator (prepare-q4, intent, lead-partner) routes mounted.
- **Real ERP posting:** Accounting integration push-journal-entry is implemented with a mock adapter; no live posting to an external GL.
- **Full subledger:** No AR/AP invoicing, payments, or inventory valuation as a first-class ledger; pipelines provide aging and bank rec, not full subledger flows.
- **Catalog API:** Catalog route was removed; no /api/catalog in the mounted app.
- **Supervisor agent in production:** No /api/supervisor or equivalent in production; dev route returns 410.

---

## 5. Production readiness (business perspective)

**Safe to run for 1–10 real tenants?**

- **Yes, with clear scope.** Auth and tenant context are required for /api (optionalAuth in non-production, requireAuth in production). Rate limiting and CORS are applied. Data is tenant-scoped; BYOD tenant database_url is supported. No client can supply materiality or certification bypass in production; export gate and Truth Gate are server-side. Audit ledger is hash-chained and append-only. Integration tests (certification_pipeline, schema_smoke, export_certified_gate) prove the main close and export flows. Deterministic behavior: TB balance, BS equation, JE balance, and shadow auditor rules are all deterministic; LLM is used only for optional narratives and justification chat, not for amounts or gate decisions.

**Safe to produce statements auditors can rely on?**

- **For the narrow scope of “close engine output,” yes.** Certified export and audit binder are only available after certification and after audit ledger chain verification, server-side materiality checks, and Truth Gate. Draft vs certified naming and watermarking reduce risk of mixing draft and final. Justifications and audit ledger support an audit trail. The application does not purport to be the system of record for all audit evidence; it produces period close outputs and an audit binder with a verifiable chain.

**Safe to run monthly closes?**

- **Yes.** Close session lifecycle, period lock, checklist, readiness, and certification are implemented and tested. JE workflow with shadow auditor and segregation supports controlled posting. Resolve-ingest and HITL staging support human-in-the-loop for exceptions. Missing pieces for a full enterprise close (e.g. real ERP sync, full recs, full subledger) are out of scope; within the implemented scope, monthly close can be run.

**Caveats (from code only):** Accounting integration is mock-only. Job worker and ingestion scheduler are optional (env-driven). Some audit sub-routers (DRL, sampling, PBC, prior-period, engagements, artifacts) are unmounted, so those features are not available. Database and schema must be maintained (migrations, verify); tests assume DATABASE_URL when exercising full pipeline.

---

## 6. Competitive positioning summary

**What this product is**

- A **deterministic close engine** that: accepts trial balance (CSV/XLSX), enforces double-entry and human-in-the-loop for imbalanced data, persists period TB and close state, builds financial statements, manages close sessions and checklist, locks period and certifies the close, and produces draft and certified exports plus a certified-only audit binder with a tamper-evident audit trail. It includes a journal entry lifecycle with shadow auditor and segregation, justification storage and audit-defense export, and optional pipelines (e.g. bank rec, aging). It is suitable for a small number of tenants doing monthly close and for producing period-end outputs that can be relied on within the scope of its gates and integrity checks.

**What this product is not**

- It is **not** a full ERP: no real ERP sync or posting, no full AR/AP/inventory/payments subledger. It is **not** a forecasting or budgeting engine. It is **not** a general-purpose reporting or dashboard platform (no reporting pack or access dashboards). It is **not** an open-ended “AI agent” in production (supervisor/catalog agent removed from the request path). It is a **close and export engine** with optional AI-assisted justification and narratives, not a replacement for the general ledger or for planning systems.
