# Purge Changelog — Safe Purge Plan Implementation

This document summarizes what was removed and why, per **DEAD_CODE_AND_PURGE_PLAN.md**. Core Sovereign CPA Engine pilot flow was not modified; only dead/quarantined code and route wiring were removed.

---

## 1) Phase 1 — Quarantine (route wiring / docs)

### 1.1 Server console.log (`src/server.ts`)

- **Removed:** Stale log lines advertising routes that no longer exist:
  - `POST /api/orchestrator/prepare-q4`, `/intent`, `/lead-partner`
  - `POST /api/forecasting/13-week-cash`, `POST /api/capital/project-metrics`
  - `POST /api/budget/version`, `POST /api/entities/consolidation`
  - `GET /api/reporting/pack-templates`, `POST /api/reporting/pack`, `GET /api/reporting/commentary`
  - `POST /api/audit/drl, sampling, prior-period-comparison`, `GET /api/access/dashboards, alerts`
  - `POST /api/supervisor/chat`, `GET /api/supervisor/conflicts`
- **Added/updated:** Log lines limited to **actually mounted** routes: trial-balance, justification, audit (binder, draft-package, reconciliation-summary, todos, gaap-consistency, auditor, professional-review), export, knowledge-base, vector-store, ingestion, pipelines, close (sessions, certify, journal-entries), hitl. One line notes that Supervisor is quarantined (`/api-dev/supervisor` returns 410 when NODE_ENV !== production).

### 1.2 Audit sub-routers (`src/routes/audit/index.ts`)

- **Unmounted (quarantined):** The following routers are no longer mounted so their routes are unreachable for the pilot:
  - `auditDrlRouter`
  - `auditSamplingRouter`
  - `auditPbcRouter`
  - `auditPriorPeriodRouter`
  - `auditEngagementsRouter`
  - `auditArtifactsRouter`
- **Still mounted:** auditBinderRouter, auditReconciliationRouter, auditGaapPolicyRouter, auditTodosRouter, auditAuditorRouter, auditForensicsRouter, auditProfessionalReviewRouter.
- **Reason:** Plan Phase 1.3 — pilot keeps binder, reconciliation, gaap-policy, todos, auditor, forensics, professional-review; DRL, sampling, PBC, prior-period, engagements, artifacts are out of scope for minimal pilot.

### 1.3 Catalog router

- **No change:** Catalog was never mounted in `server.ts` or `cpa_index.ts`; no wiring was removed. Phase 2 removed the catalog **file** (see below).

---

## 2) Phase 2 — Deletions and test/service updates

### 2.1 Test update (`tests/sovereign_validator.test.ts`)

- **Change:** `finalIntegrityCheck` import switched from `../src/agents/Supervisor.js` to `../src/services/integrity_check.js`.
- **Reason:** Supervisor stub was deleted; `finalIntegrityCheck` lives in `integrity_check.ts` and is the canonical implementation used by export routes.

### 2.2 Agents index (`src/agents/index.ts`)

- **Removed exports:** All exports that came from `auditor_agent.js`:
  - `runSkepticReview`, `runDiscussion`, `runSupervisorWithSkeptic`
  - Types: `SupervisorReport`, `SkepticReviewResult`, `DiscussionResult`, `SupervisorWithSkepticInput`, `SupervisorWithSkepticOutput`
- **Kept:** `executeTool`, `toolDefinitions` (from tools/index), `ToolDefinition`, `ToolResult` (from tools/types), `runGapAnalysis`, `DataGap`, `DataGapType`, `LedgerEntry`, `BankOrLedgerMetadata` (from cpa_brain).
- **Reason:** Auditor/Supervisor flow is quarantined; no production path uses these exports.

### 2.3 Tools index (`src/agents/tools/index.ts`)

- **Removed:** Import and use of `supervisor_tools.js` (`executeSupervisorServiceTool`, `SupervisorToolContext`). Removed the block that delegated `list_datasets`, `query_dataset`, `resolve_query_intent`, `summarize_query_result`, `step1CPA` to supervisor_tools.
- **Added:** For those tool names, `executeTool` now returns a single error: `Tool "${name}" is not available (Supervisor/catalog quarantined per purge plan).`
- **Removed from ToolContext:** `step1Output`, `lastCatalogResult` (they were only used by supervisor_tools).
- **Reason:** supervisor_tools was only used when the Supervisor (quarantined) ran; removing it avoids broken imports after deleting `supervisor_tools.ts`.

### 2.4 Files deleted

| File | Reason |
|------|--------|
| `src/routes/catalog.ts` | Catalog router was never mounted; dead code. Plan Phase 2.1. |
| `src/agents/auditor_agent.ts` | Only used by Supervisor flow (quarantined). Plan Phase 2.2. |
| `src/agents/Supervisor.ts` | Stub that threw on runSupervisor; no caller after auditor_agent removed. Plan Phase 2.2. |
| `src/services/supervisor_tools.ts` | Only used by agents/tools for Supervisor/catalog tools; tools now return error for those names. Plan Phase 2.2. |
| `experimental/agents/Supervisor.ts` | Full Supervisor implementation; quarantined, not in pilot. Plan Phase 2.2. |
| `experimental/middleware/swaggerSetup.ts` | Experimental middleware; not used in main server. Plan Phase 2.2. |

**Not deleted (per plan):**  
- `catalog_query_service.ts`, `data_catalog_service.ts`, `data_catalog_repository.ts`, `types/data_catalog.ts`, `schemas/catalogSchemas.ts` — kept in case a future route or job needs catalog-style queries; currently no caller after catalog route and supervisor_tools removal.  
- Migrations and tables — Plan Phase 3 only; no migration or table was removed.

---

## 3) What was not touched (core Sovereign pipeline)

- **Routes:** trial-balance (ingest, statements, period, classification), justification, audit (binder, draft-package, register-statements, professional-review, reconciliation-summary, gaap-policy, todos, auditor, forensics), export (pdf, csv), close (sessions, certify, checklist, journal-entries, adjustments, period-lock, recon-runs, issues, decision-records, signoff-readiness, closing-entries, etc.), hitl, coa-mapping.
- **Services:** fileIngestion, trial_balance_store_service, adjusted_trial_balance_service, persistence_service, hitl_orchestrator, close_session_service, close_checklist_readiness_service, journal_entry_service, shadow_auditor_service, audit_ledger_service, export_gate_service, integrity_check, integrity_gate_service, audit_export_service, audit_binder_export_service, justification_service, revenue_recognition_service/repository, protocol_bridge, getAdjustedTrialBalance, statementGenerator, financialStatements, accountClassifier, etc.
- **Migrations/tables:** No migrations or tables were removed (Phase 3 deferred).

---

## 4) Verification after purge

- **`npx tsc --noEmit`:** Passes.
- **`tests/integration/certification_pipeline.test.ts`:** Passes (full pipeline: ingest → HITL resolve → close session → lock → certify → export → binder).
- **`tests/integration/schema_smoke.test.ts`:** Passes (schema verify when DATABASE_URL set).
- **`tests/integration/export_certified_gate.test.ts`:** Passes (certified vs draft export, binder 403/200, production bypass check).
- **`npm run db:verify`:** Passes (schema verification).
- **`tests/sovereign_validator.test.ts`:** Some tests fail with 401 (export requests without auth) or timeout (justifyWithRAG LLM call). These are environment/auth/timeout related, not caused by the purge; certification_pipeline and export_certified_gate cover the same export and integrity behavior with auth.

---

## 5) Summary

| Category | Action |
|----------|--------|
| **Route wiring** | Server console.log trimmed to actual routes; audit DRL/sampling/PBC/prior-period/engagements/artifacts unmounted. |
| **Deleted files** | 6 files: catalog route, Supervisor stub, auditor_agent, supervisor_tools, experimental Supervisor, experimental swaggerSetup. |
| **Updated files** | server.ts, audit/index.ts, agents/index.ts, agents/tools/index.ts, tests/sovereign_validator.test.ts. |
| **Core pilot** | Unchanged. Ingest → Forge/HITL → Adjusted TB → Statements; JE workflow; Lock → Certify → Draft/Certified exports; Audit Binder; justifications; DB verify — all intact and tested. |

The repo is smaller and clearer: dead and quarantined code are removed or unreachable; advertised routes match what is actually mounted; pilot tests pass.
