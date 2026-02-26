# Reverse-Engineered System Architecture (CPACFA/FinOS Agent)

*Generated from executable code only (.ts, .js, .sql) — no documentation files.*

---

## TASK 1: CORE DATA MODELS

─────────────────────────────────────────────────────────────────────────────

### Control DB (shared)

| Table | Purpose | Key Columns | Relationships | Used By |
|-------|---------|-------------|---------------|---------|
| tenants | Tenant registry; database_url for per-tenant DB | id, name, database_url | - | server, db/index.ts |
| users | Tenant users; auth | tenant_id (FK), email, password_hash, role | tenants | auth, middleware |

### Tenant DB (shared or per-tenant)

| Table | Purpose | Key Columns | Relationships | Used By |
|-------|---------|-------------|---------------|---------|
| core.tenant_chart_of_accounts | Chart of accounts per tenant | tenant_id, account_code, account_name, account_type (CHECK: Asset\|Liability\|Equity\|Revenue\|Expense) | - | coa_repository, gl_to_tb_aggregation_service |
| core.general_ledger | GL lines; per-entry debit/credit (CHECK: debit=0 OR credit=0) | tenant_id, period_label, entry_id, line_number, entry_date, account_code, debit, credit | - | general_ledger_repository, gl_upload_service |
| period_trial_balance | Unadjusted TB; source: uploaded, synced, gl_derived | tenant_id, period_label, source, entries (JSONB), uploaded_at/by | - | period_trial_balance_repository, trial_balance_store_service |
| close_sessions | Period close workflow; state machine | id, tenant_id, entity_id, period_start/end, status (draft\|in_progress\|ready_for_review\|finalized\|locked\|certified) | EXCLUDE overlap per tenant+entity | close_session_repository, certify flow |
| ledger_snapshots | Immutable certified snapshots; hash-chained | id, tenant_id, period_label, snapshot_payload_json, snapshot_hash, hash_version, close_session_id | close_sessions | ledger_snapshot_repository, export_gate |
| audit_ledger | Append-only audit log; hash-chained | id, tenant_id, period_label, event_type, previous_entry_hash, entry_hash | - | audit_ledger_repository, export_gate |
| tenant_hitl_staging | Human-in-the-loop proposed actions | id, tenant_id, proposed_action, justification, status, type | - | hitl_orchestrator, persistence_service |
| period_export_checks | Materiality flags for export gate | tenant_id, period_label, rounding_gap_exceeds_materiality, aggregate_rounding_exceeds_materiality | - | period_export_checks_repository |
| evidence_policy | Evidence requirements for certification | tenant_id, enforcement_mode, materiality_threshold, required_assertion_types | - | evidence_policy_repository |
| journal_entries, journal_entry_lines | Posted JEs; evidence links | - | - | journal_entry_repository, evidence_policy_service |

---

## TASK 2: API SURFACE

─────────────────────────────────────────────────────────────────────────────

### Auth
| Method | Path | Handler | Auth | Input | Output |
|--------|------|---------|------|-------|--------|
| POST | /api/auth/login | auth.ts | - | { email, password } | JWT |
| POST | /api/auth/register | auth.ts | - | { email, password, ... } | user |

### Chart of Accounts
| Method | Path | Handler | Auth | Input | Output |
|--------|------|---------|------|-------|--------|
| POST | /api/coa/upload | coa.ts | optionalAuth | multipart file (CSV) | { success, accountCount, errors? } |
| GET | /api/coa | coa.ts | requireValidTenantId | - | { accounts } |
| GET | /api/coa/:accountCode | coa.ts | requireValidTenantId | - | { account } |

### General Ledger
| Method | Path | Handler | Auth | Input | Output |
|--------|------|---------|------|-------|--------|
| POST | /api/gl/ingest | gl/ingest.ts | requireValidTenantId | multipart file, ?period | { balancedCount, imbalancedCount, ... } |
| GET | /api/gl/trial-balance | gl/ingest.ts | requireValidTenantId | ?period | { derivedTB, status } |
| GET | /api/gl/export | gl/ingest.ts | requireValidTenantId | ?period, ?format=csv | CSV or JSON |
| GET | /api/gl | gl/ingest.ts | requireValidTenantId | ?period | { period, entries } |
| GET | /api/gl/entries/:entryId | gl/ingest.ts | requireValidTenantId | ?period | { entry } |

### Close Sessions
| Method | Path | Handler | Auth | Input | Output |
|--------|------|---------|------|-------|--------|
| POST | /api/close/sessions/ensure | close_sessions.ts | - | { entityId, periodLabel } | { closeSessionId, status, created } |
| POST | /api/close/sessions | close_sessions.ts | - | body | session |
| GET | /api/close/sessions/:id | close_sessions.ts | - | - | session |
| POST | /api/close/sessions/:id/advance | close_sessions.ts | - | { targetStatus } | session |
| POST | /api/close/sessions/:id/certify | close_sessions.ts | - | { certifiedBy, memo? } | session + snapshot |
| GET | /api/close/sessions | close_sessions.ts | - | query | sessions[] |

### Export
| Method | Path | Handler | Auth | Input | Output |
|--------|------|---------|------|-------|--------|
| POST | /api/export/pdf | export.ts | - | ReportPayload, exportMode, closeSessionId? | PDF |
| GET | /api/audit/binder/export/pdf | audit_binder.ts | - | ?closeSessionId | PDF (certified only) |
| GET | /api/audit/binder/export/csv | audit_binder.ts | - | ?closeSessionId | CSV (certified only) |

### Verification
| Method | Path | Handler | Auth | Input | Output |
|--------|------|---------|------|-------|--------|
| GET | /api/verification/certification/public-key | certification.ts | - | - | { publicKeyB64 } |
| GET | /api/verification/certification/artifacts/:closeSessionId | certification.ts | AuthRequest | - | { artifact, artifactHash, signatureB64 } |
| POST | /api/verification/certification/verify | certification.ts | - | { artifact, signatureB64, publicKeyB64 } | { signatureValid, snapshotHashMatches?, auditChainVerified? } |

### HITL
| Method | Path | Handler | Auth | Input | Output |
|--------|------|---------|------|-------|--------|
| POST | /api/hitl/resolve | hitl.ts | - | { id, action: approve\|reject, reason } | { ok, item } |

---

## TASK 3: PRIMARY DATA FLOW

─────────────────────────────────────────────────────────────────────────────

### FLOW 1: COA Upload

```
Entry Point: POST /api/coa/upload
    ↓
Middleware: multer.single('file'), requireValidTenantId
    ↓
Service: coa_upload_service.uploadCoaForTenant()
    ├─ parseCoaCsv() → CoaUploadRow[]
    ├─ Validate account_type ∈ {Asset,Liability,Equity,Revenue,Expense}
    └─ coa_repository.upsertAccounts()
    ↓
Table: core.tenant_chart_of_accounts
    ↓
Result: COA stored at tenant level; used for GL validation and TB derivation
```

### FLOW 2: GL Upload

```
Entry Point: POST /api/gl/ingest?period=X
    ↓
Service: gl_upload_service.uploadGLForPeriod()
    ├─ parseGLCsv() → GLUploadRow[]
    ├─ groupAndNumberLines() → GeneralLedgerLine[]
    ├─ validateGLEntries() (per-entry debits = credits, tolerance 0.01)
    │   ├─ Balanced → general_ledger_repository.insertLines()
    │   └─ Imbalanced → NOT saved to GL (returned in response for HITL)
    ├─ buildDerivedTrialBalance() (gl_to_tb_aggregation_service)
    └─ saveUnadjustedFromGLDerived() → period_trial_balance (source: gl_derived)
    ↓
Tables: core.general_ledger, period_trial_balance
    ↓
Result: GL stored; TB derived and persisted
```

### FLOW 3: Trial Balance Derivation

```
Triggered By: GL upload OR GET /api/gl/trial-balance
    ↓
Service: gl_to_tb_aggregation_service.buildDerivedTrialBalance()
    ├─ glRepository.getGLForPeriod()
    ├─ coaRepository.getAccountsByTenant()
    ├─ aggregateGLToTB() — group by account_code, sum debits/credits
    ├─ computeBalanceSheetTotals() — A, L, E from account_type
    └─ validateDerivedTB() — D=C and A=L+E (tolerance from financial_rules.json)
    ↓
Result: Derived TB with validation status; optionally saved via saveUnadjustedFromGLDerived
```

### FLOW 4: Certification

```
Entry Point: POST /api/close/sessions/:id/certify
    ↓
Precondition: Session status = 'locked'
    ↓
Service: close_session_service.certifyCloseSession()
    ├─ Row lock (SELECT FOR UPDATE)
    ├─ computeReadiness() — hard blockers check
    ├─ checkEvidencePolicyForCertification() — material JEs have required evidence (if policy enabled)
    ├─ getTrialBalanceForCertification() — TB from period_trial_balance (uploaded/synced/gl_derived) + adjustments
    ├─ buildCertifiedStatementsFromSnapshot() — throws if imbalance (Truth Gate)
    ├─ buildEvidenceManifest()
    ├─ createSnapshotFromTrialBalanceAndEntries() — ledger_snapshot_service
    │   ├─ Build payload: trialBalance, evidenceManifest, generalLedger (if GL present)
    │   ├─ computeSnapshotHash() (SHA-256, canonical JSON)
    │   └─ ledger_snapshot_repository.insert()
    ├─ buildCertificationArtifact() — snapshot + audit chain
    ├─ certArtifactRepo.insertCertificationArtifact()
    ├─ recordMaterialEvent('certify_close')
    └─ updateStatus('certified')
    ↓
Tables: ledger_snapshots, certification_artifacts, audit_ledger
    ↓
Result: Immutable certified snapshot with hash; session status = certified
```

### FLOW 5: Export (Certified)

```
Entry Point: POST /api/export/pdf (exportMode=certified) OR GET /api/audit/binder/export/pdf
    ↓
Precondition: closeSessionId, session.status === 'certified'
    ↓
Service: export_gate_service.checkExportGate()
    ├─ period_export_checks: roundingGapExceedsMateriality, aggregateRoundingExceedsMateriality
    ├─ verifyChain() — audit_ledger hash chain
    ├─ listStoredEvidenceForPeriod() + verifyEvidenceIntegrity()
    └─ (if ENABLE_INTEGRATED_SUPERVISOR) getUnresolvedConflicts(), resolution count match
    ↓
Gate Pass?
    ├─ NO → 403 with CRITICAL_TAMPER_ALERT / UNRESOLVED_CONFLICTS
    └─ YES → getCertifiedStatementsForBinder() / buildReportPayloadWithAgent()
    ↓
Result: PDF/CSV export with GL included
```

### FLOW 6: Verification

```
Entry Point: POST /api/verification/certification/verify
    ↓
Input: { artifact, signatureB64, publicKeyB64 }
    ↓
Service: computeArtifactHash(), verifyArtifactHash() (Ed25519)
    ↓
If tenantId + snapshotId: getLedgerSnapshotById(), verifyChain()
    ↓
Output: { signatureValid, snapshotHashMatches?, auditChainVerified? }
```

---

## TASK 4: VALIDATION GATES

─────────────────────────────────────────────────────────────────────────────

| Gate | Location | Validates | Tolerance | On Failure | Called From |
|------|----------|-----------|-----------|------------|-------------|
| Per-Entry Journal Balance | gl_upload_service.validateGLEntries | Each entry_id: debits = credits | 0.01 (default) | Imbalanced entries NOT saved; returned in response | uploadGLForPeriod |
| Trial Balance Balance | integrity_gate_service.runIntegrityGate | totalDebits = totalCredits | financial_rules.roundingTolerance (0.01) | MathematicalIntegrityError (422) | certify, export |
| Balance Sheet Equation | integrity_gate_service.runIntegrityGate | Assets = Liabilities + Equity | same | MathematicalIntegrityError (422) | certify, export |
| State Machine | close_session_service.updateStatus | ALLOWED_TRANSITIONS | - | CloseSessionError INVALID_TRANSITION (409) | advance |
| Export Gate | export_gate_service.checkExportGate | period_export_checks, audit chain, evidence integrity, conflicts | - | 403 CRITICAL_TAMPER_ALERT | export, binder |
| Evidence Policy | evidence_policy_service.checkEvidencePolicyForCertification | Material JEs have required assertion types | policy.materialityThreshold | hard_block → HARD_BLOCKERS (409) | certify, computeReadiness |
| Plug Detection | integrity_gate_service.detectSuspiciousPlugs | Plug accounts (Misc/Suspense/Other) < threshold of net activity | 0.9 | Advisory; blocks AI adjustment if suspicious | agent flow |

### State Machine Transitions (close_session_service.ts:29–36)

```
draft → in_progress
in_progress → draft | ready_for_review
ready_for_review → in_progress | finalized
finalized → ready_for_review | locked
locked → certified
certified → (terminal)
```

---

## TASK 5: SERVICE LAYER

─────────────────────────────────────────────────────────────────────────────

| Service | Purpose | Key Functions | Dependencies | Used By |
|---------|---------|---------------|--------------|---------|
| coa_upload_service | Parse and upsert COA CSV | parseCoaCsv, uploadCoaForTenant | coa_repository | coa route |
| gl_upload_service | Parse, validate, persist GL | parseGLCsv, groupAndNumberLines, validateGLEntries, uploadGLForPeriod | gl_repository, gl_to_tb_aggregation_service, trial_balance_store_service | gl/ingest route |
| gl_to_tb_aggregation_service | GL → TB aggregation | aggregateGLToTB, computeBalanceSheetTotals, buildDerivedTrialBalance, validateDerivedTB | gl_repository, coa_repository | gl_upload_service, gl route |
| trial_balance_store_service | Persist TB (uploaded/synced/gl_derived) | saveUnadjustedFromUpload, saveUnadjustedFromGLDerived | period_trial_balance_repository | gl_upload_service |
| close_session_service | Close workflow, certify | createSession, updateStatus, certifyCloseSession, advanceSession | close_session_repository, ledger_snapshot_service, evidence_policy_service | close_sessions route |
| ledger_snapshot_service | Build and store snapshots | createSnapshotFromTrialBalanceAndEntries | ledger_snapshot_repository, snapshot_hash | close_session_service |
| integrity_gate_service | TB + BS validation | runIntegrityGate, assertIntegrityGateOrThrow, detectSuspiciousPlugs | rules_registry | certified_statements, export |
| export_gate_service | Pre-export checks | checkExportGate | audit_ledger_repository, period_export_checks, evidence_storage | export, audit_binder |
| evidence_policy_service | Evidence for certification | checkEvidencePolicyForCertification, computeEvidenceSummary | evidence_policy_repository, journal_entry_repository | close_session_service |
| certified_statements_service | Build FS from snapshot | buildCertifiedStatementsFromSnapshot | integrity_gate (throws on imbalance) | close_session_service |
| audit_ledger_service | Append audit entries | recordOverride, recordMaterialEvent | audit_ledger_repository | hitl, certify |
| hitl_orchestrator | HITL staging | submitToStaging, receiveHumanApproval, getStagingArea | persistence_service | hitl route |

---

## TASK 6: IMMUTABILITY & INTEGRITY

─────────────────────────────────────────────────────────────────────────────

### MECHANISM 1: Append-Only Audit Ledger

- **Implementation:** migrations/051_audit_ledger.sql, 091_append_only_triggers.sql
- **Table:** audit_ledger
- **Enforcement:** Triggers prevent UPDATE/DELETE (prevent_audit_ledger_mutation)
- **Hash:** SHA-256; payload: tenantId, periodLabel, eventType, deterministicFlagSnapshot, agentDissentSnapshot, userPromptRationale, previousEntryHash, createdAt
- **Chain:** previous_entry_hash links to prior row; entry_hash computed per row
- **Verification:** audit_ledger_repository.verifyChain() — walks chain, validates hashes

### MECHANISM 2: Snapshot Immutability

- **Implementation:** migrations/083_ledger_snapshots.sql, 091_append_only_triggers.sql
- **Table:** ledger_snapshots
- **Enforcement:** Triggers prevent UPDATE/DELETE (prevent_ledger_snapshots_mutation)
- **Hash:** src/lib/snapshot_hash.ts — canonical JSON, SHA-256
- **Hash Includes:** hash_version, trialBalance (entries, totalDebits, totalCredits), entries?, evidenceManifest?, generalLedger?
- **Versions:** v1 (legacy), v2 (canonical money strings), v3 (+evidence), v4 (+GL)

### MECHANISM 3: period_trial_balance (when certified)

- **Implementation:** 091_append_only_triggers.sql
- **Enforcement:** Block UPDATE/DELETE when linked close_session has status 'certified'

### MECHANISM 4: State Machine

- **Implementation:** close_session_service.ts
- **States:** draft, in_progress, ready_for_review, finalized, locked, certified
- **Terminal:** certified (no outgoing transitions)
- **Enforcement:** updateStatus() throws on invalid transition

---

## TASK 7: EXTERNAL INTEGRATIONS

─────────────────────────────────────────────────────────────────────────────

| Integration | Type | Implementation | Direction | Data | Status |
|-------------|------|----------------|-----------|------|--------|
| Accounting connections | API | accounting_integration.ts | Bidirectional | sync trial balance, push JE, pull transactions | Active |
| OAuth (Google) | OAuth | integrations.ts | Inbound | Gmail/Drive auth | Active |
| Certification signing | Ed25519 | cert_signing.ts | Outbound | Artifact hash signed for verification | Optional (keys required in strict mode) |

---

## TASK 8: SYSTEM ARCHITECTURE SUMMARY

══════════════════════════════════════════════════════════════════════════════

### SYSTEM PURPOSE

A **period close and financial certification platform** (FinOS Agent / CPACFA) that:
- Ingests Chart of Accounts and General Ledger (CSV)
- Derives or accepts Trial Balance
- Manages a stateful close workflow (draft → … → certified)
- Certifies periods with immutable snapshots (TB + optional GL + evidence manifest)
- Enforces integrity gates (math, evidence policy) before certification and export

### CORE CAPABILITIES

- COA and GL CSV upload with flexible column mapping
- Per-entry journal balance validation; imbalanced entries rejected
- GL-derived Trial Balance with A=L+E check
- Close session state machine with advance/certify
- Immutable snapshot creation with SHA-256 hash
- Export gate (materiality, audit chain, evidence integrity)
- HITL staging for overrides with audit ledger recording
- Certification artifact signing (Ed25519) for external verification

### ARCHITECTURE PATTERN

**Layered monolith:** Express API → Services → Repositories → PostgreSQL

### LAYERS

```
├─ API Layer: routes (auth, coa, gl, close, export, audit, hitl, verification, ...)
├─ Service Layer: gl_upload_service, close_session_service, integrity_gate_service, ...
├─ Repository Layer: general_ledger_repository, period_trial_balance_repository, ...
└─ Database Layer: PostgreSQL (control + tenant DBs), migrations 001–096
```

### KEY DESIGN DECISIONS

- **GL-derived TB:** TB can be derived from GL and stored with source=gl_derived
- **Hash-chained audit log:** audit_ledger uses previous_entry_hash for chain integrity
- **Immutable snapshots:** ledger_snapshots never updated/deleted
- **Truth Gate:** buildCertifiedStatementsFromSnapshot throws if TB/BS imbalance
- **Evidence policy:** Optional hard_block for material JEs without required evidence

### DETERMINISTIC COMPONENTS (Cannot be overridden)

- Per-entry balance check (gl_upload_service)
- Trial balance / balance sheet integrity gate (integrity_gate_service)
- State machine transitions (close_session_service)
- Export gate (export_gate_service)
- Snapshot hash computation (snapshot_hash.ts)
- Audit ledger chain verification

### AI/ADVISORY COMPONENTS (Suggest, not enforce)

- Accrual suggestions, JE suggestions (close_je_accruals)
- Shadow audit, classification suggestions (various)
- HITL: AI proposals go to staging; human must approve

### DATA FLOW SUMMARY

```
Upload COA → Upload GL → Validate Per-Entry → Save Balanced → Derive TB →
Save TB (gl_derived) → Create/Ensure Session → Advance States →
Certify (locked only) → Build Snapshot → Compute Hash → Save Snapshot →
Export Gate (chain, materiality, evidence) → Export PDF/CSV
```

### INTEGRITY GUARANTEES

- **Math correctness:** D=C and A=L+E enforced at ingest and certification
- **Immutability:** audit_ledger, ledger_snapshots, period_trial_balance (when certified) protected by triggers
- **Auditability:** Hash-chained audit ledger; certification artifact with signature

### WHAT THIS SYSTEM IS

A **financial close and certification backend** for trial balance ingestion, period close workflow, certified snapshot creation, and controlled export with integrity gates.

### WHAT THIS SYSTEM IS NOT

- Not a full ERP (no inventory, AR/AP modules)
- Not a general-purpose BI platform
- Not a real-time ledger (batch CSV/API ingestion)
