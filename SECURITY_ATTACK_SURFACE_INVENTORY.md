# SECURITY ATTACK SURFACE INVENTORY

*Derived from source code only. No .md or report files referenced.*

---

## 1) All HTTP Endpoints

**Auth context:** All `/api/*` except `/api/auth` receive: `apiLimiter` (200 req/min), `requireAuth` or `optionalAuth` (based on `useRequireAuth = isProduction || REQUIRE_AUTH !== 'false'`), `attachTenantPool`, `requireTenantContext`. When `strictTenantContext` (production or `REQUIRE_TENANT_CONTEXT=true`), `requireTenantContext` returns 503 if no tenantId/tenantPool.

**Tenant context:** `getTenantId(req)` / `getTenantPool(req)` from JWT; body tenant injection disabled in strict modes via `isBodyTenantInjectionAllowed()`.

### Public (no auth)

| Method | Path | File | Handler | Auth | Tenant | Mutates | File Upload | Large JSON | Sensitive Data |
|--------|------|------|---------|------|--------|---------|--------------|-------------|----------------|
| GET | /health | src/server.ts | line 67 | no | no | no | no | no | none |
| GET | /health/ready | src/server.ts | line 71 | no | no | no | no | no | none |

### Auth (no requireAuth; own rate limits)

| Method | Path | File | Handler | Auth | Tenant | Mutates | File Upload | Large JSON | Sensitive Data |
|--------|------|------|---------|------|--------|---------|--------------|-------------|----------------|
| POST | /api/auth/login | src/routes/auth.ts | line 38 | no | no | no | no | no | token, userId, tenantId, role |
| POST | /api/auth/register | src/routes/auth.ts | line 66 | no | no | yes | no | no | - |

### API (auth + tenant via middleware)

| Method | Path | File | Handler | Auth | Tenant | Mutates | File Upload | Large JSON | Sensitive Data |
|--------|------|------|---------|------|--------|---------|--------------|-------------|----------------|
| POST | /api/trial-balance/ingest | src/routes/trial-balance/ingest.ts | line 109 | yes* | yes* | yes | yes (10MB) | no | TB, statements, CoA |
| POST | /api/trial-balance/statements | src/routes/trial-balance/parser.ts | line 106 | yes* | yes* | yes | no | yes | TB, statements |
| GET | /api/trial-balance/period/:periodLabel | src/routes/trial-balance/ingest.ts | line 542 | yes* | yes* | no | no | no | TB, statements |
| GET | /api/trial-balance/period/:periodLabel/adjusted | src/routes/trial-balance/ingest.ts | line 553 | yes* | yes* | no | no | no | TB, statements |
| GET | /api/trial-balance/period/:periodLabel/statements | src/routes/trial-balance/ingest.ts | line 564 | yes* | yes* | no | no | no | statements |
| GET | /api/trial-balance/supported | src/routes/trial-balance/ingest.ts | line 578 | yes* | yes* | no | no | no | formats |
| POST | /api/trial-balance/classify | src/routes/trial-balance/classification.ts | varies | yes* | yes* | no | no | yes | account classifications |
| POST | /api/justification/chat | src/routes/justification.ts | varies | yes* | yes* | no | no | yes | RAG IRAC output |
| GET | /api/justification/audit-defense/export | src/routes/justification.ts | varies | yes* | yes* | no | no | no | PDF export |
| POST | /api/audit/binder/register-statements | src/routes/audit/audit_binder.ts | line 121 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/binder | src/routes/audit/audit_binder.ts | line 163 | yes* | yes* | no | no | no | binder, statements |
| GET | /api/audit/binder/export/pdf | src/routes/audit/audit_binder.ts | line 238 | yes* | yes* | no | no | no | PDF |
| GET | /api/audit/binder/export/csv | src/routes/audit/audit_binder.ts | line 300 | yes* | yes* | no | no | no | CSV |
| GET | /api/audit/draft-package | src/routes/audit/audit_binder.ts | line 362 | yes* | yes* | no | no | no | draft PDF |
| GET | /api/audit/reconciliation-summary | src/routes/audit/audit_reconciliation.ts | line 18 | yes* | yes* | no | no | no | recon summary |
| GET | /api/audit/reconciliation-tie-out | src/routes/audit/audit_reconciliation.ts | line 40 | yes* | yes* | no | no | no | tie-out |
| POST | /api/audit/reconciliation-summary/narrative | src/routes/audit/audit_reconciliation.ts | line 57 | yes* | yes* | yes | no | yes | - |
| POST | /api/audit/reconciliation-summary | src/routes/audit/audit_reconciliation.ts | line 75 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/dashboard/forensic-anomalies | src/routes/audit/audit_forensics.ts | line 11 | yes* | yes* | no | no | no | anomalies |
| POST | /api/audit/professional-review | src/routes/audit/audit_professional_review.ts | line 21 | yes* | yes* | yes | no | yes | - |
| POST | /api/audit/integrity/validate | src/routes/audit/audit_professional_review.ts | line 39 | yes* | yes* | no | no | yes | - |
| GET | /api/audit/professional-review/flags | src/routes/audit/audit_professional_review.ts | line 73 | yes* | yes* | no | no | no | flags |
| PATCH | /api/audit/professional-review/flags/:id | src/routes/audit/audit_professional_review.ts | line 99 | yes* | yes* | yes | no | yes | - |
| POST | /api/audit/prior-period-comparison | src/routes/audit/audit_prior_period.ts | line 20 | yes* | yes* | no | no | yes | - |
| POST | /api/audit/prior-period-comparison/explain | src/routes/audit/audit_prior_period.ts | line 71 | yes* | yes* | no | no | yes | - |
| GET | /api/audit/engagements | src/routes/audit/audit_engagements.ts | line 26 | yes* | yes* | no | no | no | engagements |
| POST | /api/audit/engagements | src/routes/audit/audit_engagements.ts | line 42 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/engagements/:id | src/routes/audit/audit_engagements.ts | line 60 | yes* | yes* | no | no | no | engagement |
| PATCH | /api/audit/engagements/:id | src/routes/audit/audit_engagements.ts | line 81 | yes* | yes* | yes | no | yes | - |
| DELETE | /api/audit/engagements/:id | src/routes/audit/audit_engagements.ts | line 103 | yes* | yes* | yes | no | no | - |
| GET | /api/audit/engagements/:id/periods | src/routes/audit/audit_engagements.ts | line 124 | yes* | yes* | no | no | no | periods |
| POST | /api/audit/engagements/:id/periods | src/routes/audit/audit_engagements.ts | line 141 | yes* | yes* | yes | no | yes | - |
| DELETE | /api/audit/engagements/:id/periods/:periodLabel | src/routes/audit/audit_engagements.ts | line 163 | yes* | yes* | yes | no | no | - |
| GET | /api/audit/engagements/:id/close-status | src/routes/audit/audit_engagements.ts | line 185 | yes* | yes* | no | no | no | close status |
| GET | /api/audit/engagements/:id/audit-file | src/routes/audit/audit_engagements.ts | line 206 | yes* | yes* | no | no | no | audit file |
| GET | /api/audit/gaap-consistency | src/routes/audit/audit_gaap_policy.ts | line 14 | yes* | yes* | no | no | no | GAAP report |
| POST | /api/audit/policy-change | src/routes/audit/audit_gaap_policy.ts | line 26 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/policy-changes | src/routes/audit/audit_gaap_policy.ts | line 44 | yes* | yes* | no | no | no | policy changes |
| GET | /api/audit/todos | src/routes/audit/audit_todos.ts | line 20 | yes* | yes* | no | no | no | todos |
| GET | /api/audit/gaps-with-resolution | src/routes/audit/audit_todos.ts | line 34 | yes* | yes* | no | no | no | gaps |
| POST | /api/audit/todos/from-gaps | src/routes/audit/audit_todos.ts | line 48 | yes* | yes* | yes | no | yes | - |
| PATCH | /api/audit/todos/:id | src/routes/audit/audit_todos.ts | line 61 | yes* | yes* | yes | no | yes | - |
| POST | /api/audit/auditor/verify | src/routes/audit/audit_auditor.ts | line 15 | yes* | yes* | no | no | yes | - |
| POST | /api/audit/auditor/internal-controls-chat | src/routes/audit/audit_auditor.ts | line 30 | yes* | yes* | no | no | yes | - |
| POST | /api/audit/sampling | src/routes/audit/audit_sampling.ts | line 19 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/sampling/suggest-size | src/routes/audit/audit_sampling.ts | line 40 | yes* | yes* | no | no | no | - |
| POST | /api/audit/sampling/design | src/routes/audit/audit_sampling.ts | line 64 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/sampling/:runId | src/routes/audit/audit_sampling.ts | line 80 | yes* | yes* | no | no | no | sampling run |
| POST | /api/audit/sampling/:runId/narrative | src/routes/audit/audit_sampling.ts | line 106 | yes* | yes* | yes | no | yes | - |
| POST | /api/audit/sampling/:runId/test-results | src/routes/audit/audit_sampling.ts | line 128 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/pbc | src/routes/audit/audit_pbc.ts | line 15 | yes* | yes* | no | no | no | PBC list |
| POST | /api/audit/pbc | src/routes/audit/audit_pbc.ts | line 29 | yes* | yes* | yes | no | yes | - |
| PATCH | /api/audit/pbc/:id | src/routes/audit/audit_pbc.ts | line 47 | yes* | yes* | yes | no | yes | - |
| POST | /api/audit/drl | src/routes/audit/audit_drl.ts | line 20 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/drl | src/routes/audit/audit_drl.ts | line 31 | yes* | yes* | no | no | no | DRL list |
| PATCH | /api/audit/drl/:id | src/routes/audit/audit_drl.ts | line 42 | yes* | yes* | yes | no | yes | - |
| POST | /api/audit/drl/:id/fulfill | src/routes/audit/audit_drl.ts | line 57 | yes* | yes* | yes | no | yes | - |
| GET | /api/audit/source-document/:id | src/routes/audit/audit_artifacts.ts | line 18 | yes* | yes* | no | no | no | source doc |
| GET | /api/audit/reasoning/:id | src/routes/audit/audit_artifacts.ts | line 36 | yes* | yes* | no | no | no | reasoning |
| GET | /api/audit/audit-file | src/routes/audit/audit_artifacts.ts | line 65 | yes* | yes* | no | no | no | audit file |
| GET | /api/audit/audit-file/export/pdf | src/routes/audit/audit_artifacts.ts | line 82 | yes* | yes* | no | no | no | PDF |
| GET | /api/audit/readiness-one-pager | src/routes/audit/audit_artifacts.ts | line 102 | yes* | yes* | no | no | no | one-pager |
| GET | /api/audit/readiness-one-pager/export/pdf | src/routes/audit/audit_artifacts.ts | line 120 | yes* | yes* | no | no | no | PDF |
| GET | /api/audit/package | src/routes/audit/audit_artifacts.ts | line 141 | yes* | yes* | no | no | no | package |
| GET | /api/audit/package/export/pdf | src/routes/audit/audit_artifacts.ts | line 171 | yes* | yes* | no | no | no | PDF |
| GET | /api/audit/package/export/csv | src/routes/audit/audit_artifacts.ts | line 204 | yes* | yes* | no | no | no | CSV |
| GET | /api/audit/pbc-index | src/routes/audit/pbc_index.ts | line 243 | yes* | yes* | no | no | no | PBC index |
| POST | /api/export/pdf | src/routes/export.ts | varies | yes* | yes* | no | no | yes | PDF export |
| POST | /api/export/csv | src/routes/export.ts | varies | yes* | yes* | no | no | yes | CSV export |
| GET | /api/knowledge-base/tier1/entries | src/routes/financial_memory.ts | line 29 | yes* | yes* | no | no | no | entries |
| GET | /api/knowledge-base/tier2/chart-of-accounts | src/routes/financial_memory.ts | line 40 | yes* | yes* | no | no | no | CoA |
| POST | /api/knowledge-base/tier2/chart-of-accounts | src/routes/financial_memory.ts | line 51 | yes* | yes* | yes | no | yes | - |
| POST | /api/knowledge-base/tier2/policies | src/routes/financial_memory.ts | line 73 | yes* | yes* | yes | no | yes | - |
| GET | /api/knowledge-base/tier2/policies | src/routes/financial_memory.ts | line 93 | yes* | yes* | no | no | no | policies |
| POST | /api/knowledge-base/tier2/invoice-treatments | src/routes/financial_memory.ts | line 104 | yes* | yes* | yes | no | yes | - |
| GET | /api/knowledge-base/tier2/invoice-treatments | src/routes/financial_memory.ts | line 136 | yes* | yes* | no | no | no | treatments |
| POST | /api/knowledge-base/tier3/upload | src/routes/financial_memory.ts | line 147 | yes* | yes* | yes | no | yes | - |
| GET | /api/knowledge-base/tier3/uploads | src/routes/financial_memory.ts | line 165 | yes* | yes* | no | no | no | uploads |
| DELETE | /api/knowledge-base/tier3/session/:sessionId | src/routes/financial_memory.ts | line 177 | yes* | yes* | yes | no | no | - |
| POST | /api/knowledge-base/search | src/routes/financial_memory.ts | line 189 | yes* | yes* | no | no | yes | search results |
| POST | /api/knowledge-base/invoice-consistency | src/routes/financial_memory.ts | line 214 | yes* | yes* | no | no | yes | - |
| POST | /api/vector-store/ingest | src/routes/vector_store.ts | line 41 | yes* | yes* | yes | no | yes | - |
| POST | /api/vector-store/ingest-pdf | src/routes/vector_store.ts | line 63 | yes* | yes* | yes | yes (10MB) | no | - |
| POST | /api/vector-store/query | src/routes/vector_store.ts | line 124 | yes* | yes* | no | no | yes | RAG results |
| POST | /api/vector-store/precedent | src/routes/vector_store.ts | line 148 | yes* | yes* | no | no | yes | precedent |
| GET | /api/vector-store/chunks | src/routes/vector_store.ts | line 167 | yes* | yes* | no | no | no | chunks |
| POST | /api/ingestion/agent | src/routes/ingestion.ts | line 54 | yes* | yes* | no | yes (15MB) | no | ingestion result |
| POST | /api/ingestion/pipeline | src/routes/ingestion.ts | line 119 | yes* | yes* | no | yes (15MB) | no | pipeline |
| GET | /api/ingestion/fetchers/status | src/routes/ingestion.ts | line 150 | yes* | yes* | no | no | no | fetcher status |
| POST | /api/ingestion/fetchers/run | src/routes/ingestion.ts | line 164 | yes* | yes* | yes | no | no | - |
| GET | /api/ingestion/fetchers/usage | src/routes/ingestion.ts | line 188 | yes* | yes* | no | no | no | usage |
| POST | /api/memory/correction | src/routes/memory.ts | line 24 | yes* | yes* | yes | no | yes | - |
| POST | /api/memory/justification | src/routes/memory.ts | line 47 | yes* | yes* | yes | no | yes | - |
| POST | /api/memory/decision | src/routes/memory.ts | line 67 | yes* | yes* | yes | no | yes | - |
| POST | /api/memory/transaction-category | src/routes/memory.ts | line 88 | yes* | yes* | no | no | yes | - |
| POST | /api/memory/query | src/routes/memory.ts | line 107 | yes* | yes* | no | no | yes | memory results |
| GET | /api/memory/vendor/:vendor | src/routes/memory.ts | line 129 | yes* | yes* | no | no | no | vendor data |
| POST | /api/memory/consistency-check | src/routes/memory.ts | line 152 | yes* | yes* | no | no | yes | - |
| POST | /api/memory/entity | src/routes/memory.ts | line 167 | yes* | yes* | yes | no | yes | - |
| GET | /api/memory/entry/:id | src/routes/memory.ts | line 198 | yes* | yes* | no | no | no | entry |
| GET | /api/memory/list | src/routes/memory.ts | line 205 | yes* | yes* | no | no | no | list |
| GET | /api/integrations/google/start | src/routes/integrations.ts | line 22 | yes* | yes* | no | no | no | OAuth redirect |
| GET | /api/integrations/google/callback | src/routes/integrations.ts | line 47 | yes* | yes* | yes | no | no | - |
| GET | /api/integrations/list | src/routes/integrations.ts | line 99 | yes* | yes* | no | no | no | integrations |
| GET | /api/integrations/google/status | src/routes/integrations.ts | line 108 | yes* | yes* | no | no | no | OAuth status |
| POST | /api/pipelines/bank | src/routes/pipelines.ts | line 25 | yes* | yes* | no | no | yes | pipeline result |
| POST | /api/pipelines/ap-aging | src/routes/pipelines.ts | line 50 | yes* | yes* | no | no | yes | - |
| POST | /api/pipelines/ar-aging | src/routes/pipelines.ts | line 67 | yes* | yes* | no | no | yes | - |
| POST | /api/pipelines/payroll-accrual | src/routes/pipelines.ts | line 86 | yes* | yes* | no | no | yes | - |
| POST | /api/pipelines/bank-rec | src/routes/pipelines.ts | line 107 | yes* | yes* | no | no | yes | bank rec |
| POST | /api/pipelines/cash-position | src/routes/pipelines.ts | varies | yes* | yes* | no | no | yes | - |
| POST | /api/close/sessions/ensure | src/routes/close/close_sessions.ts | line 102 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/sessions | src/routes/close/close_sessions.ts | line 146 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/sessions/:id | src/routes/close/close_sessions.ts | line 182 | yes* | yes* | no | no | no | session |
| POST | /api/close/sessions/:id/advance | src/routes/close/close_sessions.ts | line 203 | yes* | yes* | yes | no | no | - |
| GET | /api/close/sessions/:id/readiness | src/routes/close/close_sessions.ts | line 251 | yes* | yes* | no | no | no | readiness |
| POST | /api/close/sessions/:id/certify | src/routes/close/close_sessions.ts | line 273 | yes* | yes* | yes | no | no | - |
| GET | /api/close/sessions/:id/certified-source | src/routes/close/close_sessions.ts | line 317 | yes* | yes* | no | no | no | certified source |
| POST | /api/close/sessions/:id/checklist/initialize | src/routes/close/close_sessions.ts | line 366 | yes* | yes* | yes | no | no | - |
| GET | /api/close/sessions/:id/checklist | src/routes/close/close_sessions.ts | line 388 | yes* | yes* | no | no | no | checklist |
| POST | /api/close/sessions/:id/checklist/emit-stuck-issues | src/routes/close/close_sessions.ts | line 404 | yes* | yes* | yes | no | no | - |
| POST | /api/close/checklist-items/:itemId/complete | src/routes/close/close_sessions.ts | line 426 | yes* | yes* | yes | no | no | - |
| POST | /api/close/checklist-items/:itemId/skip | src/routes/close/close_sessions.ts | line 451 | yes* | yes* | yes | no | no | - |
| GET | /api/close/sessions | src/routes/close/close_sessions.ts | line 476 | yes* | yes* | no | no | no | sessions |
| GET | /api/close/sessions/:id/triage | src/routes/close/close_sessions.ts | line 498 | yes* | yes* | no | no | no | triage |
| POST | /api/close/sessions/:id/statement-packages/generate | src/routes/close/close_sessions.ts | line 557 | yes* | yes* | yes | no | no | - |
| GET | /api/close/sessions/:id/statement-packages | src/routes/close/close_sessions.ts | line 597 | yes* | yes* | no | no | no | packages |
| GET | /api/close/statement-packages/diff | src/routes/close/close_sessions.ts | line 614 | yes* | yes* | no | no | no | diff |
| GET | /api/close/statement-packages/:id | src/routes/close/close_sessions.ts | line 639 | yes* | yes* | no | no | no | package |
| GET | /api/close/statement-packages/:id/lines | src/routes/close/close_sessions.ts | line 659 | yes* | yes* | no | no | no | lines |
| PATCH | /api/close/sessions/:id/status | src/routes/close/close_sessions.ts | line 679 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/adjustments | src/routes/close/close_adjustments.ts | line 17 | yes* | yes* | no | no | no | adjustments |
| POST | /api/close/adjustments/from-je | src/routes/close/close_adjustments.ts | line 31 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/adjustments/from-accruals | src/routes/close/close_adjustments.ts | line 73 | yes* | yes* | no | no | yes | - |
| PATCH | /api/close/adjustments/:id | src/routes/close/close_adjustments.ts | line 115 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/issues | src/routes/close/close_issues.ts | line 79 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/issues/:id | src/routes/close/close_issues.ts | line 100 | yes* | yes* | no | no | no | issue |
| GET | /api/close/issues | src/routes/close/close_issues.ts | line 121 | yes* | yes* | no | no | no | issues |
| PATCH | /api/close/issues/:id/status | src/routes/close/close_issues.ts | line 162 | yes* | yes* | yes | no | yes | - |
| PATCH | /api/close/issues/:id/assign | src/routes/close/close_issues.ts | line 193 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/decision-records | src/routes/close/close_decision_records.ts | line 14 | yes* | yes* | no | no | no | records |
| GET | /api/close/decision-records/:id | src/routes/close/close_decision_records.ts | line 38 | yes* | yes* | no | no | no | record |
| POST | /api/close/recon-runs | src/routes/close/close_recon_runs.ts | line 30 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/recon-runs | src/routes/close/close_recon_runs.ts | line 55 | yes* | yes* | no | no | no | recon runs |
| GET | /api/close/recon-runs/:id | src/routes/close/close_recon_runs.ts | line 76 | yes* | yes* | no | no | no | recon run |
| POST | /api/close/recon-runs/:id/items | src/routes/close/close_recon_runs.ts | line 96 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/recon-runs/:id/items | src/routes/close/close_recon_runs.ts | line 131 | yes* | yes* | no | no | no | items |
| GET | /api/close/recon-runs/:id/match-groups | src/routes/close/close_recon_runs.ts | line 147 | yes* | yes* | no | no | no | match groups |
| GET | /api/close/recon-runs/:id/unmatched | src/routes/close/close_recon_runs.ts | line 163 | yes* | yes* | no | no | no | unmatched |
| POST | /api/close/recon-runs/:id/propose-matches | src/routes/close/close_recon_runs.ts | line 179 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/recon-runs/:id/emit-issues | src/routes/close/close_recon_runs.ts | line 208 | yes* | yes* | yes | no | no | - |
| POST | /api/close/recon-runs/:id/timing-difference | src/routes/close/close_recon_runs.ts | line 242 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/recon-runs/:id/signoff | src/routes/close/close_recon_runs.ts | line 267 | yes* | yes* | yes | no | no | - |
| POST | /api/close/recon-match-groups/:id/confirm | src/routes/close/close_recon_runs.ts | line 292 | yes* | yes* | yes | no | no | - |
| POST | /api/close/recon-match-groups/:id/reject | src/routes/close/close_recon_runs.ts | line 313 | yes* | yes* | yes | no | no | - |
| POST | /api/close/sign-off | src/routes/close/close_signoff_readiness.ts | line 16 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/reviewer-sign-off | src/routes/close/close_signoff_readiness.ts | line 45 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/readiness | src/routes/close/close_signoff_readiness.ts | line 71 | yes* | yes* | no | no | no | readiness |
| GET | /api/close/coach | src/routes/close/close_signoff_readiness.ts | line 90 | yes* | yes* | no | no | no | coach |
| GET | /api/close/status | src/routes/close/close_signoff_readiness.ts | line 97 | yes* | yes* | no | no | no | status |
| POST | /api/close/accrual-suggestions | src/routes/close/close_je_accruals.ts | line 16 | yes* | yes* | no | no | yes | - |
| POST | /api/close/accrual-suggestions/agentic | src/routes/close/close_je_accruals.ts | line 27 | yes* | yes* | no | no | yes | - |
| POST | /api/close/inventory-valuation | src/routes/close/close_je_accruals.ts | line 38 | yes* | yes* | no | no | yes | - |
| POST | /api/close/je-suggestions | src/routes/close/close_je_accruals.ts | line 49 | yes* | yes* | no | no | yes | - |
| POST | /api/close/je-suggestions/from-text | src/routes/close/close_je_accruals.ts | line 62 | yes* | yes* | no | no | no | - |
| POST | /api/close/je-suggestions/explain | src/routes/close/close_je_accruals.ts | line 70 | yes* | yes* | no | no | no | - |
| POST | /api/close/task-assign | src/routes/close/task_assign.ts | line 12 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/segregation/can-perform | src/routes/close/close_segregation.ts | line 14 | yes* | yes* | no | no | yes | - |
| POST | /api/close/segregation/perform-action | src/routes/close/close_segregation.ts | line 29 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/audit-log | src/routes/close/close_audit_log.ts | line 15 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/audit-log | src/routes/close/close_audit_log.ts | line 35 | yes* | yes* | no | no | no | audit log |
| POST | /api/close/audit-log/retention-purge | src/routes/close/close_audit_log.ts | line 52 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/closing-entries | src/routes/close/close_closing_entries.ts | line 17 | yes* | yes* | no | no | no | entries |
| POST | /api/close/closing-entries/add | src/routes/close/close_closing_entries.ts | line 43 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/package | src/routes/close/close_package.ts | line 14 | yes* | yes* | no | no | no | package |
| GET | /api/close/package/export/pdf | src/routes/close/close_package.ts | line 43 | yes* | yes* | no | no | no | PDF |
| GET | /api/close/package/export/csv | src/routes/close/close_package.ts | line 75 | yes* | yes* | no | no | no | CSV |
| GET | /api/close/one-pager | src/routes/close/close_one_pager_exceptions.ts | line 16 | yes* | yes* | no | no | no | one-pager |
| GET | /api/close/one-pager/export/pdf | src/routes/close/close_one_pager_exceptions.ts | line 34 | yes* | yes* | no | no | no | PDF |
| GET | /api/close/exceptions | src/routes/close/close_one_pager_exceptions.ts | line 55 | yes* | yes* | no | no | no | exceptions |
| POST | /api/close/tie-out/narrative | src/routes/close/close_one_pager_exceptions.ts | line 78 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/materiality | src/routes/close/close_materiality_disclosure.ts | line 18 | yes* | yes* | no | no | no | materiality |
| PATCH | /api/close/materiality | src/routes/close/close_materiality_disclosure.ts | line 29 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/materiality/suggest | src/routes/close/close_materiality_disclosure.ts | line 41 | yes* | yes* | yes | no | no | - |
| POST | /api/close/disclosure-checklist/suggest | src/routes/close/close_materiality_disclosure.ts | line 51 | yes* | yes* | yes | no | no | - |
| GET | /api/close/disclosure-checklist | src/routes/close/close_materiality_disclosure.ts | line 61 | yes* | yes* | no | no | no | checklist |
| POST | /api/close/disclosure-checklist/review-summary | src/routes/close/close_materiality_disclosure.ts | line 74 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/disclosure-checklist/:id/suggest-evidence | src/routes/close/close_materiality_disclosure.ts | line 87 | yes* | yes* | yes | no | yes | - |
| PATCH | /api/close/disclosure-checklist/:id | src/routes/close/close_materiality_disclosure.ts | line 112 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/controls | src/routes/close/close_controls.ts | line 24 | yes* | yes* | no | no | no | controls |
| POST | /api/close/controls | src/routes/close/close_controls.ts | line 35 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/controls/:id | src/routes/close/close_controls.ts | line 55 | yes* | yes* | no | no | no | control |
| GET | /api/close/controls/:id/assertions | src/routes/close/close_controls.ts | line 71 | yes* | yes* | no | no | no | assertions |
| POST | /api/close/controls/:id/assertions | src/routes/close/close_controls.ts | line 87 | yes* | yes* | yes | no | yes | - |
| DELETE | /api/close/controls/assertions/:assertionId | src/routes/close/close_controls.ts | line 112 | yes* | yes* | yes | no | no | - |
| POST | /api/close/controls/suggest-assertions | src/routes/close/close_controls.ts | line 132 | yes* | yes* | yes | no | no | - |
| PATCH | /api/close/controls/:id | src/routes/close/close_controls.ts | line 152 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/control-evidence | src/routes/close/close_controls.ts | line 169 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/control-evidence | src/routes/close/close_controls.ts | line 198 | yes* | yes* | no | no | no | evidence |
| POST | /api/close/reconciliation-resolution | src/routes/close/close_reconciliation.ts | line 18 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/reconciliation-resolutions | src/routes/close/close_reconciliation.ts | line 35 | yes* | yes* | no | no | no | resolutions |
| PATCH | /api/close/reconciliation-resolution/:id | src/routes/close/close_reconciliation.ts | line 55 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/checklist | src/routes/close/close_checklist.ts | line 23 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/checklist/:periodLabel | src/routes/close/close_checklist.ts | line 42 | yes* | yes* | no | no | no | checklist |
| PATCH | /api/close/checklist/:periodLabel/step/:stepId | src/routes/close/close_checklist.ts | line 55 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/checklist-templates | src/routes/close/close_checklist.ts | line 84 | yes* | yes* | no | no | no | templates |
| POST | /api/close/checklist-templates | src/routes/close/close_checklist.ts | line 106 | yes* | yes* | yes | no | yes | - |
| PATCH | /api/close/checklist-templates/:periodType | src/routes/close/close_checklist.ts | line 127 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/checklist-sign-off | src/routes/close/close_checklist.ts | line 156 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/evidence-policy | src/routes/close/close_evidence_policy.ts | line 18 | yes* | yes* | no | no | no | policy |
| PUT | /api/close/evidence-policy | src/routes/close/close_evidence_policy.ts | line 38 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/journal-entries | src/routes/close/close_journal_entries.ts | line 39 | yes* | yes* | yes | no | yes | - |
| GET | /api/close/journal-entries | src/routes/close/close_journal_entries.ts | line 96 | yes* | yes* | no | no | no | JEs |
| GET | /api/close/journal-entries/postable | src/routes/close/close_journal_entries.ts | line 119 | yes* | yes* | no | no | no | postable JEs |
| GET | /api/close/journal-entries/:id | src/routes/close/close_journal_entries.ts | line 136 | yes* | yes* | no | no | no | JE |
| POST | /api/close/journal-entries/:id/propose | src/routes/close/close_journal_entries.ts | line 167 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/journal-entries/:id/approve | src/routes/close/close_journal_entries.ts | line 202 | yes* | yes* | yes | no | no | - |
| POST | /api/close/journal-entries/:id/reject | src/routes/close/close_journal_entries.ts | line 243 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/journal-entries/:id/post | src/routes/close/close_journal_entries.ts | line 264 | yes* | yes* | yes | no | no | - |
| POST | /api/close/journal-entries/:id/export | src/routes/close/close_journal_entries.ts | line 307 | yes* | yes* | yes | no | no | - |
| POST | /api/close/journal-entries/validate-balanced | src/routes/close/close_journal_entries.ts | line 328 | yes* | yes* | no | no | yes | - |
| POST | /api/close/journal-entries/validate-period | src/routes/close/close_journal_entries.ts | line 343 | yes* | yes* | no | no | yes | - |
| POST | /api/close/journal-entries/validate-materiality | src/routes/close/close_journal_entries.ts | line 364 | yes* | yes* | no | no | yes | - |
| POST | /api/close/journal-entries/:id/evidence | src/routes/close/close_journal_entries.ts | line 395 | yes* | yes* | yes | no | yes | - |
| POST | /api/close/journal-entries/:id/attachments | src/routes/close/close_journal_entries.ts | line 458 | yes* | yes* | yes | yes (20MB) | no | - |
| GET | /api/close/journal-entries/:jeId/attachments/:attachmentId/download | src/routes/close/close_journal_entries.ts | line 496 | yes* | yes* | no | no | no | file binary |
| POST | /api/precheck/board-ready | src/routes/precheck.ts | line 57 | yes* | no** | no | no | yes | structural check |
| POST | /api/precheck/board-ready-pack | src/routes/precheck.ts | line 106 | yes* | no** | no | no | yes | structural check |
| GET | /api/verification/snapshots/:snapshotId | src/routes/verification/snapshots.ts | line 20 | yes* | yes* | no | no | no | hashes, metadata |
| GET | /api/verification/audit-chain | src/routes/verification/audit_chain.ts | line 16 | yes* | yes* | no | no | no | chain verification |
| GET | /api/verification/evidence-manifest/:snapshotId | src/routes/verification/evidence_manifest.ts | line 58 | yes* | yes* | no | no | no | manifest, hashes |
| GET | /api/coa-mapping/taxonomy | src/routes/coa_mapping.ts | line 20 | yes* | yes* | no | no | no | taxonomy |
| GET | /api/coa-mapping/rules | src/routes/coa_mapping.ts | line 35 | yes* | yes* | no | no | no | rules |
| POST | /api/coa-mapping/rules | src/routes/coa_mapping.ts | line 61 | yes* | yes* | yes | no | yes | - |
| POST | /api/coa-mapping/map | src/routes/coa_mapping.ts | line 89 | yes* | yes* | no | no | yes | - |
| GET | /api/data-quality/rules | src/routes/data_quality.ts | line 28 | yes* | yes* | no | no | no | rules |
| POST | /api/data-quality/rules | src/routes/data_quality.ts | line 44 | yes* | yes* | yes | no | yes | - |
| GET | /api/data-quality/exceptions | src/routes/data_quality.ts | line 72 | yes* | yes* | no | no | no | exceptions |
| GET | /api/data-quality/exceptions/:id | src/routes/data_quality.ts | line 106 | yes* | yes* | no | no | no | exception |
| PATCH | /api/data-quality/exceptions/:id | src/routes/data_quality.ts | line 132 | yes* | yes* | yes | no | yes | - |
| POST | /api/data-quality/run | src/routes/data_quality.ts | line 158 | yes* | yes* | yes | no | yes | - |
| GET | /api/data-quality/summary | src/routes/data_quality.ts | line 194 | yes* | yes* | no | no | no | summary |
| POST | /api/data-quality/exceptions/:id/suggest-remediation | src/routes/data_quality.ts | line 211 | yes* | yes* | no | no | no | - |
| GET | /api/approvals/workflows | src/routes/approvals.ts | line 33 | yes* | yes* | no | no | no | workflows |
| POST | /api/approvals/workflows | src/routes/approvals.ts | line 49 | yes* | yes* | yes | no | yes | - |
| POST | /api/approvals/submit | src/routes/approvals.ts | line 70 | yes* | yes* | yes | no | yes | - |
| GET | /api/approvals/requests | src/routes/approvals.ts | line 103 | yes* | yes* | no | no | no | requests |
| GET | /api/approvals/requests/:id | src/routes/approvals.ts | line 122 | yes* | yes* | no | no | no | request |
| GET | /api/approvals/requests/:id/summary | src/routes/approvals.ts | line 152 | yes* | yes* | no | no | no | summary |
| PATCH | /api/approvals/requests/:id | src/routes/approvals.ts | line 181 | yes* | yes* | yes | no | yes | - |
| POST | /api/accounting-integration/connections | src/routes/accounting_integration.ts | line 23 | yes* | yes* | yes | no | yes | - |
| GET | /api/accounting-integration/connections | src/routes/accounting_integration.ts | line 41 | yes* | yes* | no | no | no | connections |
| GET | /api/accounting-integration/connections/:id | src/routes/accounting_integration.ts | line 52 | yes* | yes* | no | no | no | connection |
| POST | /api/accounting-integration/sync-trial-balance | src/routes/accounting_integration.ts | line 64 | yes* | yes* | yes | no | yes | - |
| POST | /api/accounting-integration/push-journal-entry | src/routes/accounting_integration.ts | line 112 | yes* | yes* | yes | no | yes | - |
| POST | /api/accounting-integration/pull-transactions | src/routes/accounting_integration.ts | line 127 | yes* | yes* | yes | no | yes | - |
| GET | /api/onboarding/state | src/routes/onboarding.ts | line 29 | yes* | yes* | no | no | no | onboarding state |
| GET | /api/onboarding/steps | src/routes/onboarding.ts | line 36 | yes* | yes* | no | no | no | steps |
| POST | /api/onboarding/advance | src/routes/onboarding.ts | line 40 | yes* | yes* | yes | no | yes | - |
| POST | /api/onboarding/entity-info | src/routes/onboarding.ts | line 49 | yes* | yes* | yes | no | yes | - |
| POST | /api/onboarding/coa-import | src/routes/onboarding.ts | line 58 | yes* | yes* | yes | no | yes | - |
| POST | /api/onboarding/suggest-coa-mapping | src/routes/onboarding.ts | line 68 | yes* | yes* | yes | no | yes | - |
| GET | /api/onboarding/first-close-guide | src/routes/onboarding.ts | line 80 | yes* | yes* | no | no | no | guide |
| POST | /api/onboarding/first-close-guide | src/routes/onboarding.ts | line 91 | yes* | yes* | yes | no | yes | - |
| POST | /api/onboarding/first-tb-uploaded | src/routes/onboarding.ts | line 102 | yes* | yes* | yes | no | no | - |
| POST | /api/onboarding/first-close-completed | src/routes/onboarding.ts | line 110 | yes* | yes* | yes | no | no | - |
| PATCH | /api/tenants/:id | src/routes/tenants.ts | line 25 | yes | yes | yes | no | yes | database_url (not exposed in GET) |
| GET | /api/tenants/:id | src/routes/tenants.ts | line 77 | yes | yes | no | no | no | tenant (no database_url) |
| POST | /api/hitl/resolve | src/routes/hitl.ts | line 50 | yes* | yes* | yes | no | yes | - |
| POST | /api/hitl/resolve-ingest | src/routes/hitl.ts | line 133 | yes* | yes* | yes | no | yes | - |
| GET | /api/hitl/thresholds | src/routes/hitl.ts | line 286 | yes* | yes* | no | no | no | thresholds |
| POST | /api/hitl/thresholds | src/routes/hitl.ts | line 295 | yes* | yes* | yes | no | yes | - |
| POST | /api/hitl/check-escalation | src/routes/hitl.ts | line 306 | yes* | yes* | no | no | yes | - |
| POST | /api/hitl/staging | src/routes/hitl.ts | line 316 | yes* | yes* | yes | no | yes | - |
| GET | /api/hitl/staging | src/routes/hitl.ts | line 350 | yes* | yes* | no | no | no | staging items |
| GET | /api/hitl/staging/:id | src/routes/hitl.ts | line 363 | yes* | yes* | no | no | no | staging item |
| POST | /api/hitl/webhook | src/routes/hitl.ts | line 378 | yes* | yes* | yes | no | yes | - |
| GET | /api/hitl/context-memory | src/routes/hitl.ts | line 409 | yes* | yes* | no | no | no | rejection reasons |
| POST | /api/hitl/drafts | src/routes/hitl.ts | line 421 | yes* | yes* | yes | no | yes | - |
| GET | /api/hitl/drafts | src/routes/hitl.ts | line 454 | yes* | yes* | no | no | no | drafts |
| GET | /api/hitl/drafts/:id | src/routes/hitl.ts | line 472 | yes* | yes* | no | no | no | draft |
| PATCH | /api/hitl/drafts/:id | src/routes/hitl.ts | line 491 | yes* | yes* | yes | no | yes | - |
| DELETE | /api/hitl/drafts/:id | src/routes/hitl.ts | line 514 | yes* | yes* | yes | no | no | - |

*Auth: yes when `useRequireAuth` (production or `REQUIRE_AUTH !== 'false'`); otherwise optionalAuth. Tenant: yes when `strictTenantContext` (production or `REQUIRE_TENANT_CONTEXT=true`).
**Precheck: stateless; tenant optional unless closeSessionId in body.

### CPA module (when CPA_ENABLED=true)

Duplicates /api/cpa/trial-balance, /api/cpa/close, /api/cpa/audit, /api/cpa/knowledge-base, /api/cpa/vector-store, /api/cpa/pipelines, /api/cpa/justification — same handlers as above.

### Dev-only (NODE_ENV !== 'production')

| Method | Path | File | Handler | Auth | Tenant | Mutates | File Upload | Large JSON | Sensitive Data |
|--------|------|------|---------|------|--------|---------|--------------|-------------|----------------|
| * | /api-dev/trial-balance/* | src/routes/dev_diagnostics.ts | mounted trialBalanceRouter | optional | yes* | varies | yes | varies | same as /api/trial-balance |
| GET | /api-dev/supervisor | src/routes/dev_diagnostics.ts | line 26 | optional | yes* | no | no | no | 410 quarantined |

---

## 2) Verification Endpoints

| Endpoint | Auth Required | Tenant Required | Rate Limited | Abuse Vector (from code) |
|----------|----------------|-----------------|--------------|---------------------------|
| GET /api/verification/snapshots/:snapshotId | yes* | yes (400 if missing pool/tenantId) | global apiLimiter (200/min) | snapshotId enumeration; tenant check via snapshot.tenantId === tenantId |
| GET /api/verification/audit-chain | yes* | yes (400 if missing pool/tenantId) | global apiLimiter (200/min) | none identified |
| GET /api/verification/evidence-manifest/:snapshotId | yes* | yes (400 if missing pool/tenantId) | global apiLimiter (200/min) | includeDetails=1 returns manifestDetails (journalEntryId, evidenceId, hashSha256, assertionType, requiredness); snapshotId enumeration |

---

## 3) File Upload Endpoints

| Route | File | Handler | Multipart | Storage | Max Size | MIME Validation |
|-------|------|---------|-----------|---------|----------|-----------------|
| POST /api/trial-balance/ingest | src/routes/trial-balance/ingest.ts | line 109 | yes (field: file) | DB (period_trial_balance, etc.) | 10 MB | CSV, XLSX only |
| POST /api/ingestion/agent | src/routes/ingestion.ts | line 54 | yes (field: file) | memory (no durable storage) | 15 MB | MIME + ext: csv, xlsx, xls, pdf, json, images |
| POST /api/ingestion/pipeline | src/routes/ingestion.ts | line 119 | yes (field: file) | memory (no durable storage) | 15 MB | same as agent |
| POST /api/vector-store/ingest-pdf | src/routes/vector_store.ts | line 63 | yes (field: file) | in-memory chunks (store.js) | 10 MB | application/pdf + magic bytes |
| POST /api/close/journal-entries/:id/attachments | src/routes/close/close_journal_entries.ts | line 458 | yes (field: file) | getStorage().putObject; path: {tenantId}/attachments/je/{id}/{uuid}.{ext} | 20 MB | none (ext from filename) |

**Storage adapter:** src/storage/index.ts — LocalDiskStorage (src/storage/local_disk_storage.ts) with `sanitizeKey` (path traversal blocked).

---

## 4) Global Middleware

| Middleware | File | Applied | Notes |
|------------|------|---------|-------|
| helmet | src/server.ts | app.use(helmet()) | Security headers |
| cors | src/server.ts | cors(corsOptions) | Origin from CORS_ORIGINS or CORS_ORIGIN; default localhost:3000 |
| express.json | src/server.ts | limit: '1mb' | Body size limit |
| requestIdMiddleware | src/middleware/requestId.ts | app.use | Request ID |
| Auth (requireAuth/optionalAuth) | src/server.ts | /api (excl. /api/auth) | useRequireAuth ? requireAuth : optionalAuth |
| attachTenantPool | src/auth/middleware.ts | /api (excl. /api/auth) | Attaches tenant DB pool from JWT tenantId |
| requireTenantContext | src/auth/middleware.ts | /api (excl. /api/auth) | 503 if strictTenantContext and no tenantId/tenantPool |
| apiLimiter | src/server.ts | /api (excl. /api/auth) | 200 req/min per IP; TRUST_PROXY=1 supported |
| Error handler | src/server.ts | app.use(err) | send500 — sanitized; no stack to client |
| Auth login rate limit | src/routes/auth.ts | POST /api/auth/login | 10/15min |
| Auth register rate limit | src/routes/auth.ts | POST /api/auth/register | 5/15min |

---

## 5) Data Storage Surfaces

### DB tables storing user input (from migrations)

- tenants (name, database_url)
- users (email, password_hash, role)
- period_trial_balance
- reconciliation_todos
- tenant_pbc
- tenant_sampling_results
- tenant_controls
- tenant_control_assertions
- tenant_period_close
- tenant_reconciliation_resolutions
- tenant_disclosure_checklist
- tenant_close_checklist
- tenant_close_checklist_templates
- tenant_audit_engagements
- tenant_hitl_staging
- tenant_supervisor_sessions_reasoning_logs
- tenant_draft_adjustments
- tenant_close_sessions
- tenant_issue_items
- tenant_triage_assessments
- coa_mapping_rules
- tenant_decision_records
- tenant_recon_tables
- tenant_journal_entries
- tenant_justifications
- tenant_shadow_audit_findings
- tenant_evidence_anchoring
- tenant_evidence_policy
- tenant_onboarding
- tenant_ai_proposals
- tenant_evidence_records
- evidence_links
- journal_entry_attachments (file_ref)

### Tables storing hashes

- audit_ledger (previous_entry_hash, entry_hash)
- ledger_snapshots (snapshot_hash, snapshot_payload_json)
- evidence_records (hash_sha256)
- evidence_links (hash_sha256)

### Evidence storage

- evidence_records, evidence_links — DB
- Journal entry attachments: getStorage().putObject(key, buffer) — key pattern `{tenantId}/attachments/je/{jeId}/{uuid}.{ext}`

### Blob/file storage

- src/storage/local_disk_storage.ts — LocalDiskStorage; base path STORAGE_LOCAL_BASE_PATH or ./storage; sanitizeKey blocks path traversal

---

## 6) Unknown / Ambiguous

### Routes where auth enforcement cannot be clearly proven from code

- None. All /api routes except /api/auth receive requireAuth or optionalAuth from server.ts. optionalAuth allows unauthenticated requests when useRequireAuth is false (dev).

### Areas where tenant enforcement appears conditional

- HITL: getStagingItem, getStagingArea, receiveHumanApproval, handleApprovalWebhook accept `pool && tenantId ? { pool, tenantId } : undefined`; in-memory fallback when no tenant.
- Pipelines (bank, ap-aging, ar-aging, payroll-accrual, bank-rec, cash-position): no explicit tenant check in handler; stateless processing.
- Precheck (board-ready, board-ready-pack): stateless; tenant optional unless closeSessionId in body.
- Vector store: in-memory chunks; no tenant scoping in store.js.
- /api/ingestion/fetchers/run, /api/ingestion/fetchers/usage: explicit 403 if !tenantId.

### Security-related TODO / FIXME

- src/services/job_handlers.ts line 25: `// TODO: load session/document and run agentic cleanup (e.g. agenticLedgerToTrialBalance, classifyIngestionAgentic)`
