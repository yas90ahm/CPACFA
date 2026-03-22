# Sovereign CPA Engine — Roadmap Assessment & Implementation Plan

## Context

Assessing 6 roadmap areas against the actual codebase (code files only, no docs) to determine what's built, how good each component is, and what needs to be built for the remaining gaps. The engine is a financial close automation system for PE-backed mid-market companies.

---

## SCORECARD: Current State

| # | Roadmap Area | Score | Status |
|---|---|---|---|
| 1 | Reconciliation Enforcement | **78%** | Built — needs polish |
| 2 | Evidence + Audit Layer Dominance | **85%** | Built — strong, minor gaps |
| 3 | JE Suggestion + Structured Approvals | **92%** | Built — production-ready |
| 4 | Subledger Integrations | **45%** | Skeleton only — mock adapters |
| 5 | Transaction-Level Validation | **45%** | Balance-level only — no matching engine |
| 6 | True Close Automation | **72%** | Manual-trigger only — no auto-advance |

---

## AREA 1: Reconciliation Enforcement — 78%

### What's Built (Strong)
- **15+ files**: `recon_service.ts`, `recon_completeness_gate.ts`, `period_reconciliation_service.ts`, `reconciliation_resolution_service.ts`, `roll_forward_recon_service.ts`, `intercompany_reconciliation_service.ts`
- DB: GENERATED columns for variance/tolerance (`102_tenant_period_reconciliations.sql`), UNIQUE constraint per account/period
- Gate #3 in 11-gate pipeline blocks advancement if recons incomplete
- Status flow: `not_started → in_progress → completed → approved`
- E2E tests: 25 scenarios in `group05_reconciliation.ts`
- Prior-period carryforward, intercompany support

### What's Missing (Quick Fixes)

| Fix | Files | Size |
|-----|-------|------|
| Explicit approval workflow — add `approvedBy`/`approvedAt` fields and enforce reviewer != preparer | `period_reconciliation_repository.ts`, migration | S |
| Evidence requirement for recons — extend evidence policy to cover recon completion, not just JEs | `evidence_policy_service.ts`, `recon_completeness_gate.ts` | S |
| Immaterial auto-waiver — if abs(variance) < configured threshold, auto-mark within tolerance | `period_reconciliation_service.ts`, settings migration | S |

---

## AREA 2: Evidence + Audit Layer — 85%

### What's Built (Strong)
- **20+ files**: `audit_ledger_service.ts`, `evidence_attachment_service.ts`, `evidence_policy_service.ts`, `evidence_storage_service.ts`, `certification_artifact_service.ts`
- Hash-chained audit ledger: SHA-256, v2 canonical hashing, DB trigger enforces chain on INSERT
- Append-only: triggers block UPDATE/DELETE on `audit_ledger`, `ledger_snapshots`, certified `period_trial_balance`
- Ed25519 signing: `cert_signing.ts` with env-based key management
- Evidence policy: `hard_block`/`warn_only`/`off` modes, materiality threshold
- Tests: integration tests for trigger enforcement, 10+ E2E evidence scenarios, chain verification tests

### What's Missing (Quick Fixes)

| Fix | Files | Size |
|-----|-------|------|
| Include recon evidence in certification manifest | `evidence_manifest_service.ts`, `certification_artifact_service.ts` | S |
| Chain verification UI indicator — show "Chain verified" badge on audit trail page | `frontend/app/close/[sessionId]/audit-trail/page.tsx`, new query hook | S |
| Checkpoint-based chain verification — resume from last checkpoint instead of O(n) full walk | `audit_ledger_repository.ts` | M |

---

## AREA 3: JE Suggestion + Structured Approvals — 92%

### What's Built (Production-Ready)
- **20+ files**: `journal_entry_service.ts` (740 lines), `aje_template_service.ts`, `shadow_auditor_service.ts`
- Full lifecycle: `draft → proposed → approved → posted → exported/rejected`
- SoD enforcement: approver != preparer, hardcoded in production
- Shadow Auditor: deterministic checks (restricted accounts, negative amounts, zero-zero lines) + AI audit pre-post
- Balance validation: Decimal.js exact, DB CHECK constraints
- Amount provenance tracking per line
- AJE templates: create, propose, apply, skip, auto-apply after N unchanged applications
- Evidence: materiality-gated attachment requirement on post
- Reversal support with scheduled reversals
- Tests: 30+ E2E scenarios

### What's Missing (Minor)

| Fix | Files | Size |
|-----|-------|------|
| Wire AI suggestion → JE draft creation explicitly in `journal_entry_service.ts` (currently lives in bridge) | `journal_entry_service.ts`, `protocol_bridge.ts` | S |
| Return materiality warnings synchronously in post response (currently async event only) | `shadow_auditor_service.ts`, `close_journal_entries.ts` | S |

---

## AREA 4: Subledger Integrations — 45% (NEEDS BUILD)

### What Exists
- Adapter interface: `IAccountingAdapter` with `syncTrialBalance`, `pushJournalEntry`, `pullTransactions`
- Connection CRUD: `accounting_connection_repository.ts`, routes, frontend settings page
- Mock adapter returns fabricated data for QB/Xero/NetSuite
- Bridge integration: sync → `SaveTrialBalance` command

### What Needs to Be Built

**Phase 4A: Real Provider Implementations (XL)**

| Item | Files to Create/Modify | Size |
|------|----------------------|------|
| OAuth2 flow service (authorization code grant + refresh) | New: `src/services/oauth_service.ts`, `src/routes/integrations/oauth_callback.ts`, migration for `oauth_tokens` table | L |
| QuickBooks Online adapter (REST API v3) | New: `src/adapters/quickbooks_adapter.ts` — chart of accounts sync, TB pull, JE push | L |
| Xero adapter (OAuth2 + REST) | New: `src/adapters/xero_adapter.ts` — same operations | L |
| NetSuite adapter (SuiteTalk REST / token-based auth) | New: `src/adapters/netsuite_adapter.ts` | L |
| Credential encryption at rest | New: `src/services/credential_vault_service.ts`, migration to encrypt `credentialRef` | M |

**Phase 4B: Sync Infrastructure (L)**

| Item | Files | Size |
|------|-------|------|
| Scheduled sync via job queue — add `accounting_sync` job type | `src/services/job_handlers.ts`, new migration for `sync_schedules` table | M |
| External reference tracking — persist externalId on posted JEs after push | `journal_entry_repository.ts`, migration adding `external_ref` column | S |
| Sync conflict detection — compare pulled TB vs local TB, surface differences | New: `src/services/sync_conflict_service.ts` | M |
| Sync history/log UI | New frontend page: `frontend/app/settings/integrations/[connectionId]/page.tsx` | M |

**Phase 4C: Subledger Detail (L)**

| Item | Files | Size |
|------|-------|------|
| Transaction pull + persist — store subledger transactions for recon matching | New: `src/db/repositories/subledger_transaction_repository.ts`, migration | M |
| Account mapping validation — verify pulled accounts map to COA | `accounting_integration_service.ts`, `coa_mapping_service.ts` | M |
| Subledger drill-down UI | New frontend component in reconciliation detail page | M |

---

## AREA 5: Transaction-Level Validation — 45% (NEEDS BUILD)

### What Exists
- Balance-level reconciliation (GL balance vs supporting balance with tolerance)
- Match group data model (`ReconItem`, `MatchGroup` in `recon_service.ts`)
- Reconciling item types: `outstanding_check`, `deposit_in_transit`, `bank_fee`, `timing_difference`, `error_correction`
- Manual confirm/reject of proposed match groups

### What Needs to Be Built

**Phase 5A: Bank Statement Ingestion (L)**

| Item | Files | Size |
|------|-------|------|
| Bank statement parser — CSV/OFX/QFX/MT940 format detection and extraction | New: `src/services/bank_statement_parser_service.ts` | L |
| Bank transaction storage | New migration: `tenant_bank_transactions` table (date, amount, description, reference, counterparty, status) | M |
| Bank feed upload UI — drag-drop with format auto-detection | New component in reconciliation detail page | M |

**Phase 5B: Matching Engine (XL)**

| Item | Files | Size |
|------|-------|------|
| Matching algorithm service — exact amount match, date-window match, fuzzy description match, 1:N and N:1 matching | New: `src/services/transaction_matching_service.ts` | XL |
| Match scoring — confidence score based on amount exactness, date proximity, description similarity | Part of matching service | included |
| Match proposal → confirm/reject workflow (extends existing match group model) | `recon_service.ts`, `recon_repository.ts` | M |
| Unmatched item aging — track how long items remain unmatched, surface in recon summary | `reconciliation_summary_service.ts`, new migration | S |

**Phase 5C: Exception Handling (M)**

| Item | Files | Size |
|------|-------|------|
| Clearing account logic — track outstanding checks/deposits with expected clearing dates | New: `src/services/clearing_account_service.ts` | M |
| Exception dashboard — unmatched items by age, amount, account | New frontend page or tab in reconciliation | M |
| Auto-match rules — user-defined rules (e.g., "match bank fees to account 6200 under $50") | New: `src/services/auto_match_rules_service.ts`, migration | M |

---

## AREA 6: True Close Automation — 72% (NEEDS BUILD)

### What Exists
- State machine: `OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED`
- 11 hard gates in `session_readiness_gates_service.ts`
- Job queue: `job_worker.ts` with `job_handlers.ts` (statement_generation, resolution_agent)
- Manual advancement via `POST /close/sessions/:id/advance`
- Auto-lock for certified sessions > 30 days

### What Needs to Be Built

**Phase 6A: Event-Driven Gate Monitoring (L)**

| Item | Files | Size |
|------|-------|------|
| Gate change event emitter — after key mutations (recon complete, JE posted, statement generated), emit `GATE_STATUS_CHANGED` event | New: `src/services/gate_event_service.ts`, hooks in `recon_service.ts`, `journal_entry_service.ts`, `statement_generation_service.ts` | L |
| Continuous gate monitor — background job that re-evaluates all gates on event, persists gate status snapshot | New job type in `job_handlers.ts`, new migration `gate_status_snapshots` | M |
| Gate notification service — when all gates pass, notify assignees (in-app + optional webhook) | New: `src/services/gate_notification_service.ts` | M |
| Auto-advance option — configurable per entity: when all gates pass, auto-advance to next state | `close_session_service.ts`, entity settings migration | M |

**Phase 6B: Workflow Orchestration (L)**

| Item | Files | Size |
|------|-------|------|
| Task assignment engine — assign close tasks to team members with deadlines | New: `src/services/task_assignment_service.ts`, migration for `close_tasks` table | M |
| Task dependency graph — define prerequisite ordering (e.g., "mapping before recon before statements") | New: `src/services/task_dependency_service.ts` | M |
| Checklist auto-completion — when underlying gate criteria met, auto-check the corresponding checklist item | `close_checklist_readiness_service.ts` | S |
| Close calendar — deadline tracking with SLA alerts | New: `src/services/close_calendar_service.ts`, migration | M |

**Phase 6C: Orchestration UI (M)**

| Item | Files | Size |
|------|-------|------|
| Close timeline/Gantt view — visual task dependency and progress | New frontend page or dashboard widget | L |
| Real-time gate status dashboard — live gate status with auto-refresh | Enhance `frontend/app/close/[sessionId]/page.tsx` | M |
| Notification center — in-app notifications for gate changes, task assignments, deadlines | New: `frontend/components/shared/NotificationCenter.tsx` | M |

---

## IMPLEMENTATION ORDER

```
Phase 0 (Quick Wins)     — Areas 1, 2, 3 gap fixes                    ~1 sprint
Phase 4A                  — OAuth + first real adapter (QuickBooks)     ~2 sprints
Phase 5A                  — Bank statement ingestion                    ~1 sprint
Phase 6A                  — Event-driven gate monitoring + auto-advance ~2 sprints
Phase 5B                  — Transaction matching engine                 ~2 sprints
Phase 4B                  — Sync infrastructure + scheduling            ~1 sprint
Phase 6B                  — Workflow orchestration + task assignment     ~2 sprints
Phase 5C + 6C             — Exception handling + orchestration UI       ~2 sprints
Phase 4C                  — Subledger detail pull + drill-down          ~1 sprint
Remaining adapters        — Xero + NetSuite adapters                   ~2 sprints
```

---

## VERIFICATION

### For Quick Fixes (Phase 0)
- Run existing E2E test suite: `npm test -- --testPathPattern=e2e`
- Verify recon approval SoD: create recon as user A, attempt approve as user A (should fail), approve as user B (should pass)
- Verify evidence manifest includes recon evidence in certification artifact
- Verify chain verification badge renders on audit trail page

### For New Features (Phases 4-6)
- Each phase should include integration tests following existing patterns in `tests/integration/`
- Transaction matching: seed bank transactions + GL entries, verify algorithm produces correct matches with >90% accuracy on test data
- Auto-advance: configure entity for auto-advance, complete all gates, verify session auto-transitions to UNDER_REVIEW
- OAuth: test with QuickBooks sandbox environment, verify token refresh cycle
- Full pipeline: GL upload → mapping → recon with bank matching → AJE → statements → auto-advance → certify → lock
