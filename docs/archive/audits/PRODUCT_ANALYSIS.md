# Product Analysis — What This System Actually Does

**Source:** Executable code, database schema, API routes, services, and tests only. No documentation files were read.

---

## 1. What Problem This System Appears to Solve

The system enforces **mathematical correctness and auditability of financial close data**. It:

- Ingests trial balance (CSV/XLSX), validates that debits equal credits and assets equal liabilities plus equity (`integrity_gate_service.ts` L153-210, `shared/config/financial_rules.json`).
- Routes imbalanced data to human-in-the-loop staging instead of persisting it (`ingest.ts` L204-228, `createStagingItem`).
- Runs a period close workflow with explicit state transitions (draft → locked → certified).
- Creates an immutable, hash-chained audit trail of every mutation (`audit_ledger_repository.ts`, `migrations/051_audit_ledger.sql`).
- Produces certified financial exports (PDF, CSV) that are gated on certification status and chain integrity (`export_gate_service.ts`, `export.ts` L135-204).
- Attaches evidence (file hashes) to journal entries and includes them in the certified snapshot (`evidence_manifest_service.ts`, `ledger_snapshot_service.ts`).

**Evidence:** `integrity_gate_service.ts` `runIntegrityGate`, `assertIntegrityGateOrThrow`; `ingest.ts` `createStagingItem` when `absGt(totalDebits, totalCredits, tolerance)`; `close_session_service.ts` state machine; `export_gate_service.ts` `checkExportGate`.

---

## 2. Who the Likely User Is

**Tenant-scoped accountants and auditors.** Evidence:

- **Multi-tenant:** `tenant_id` on tenants, users, close_sessions, journal_entries, period_trial_balance, audit_ledger, evidence_records, etc. (`migrations/001_initial.sql`, `065_tenant_close_sessions.sql`, `060_period_trial_balance.sql`).
- **Roles:** `accountant`, `preparer`, `reviewer`, `approver` (`auth.ts` L19; `schemas/authSchemas.js`).
- **Segregation:** `approvedBy` cannot equal `createdBy` unless `ALLOW_SAME_USER_APPROVE` is set (`journal_entry_service.ts` L114-119).
- **Certification requires approver:** `canPerform(actorRole, 'certify_close')` (`close_session_service.ts` L248).
- **Close sessions:** entity + period (e.g. "Q1 2025") scoped to tenant (`close_sessions` entity_id, period_start, period_end).
- **Auditor endpoints:** `/api/audit/auditor/verify`, `/api/audit/auditor/internal-controls-chat`, `/api/verification/certification/verify` (`server.ts` L243-244, `verification/certification.ts`).

**Evidence:** `migrations/001_initial.sql` (users.role, tenant_id); `segregation_service.ts`; `close_session_service.ts` L248.

---

## 3. Main Workflow from Start to Finish

1. **Auth:** `POST /api/auth/login` with tenantId, email, password → JWT (`auth.ts` L38-64).
2. **Create session:** `POST /api/close/sessions/ensure` with entityId, periodLabel → draft close session (`close_sessions.ts` L107-148).
3. **Ingest trial balance:** `POST /api/trial-balance/ingest` (multipart CSV/XLSX). If balanced → saved to `period_trial_balance`; if imbalanced → staged in `tenant_hitl_staging` (`ingest.ts` L203-228).
4. **Fix imbalanced ingest (if needed):** `POST /api/hitl/resolve-ingest` with stagedId + human-supplied adjustment (with provenance) → re-validates math → saves to `period_trial_balance` (`hitl.ts` L132-203).
5. **Journal entries:** Create draft JE via `POST /api/close/journal-entries` (lines require `amountProvenance`). Propose, approve, post via separate endpoints (`journal_entries.ts`, `journal_entry_service.ts`).
6. **Evidence:** `POST /api/close/journal-entries/:id/evidence/upload` → stores file, computes SHA-256, links to JE (`evidence_attachment_service.ts`, `evidence_storage_service.ts`).
7. **Advance close:** `POST /api/close/sessions/:id/advance` → draft → in_progress → ready_for_review → finalized → locked (`close_session_service.ts` L411-423).
8. **Certify:** `POST /api/close/sessions/:id/certify` (only from locked). Creates ledger snapshot, certification artifact (Ed25519 signed), records `certify_close` in audit ledger (`close_session_service.ts` L242-409).
9. **Export:** `POST /api/export/pdf` or `/api/export/csv` with `exportMode=certified` and `closeSessionId`. Gate checks chain, materiality, evidence integrity. Certified PDF/CSV built from certified snapshot (`export.ts`, `export_gate_service.ts`, `pdf_export.ts`).

**Evidence:** `full_certification_pipeline_e2e.test.ts` L1-55; `ingest.ts`; `close_sessions.ts`; `export.ts`.

---

## 4. What the System Enforces

| Rule | Where |
|------|-------|
| Debits = Credits (tolerance 0.01) | `integrity_gate_service.ts` L158-159; `financial_rules.json` roundingTolerance |
| Assets = Liabilities + Equity | `integrity_gate_service.ts` L161-163 |
| Journal entry lines must balance | `journal_entry_service.ts` L40-46 `validateBalanced` |
| Amount provenance required for non-zero JE amounts | `journal_entry_service.ts` L52-58 `validateJEProvenance`; `types/amount_provenance.ts` |
| HITL resolve-ingest adjustment must have provenance | `hitl.ts` L142-149 `validateAdjustmentProposals` |
| Certify only from locked | `close_session_service.ts` L261-266 |
| Allowed state transitions only | `close_session_service.ts` L28-35 `ALLOWED_TRANSITIONS`, L195-199 |
| No overlapping close sessions (tenant+entity+period) | `migrations/065_tenant_close_sessions.sql` EXCLUDE constraint |
| Segregation: approver ≠ preparer (configurable) | `journal_entry_service.ts` L114-119 |
| Certified export requires session.status === 'certified' | `export.ts` L155-161 |
| Export gate: audit chain valid, materiality, evidence integrity, conflict resolution | `export_gate_service.ts` L55-184 |
| Client cannot supply materiality flags | `export.ts` L114-124, 403 TAMPERING_ATTEMPT_DETECTED |
| Period lock blocks TB save and some mutations | `period_lock_service.ts`, `protocol_bridge.ts` |

---

## 5. What the System Prevents

| Prevention | Mechanism |
|------------|-----------|
| Update/delete on `audit_ledger` | Triggers `audit_ledger_no_update`, `audit_ledger_no_delete` (`migrations/091_append_only_triggers.sql` L6-22) |
| Update/delete on `ledger_snapshots` | Triggers `ledger_snapshots_no_update`, `ledger_snapshots_no_delete` (`091_append_only_triggers.sql` L24-39) |
| Update/delete on `period_trial_balance` when linked close is certified | Triggers `period_trial_balance_no_update_when_certified`, `period_trial_balance_no_delete_when_certified` (`091_append_only_triggers.sql` L41-69) |
| AI writing to core tables | `ai_writer` role has no INSERT on `core.*` (`migrations/093_ai_boundary_schemas.sql` L97-101) |
| AI invoking mutation paths in prod | `assertNoAiMutationContext()` in `executeBridgeCommand`, `certifyCloseSession` (`ai_boundary.ts` L35-41; `protocol_bridge.ts` L33; `close_session_service.ts` L246) |
| Evidence attachment when session locked/certified | `EvidenceAttachmentError` when `session.status` in `['locked','certified']` (`evidence_attachment_service.ts` L57, L76) |
| Certified export without certified session | 403 CLOSE_NOT_CERTIFIED (`export.ts` L155-161) |
| Export when chain invalid, materiality exceeded, or evidence hash mismatch | 403 CRITICAL_TAMPER_ALERT (`export_gate_service.ts`) |
| Trial balance ingest over row limit | 413 when row count > MAX_TB_ROWS (default 100,000) (`ingest.ts` L155-164) |
| Transition from certified (terminal state) | `certified: []` in ALLOWED_TRANSITIONS (`close_session_service.ts` L35) |

---

## 6. Advisory vs Deterministic

**Deterministic (enforced, cannot be overridden by AI):**

- Trial balance math (D=C, A=L+E)
- Journal entry balance and provenance
- Close session state transitions
- Ledger snapshot creation and hash
- Audit ledger append and chain verification
- Export gate checks
- Period lock
- Schema: `core.*` tables (journal_entries, period_trial_balance, close_sessions, ledger_snapshots, evidence_records, etc.)

**Advisory (suggestions, stored in staging):**

- AI classifier outputs → `tenant_ai_proposals` (`ai_orchestrator.ts`, `tenant_ai_proposals_repository.ts`)
- AI advisor proposals → `tenant_hitl_staging` (`persistence_service.ts`, `ingest.ts`)
- AI call log → `ai_call_log` (`ai_call_log` table)
- Shadow audit findings → `tenant_shadow_audit_findings`
- Schema: `ai.*` tables (`migrations/093_ai_boundary_schemas.sql` L45-48)

**Human approval moves advisory → deterministic:** `persistence_service.approveStagingItem`, `hitl/resolve-ingest` → saves to `period_trial_balance` (`hitl.ts` L132+).

**Evidence:** `093_ai_boundary_schemas.sql` (core vs ai schemas, ai_writer grants); `ai_boundary.ts`; `protocol_bridge.ts` (all mutations go through bridge, which asserts no AI context).

---

## 7. Outputs the System Produces

| Output | Endpoint / Service | Content |
|--------|--------------------|---------|
| PDF (draft) | `POST /api/export/pdf` exportMode=draft | Financial statements, clean ledger, optional reasoning chain; watermark "DRAFT — NOT CERTIFIED" |
| PDF (certified) | `POST /api/export/pdf` exportMode=certified | Same, no watermark; built from certified snapshot |
| CSV | `POST /api/export/csv` | Clean ledger rows |
| Audit binder | `GET /api/audit/binder?closeSessionId=` | Certified statements, chain verification (latestEntryHash) |
| Binder PDF/CSV | `GET /api/audit/binder/export/pdf`, `.../csv` | Certified binder export |
| Certification artifact | `GET /api/verification/certification/artifacts/:closeSessionId` | artifact, artifactHash, signatureB64, publicKeyB64 |
| Public key | `GET /api/verification/certification/public-key` | Ed25519 publicKeyB64 |
| Verification | `POST /api/verification/certification/verify` | artifactHash, signatureValid, snapshotHashMatches, auditChainVerified |
| Justification / audit defense | `GET /api/justification/audit-defense/export` | Audit defense PDF |
| GAAP consistency report | `GET /api/audit/gaap-consistency` | GAAP consistency report |
| Financial statements (JSON) | `POST /api/trial-balance/statements`, ingest response | Balance sheet, P&L, cash flow, etc. |

**Evidence:** `pdf_export.ts`, `export.ts`, `audit_binder.ts`, `verification/certification.ts`, `justification.ts`.

---

## 8. What the System Explicitly Does NOT Do

| Not Implemented | Evidence |
|-----------------|----------|
| Real QuickBooks/Xero/NetSuite API calls | `accounting_integration_service.ts` L59-91: `MockAccountingAdapter` returns mock data |
| General ledger as primary system of record | Trial balance is ingested; no double-entry ledger implementation; `period_trial_balance` stores entries JSON |
| Multi-currency conversion | Cannot confirm from code; no currency conversion logic found |
| Automatic bank feed | `syncTrialBalance` uses mock; `pullTransactions` returns mock transactions |
| User-facing workflow UI for close | Frontend has login, register, auditor, consolidation, diagnostics, genui pages; root redirects to diagnostics (`frontend/app/page.tsx`) |
| Real OCR for documents | `OCR_SERVICE_URL` in env example; no OCR implementation in routes/services |
| Write-back to external GL | `ENABLE_GL_POSTBACK` in env; cannot confirm write-back implementation from code |
| Invoice or bill matching | No invoice/bill entities or matching logic in schema |
| Consolidation across entities | `consolidation` page exists; cannot confirm full consolidation logic without reading more |
| Tax return preparation | `tax_returns` table exists; no tax-prep workflow in routes |

**Evidence:** `accounting_integration_service.ts` L59-95; `migrations` (no GL ledger table); `.env.example` (OCR_SERVICE_URL, ENABLE_GL_POSTBACK); `frontend/app/page.tsx`.

---

## Summary: What This Product Actually Is

This is a **period-close certification platform** that takes trial balance data (upload or mock-synced), enforces mathematical invariants (debits = credits, assets = liabilities + equity), routes imbalanced data to human review, runs a strict close-session state machine (draft → locked → certified), and produces certified PDF/CSV exports gated on an immutable audit chain and Ed25519-signed certification artifacts. AI is confined to advisory tables and cannot mutate deterministic financial data. Evidence is anchored by hash and included in the certified snapshot. The system is multi-tenant, role-aware, and supports BYOD Postgres. Accounting system integration (QuickBooks, Xero, NetSuite) is implemented with mock adapters only; no live API integration exists in the codebase.
