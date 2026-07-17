# Sovereign CPA Engine — V2 Comprehensive Codebase Audit

**Scope:** V2 (current codebase). Analysis based on executable code, migrations, and tests only. No documentation assumptions.

---

## Executive Summary

**Current state:** TB-only. The system ingests trial balance (CSV/XLSX), validates D=C and A=L+E, routes imbalanced data to HITL, runs a 6-state close session machine, and certifies with immutable hash-chained snapshots. Evidence is attached to journal entries (close adjustments) and included in the snapshot. Export is gated on certification.

**Missing for GL-first:** (1) No COA table or upload; (2) No GL table or upload; (3) No per-entry validation at ingest; (4) No GL→TB aggregation; (5) Snapshot does not include GL. `agenticLedgerToTrialBalance` exists but is never called.

**Critical path to GL:** COA + GL tables → GL upload + per-entry validation → GL→TB aggregation → extended snapshot. Estimated 70h critical path.

---

## TASK 1: DATABASE SCHEMA AUDIT

### Critical Tables

| TABLE | STATUS | PURPOSE | KEY COLUMNS | USED_BY | NOTES |
|-------|--------|---------|-------------|---------|-------|
| close_sessions | ACTIVE | Period close state machine | id, tenant_id, entity_id, period_start, period_end, status, certified_snapshot_id | close_session_service, close_sessions routes | status: draft→in_progress→ready_for_review→finalized→locked→certified |
| period_trial_balance | ACTIVE | Unadjusted TB per tenant+period | tenant_id, period_label, source, entries (JSONB) | trial_balance_store_service, ingest, adjusted_trial_balance_service | One row per tenant+period; upsert on save |
| audit_ledger | ACTIVE | Hash-chained append-only audit trail | id, tenant_id, previous_entry_hash, entry_hash, event_type | audit_ledger_repository, close_session_service, export_gate | Triggers block UPDATE/DELETE |
| tenant_hitl_staging | ACTIVE | HITL staging for imbalanced TB, overrides | id, tenant_id, status, type, payload | persistence_service, hitl routes, ingest | type: journal_entry, policy_change, adjustment, etc. |
| evidence_records | ACTIVE | Evidence metadata + hash | id, tenant_id, hash_sha256, size_bytes | evidence_repository, evidence_attachment_service | Files in storage; DB stores hash + metadata |
| evidence_links | ACTIVE | Link evidence to JEs | evidence_id, object_type, object_id | evidence_repository | object_type=journal_entry |
| ledger_snapshots | ACTIVE | Immutable certified snapshots | id, snapshot_hash, snapshot_payload_json, hash_version | ledger_snapshot_service, close_session_service | Triggers block UPDATE/DELETE |
| journal_entries | ACTIVE | Close adjustments (JE lifecycle) | id, close_session_id, status, source | journal_entry_service, protocol_bridge | NOT GL; used for manual/suggestion/recon/accrual JEs |
| journal_entry_lines | ACTIVE | JE lines | je_id, line_index, account_ref, debit, credit, amount_provenance | journal_entry_service | |
| certification_artifacts | ACTIVE | Signed attestation | artifact, artifact_hash, signature_b64 | certification_artifact_service | |
| tenant_chart_of_accounts | MISSING | — | — | — | No such table. coa_mapping_rules and fs_taxonomy_lines exist but are different. |
| general_ledger | MISSING | — | — | — | No GL table. journal_entries is for close adjustments only. |
| trial_balance (derived) | MISSING | — | — | — | TB is stored in period_trial_balance.entries (aggregated). No separate derived TB table. |

### Other Tables (sampling)

| TABLE | STATUS | PURPOSE |
|-------|--------|---------|
| coa_mapping_rules | ACTIVE | Map source accounts to fs_taxonomy_lines (not COA storage) |
| fs_taxonomy_lines | ACTIVE | Statement line taxonomy (PL/BS/CF); default lines for fallback |
| tenant_ai_proposals | ACTIVE | AI suggestions; ai.* schema |
| tenant_draft_adjustments | ACTIVE | Save-for-later drafts; not in export |
| evidence_policy | ACTIVE | Materiality-based evidence rules |
| period_export_checks | ACTIVE | Precomputed materiality flags |

---

## TASK 2: INGESTION FLOW AUDIT

### INGESTION FLOW ANALYSIS

**Current ingestion type:** TB_ONLY

**Entry point:** `src/routes/trial-balance/ingest.ts` L111 — `POST /api/trial-balance/ingest`

**Parser:** `src/services/fileIngestion.ts` — `ingestTrialBalanceFile()` → `parseCsvToTrialBalance()` or `parseXlsxToTrialBalance()`. Uses `parser_utils.ts` for column standardization (Balance, Amt, Dr, Cr, etc.).

**Validation:** `trialBalanceParser.ts` `parseTrialBalance()`; `absGt(totalDebits, totalCredits, tolerance)` from `getRoundingTolerance()` (0.01). Balance sheet equation in `integrity_gate_service.runIntegrityGate()` at statement build time, not ingest.

**Storage:** Balanced TB → `executeBridgeCommand` SaveTrialBalance → `saveUnadjustedFromUpload` → `period_trial_balance_repository.upsert` (`ingest.ts` L427-452).

**HITL routing:** Imbalanced TB → `createStagingItem` (tenant_hitl_staging) → `runClassifier`, `runAdvisor`, `saveProposals` → response `status: 'staged'` with `stagedId` (`ingest.ts` L204-306).

**GL capability:** MISSING. No GL upload endpoint. `agenticLedgerToTrialBalance` exists but is NOT called from ingest; `job_handlers.ts` L19: "FUTURE: agenticLedgerToTrialBalance not implemented."

**GL → TB aggregation:** PARTIAL. `agentic_ledger_to_tb.ts` can convert GL-like rows to TB rows (flattens to account level) but is never invoked in the ingest pipeline.

**Answers:**
1. Can the system ingest General Ledger? **NO**
2. GL ingestion code? **None.** `agenticLedgerToTrialBalance` exists but is unused.
3. Infrastructure for GL? **Partial:** classifier supports `general_ledger`; agentic_ledger_to_tb exists but is dead code.
4. TB format? CSV/XLSX with columns mappable to accountName, debit, credit (or Amount).
5. Per-entry validation (each JE balances)? **NO** — TB is account-level; no per-entry concept at ingest.
6. GL → TB aggregation? **MISSING** in live flow.

---

## TASK 3: VALIDATION LOGIC AUDIT

| VALIDATION GATE | LOCATION | IMPLEMENTATION | VALIDATES | ON_FAILURE | CALLED_FROM |
|-----------------|----------|----------------|-----------|------------|-------------|
| Per-entry (JE debits = credits) | journal_entry_service.ts L40 `validateBalanced` | COMPLETE | Each JE lines sum debits = sum credits | BLOCKS (throws JournalEntryError) | createDraftJE, proposeJE |
| TB-level (total debits = credits) | integrity_gate_service.ts L158-159 | COMPLETE | totalDebits === totalCredits (tolerance) | BLOCKS (MathematicalIntegrityError 422) | assertIntegrityGateOrThrow; ingest (imbalanced → HITL) |
| Balance sheet equation | integrity_gate_service.ts L161-163 | COMPLETE | totalAssets === totalLiabilities + totalEquity | BLOCKS | assertIntegrityGateOrThrow; buildCertifiedStatementsFromSnapshot |
| Evidence policy | evidence_policy_service.ts L54-66 | COMPLETE | Material JEs have required assertion types | BLOCKS_CERTIFICATION (hardBlockers) | checkEvidencePolicyForCertification; certifyCloseSession |
| State transition rules | close_session_service.ts L28-35, L195-199 | COMPLETE | ALLOWED_TRANSITIONS only | BLOCKS (CloseSessionError INVALID_TRANSITION) | advanceSession, certifyCloseSession |
| Plug detection | integrity_gate_service.ts L46-78 | COMPLETE | Suspicious plug accounts (Miscellaneous, Suspense) | Informational; used in runIntegrityGate caller logic | detectSuspiciousPlugs |

---

## TASK 4: CERTIFICATION FLOW AUDIT

**Entry point:** `src/services/close_session_service.ts` `certifyCloseSession` (L242). API: `POST /api/close/sessions/:id/certify`.

**Validations required:**
- Status === 'locked'
- Readiness (no hard blockers from computeReadiness)
- Evidence policy (checkEvidencePolicyForCertification)
- Trial balance passes buildCertifiedStatementsFromSnapshot (integrity gate)
- Adjusted TB exists (getAdjustedTrialBalance)

**Snapshot contents:**
- Trial Balance: YES — from getAdjustedTrialBalance
- General Ledger: NO — no GL in snapshot
- Chart of Accounts: NO
- Evidence manifest: YES — buildEvidenceManifest, included in payload

**Hash algorithm:** SHA-256 (`snapshot_hash.ts`, `createHash('sha256')`).

**Hash input:** Canonical JSON of trialBalance, entries, evidenceManifest (v3). Sorted by entrySortKey (accountName, debit, credit, lineId, accountCode, description, provenance). Decimal normalized to 2 places.

**Storage:** `ledger_snapshots` table.

**Immutability:** DATABASE_TRIGGERS — `ledger_snapshots_no_update`, `ledger_snapshots_no_delete` (`migrations/091_append_only_triggers.sql`).

**Snapshot includes GL:** NO.

---

## TASK 5: STATE MACHINE AUDIT

**States defined:** draft, in_progress, ready_for_review, finalized, locked, certified (`close_session_service.ts` L28-35).

**Transition rules:**
```
draft → in_progress
in_progress → draft | ready_for_review
ready_for_review → in_progress | finalized
finalized → ready_for_review | locked
locked → certified
certified → (none, terminal)
```

**Enforcement:** STRICT. `ALLOWED_TRANSITIONS` checked in `updateStatus` (L195-199); invalid transitions throw CloseSessionError INVALID_TRANSITION.

**Reverse transitions:** YES for non-terminal (e.g. in_progress → draft). Certified: NO (terminal).

**State storage:** `close_sessions.status` (migration 065).

**State transition API:** `POST /api/close/sessions/:id/advance` (draft→…→locked); `POST /api/close/sessions/:id/certify` (locked→certified).

---

## TASK 6: EXPORT GATING AUDIT

**Export endpoints:**
- `POST /api/export/pdf` — draft or certified
- `POST /api/export/csv`
- `GET /api/audit/binder` — certified-only
- `GET /api/audit/binder/export/pdf`
- `GET /api/audit/binder/export/csv`

**Certification check:** ENFORCED for certified mode. `export.ts` L155-161: session.status !== 'certified' → 403 CLOSE_NOT_CERTIFIED. `audit_binder.ts` L85-91: session.status !== 'certified' → 403.

**Bypass mechanism:** EXISTS. `exportMode=draft` allows export without certification; watermark applied. `ALLOW_IMBALANCED_DRAFT_EXPORT` allows draft export with imbalance banner.

**Ungated export paths:** Draft PDF/CSV (exportMode=draft) — no certification required.

**Implementation:** `export.ts` L135-174; `audit_binder.ts` L52-94; `checkExportGate` called before certified export (`export.ts` L176-200).

---

## TASK 7: EVIDENCE SYSTEM AUDIT

**Evidence upload:** IMPLEMENTED. `POST /api/close/journal-entries/:id/evidence/upload` (close_journal_entries.ts). Multipart; attachEvidenceWithFile.

**Storage backend:** Local disk or S3. `STORAGE_ADAPTER=local|s3`; local uses `EVIDENCE_STORAGE_PATH`; S3 uses `EVIDENCE_S3_BUCKET`. `evidence_storage_service.ts`.

**Hash computation:** SHA-256. `computeSha256` in evidence_storage_service; hash stored in evidence_records.hash_sha256.

**Evidence links to:** JOURNAL_ENTRIES (object_type, object_id in evidence_links).

**Manifest generation:** IMPLEMENTED. `evidence_manifest_service.buildEvidenceManifest` — sorted by journalEntryId, evidenceId.

**Manifest in snapshot:** YES. `evidenceManifest` in CreateLedgerSnapshotInput; included in snapshot payload (hash v3).

**Policy enforcement:** IMPLEMENTED. `evidence_policy_service.checkEvidencePolicyForCertification` — materiality threshold, required assertion types. Blocks certification when hardBlockers.

**Materiality rules:** CONFIGURED. `evidence_policy` table; `materialityThreshold`, `requiredAssertionTypes`, `enforcementMode` (off | warn_only | hard_block).

---

## TASK 8: AUDIT LEDGER VERIFICATION

**Table exists:** YES. `migrations/051_audit_ledger.sql`.

**Append-only triggers:** ACTIVE. `audit_ledger_no_update`, `audit_ledger_no_delete` (migrations/091).

**Hash algorithm:** SHA-256. `computeEntryHashV2` (canonical sorted keys + normalized dates).

**Hash payload:** tenantId, periodLabel, eventType, deterministicFlagSnapshot, agentDissentSnapshot, userPromptRationale, previousEntryHash, createdAt.

**Chain linking:** IMPLEMENTED. `previous_entry_hash` from `getLatestHash`; each entry's `entry_hash` includes `previous_entry_hash`.

**Chain verification:** IMPLEMENTED. `audit_ledger_repository.verifyChain` — walks entries, recomputes hashes, checks previous_entry_hash chain.

**Verification endpoint:** Called from `export_gate_service.checkExportGate`, `close_session_service.certifyCloseSession`, `verification/certification.ts` POST /verify. No dedicated public "verify chain" API; binder includes chainVerification.

---

## TASK 9: CHART OF ACCOUNTS CAPABILITY

**COA table:** MISSING. No `tenant_chart_of_accounts` table.

**COA upload:** MISSING.

**Storage scope:** NOT_APPLICABLE.

**Account types:** CAPTURED indirectly. `classifyTrialBalance` / `accountClassifier` assigns accountType; `fs_taxonomy_lines` has PL/BS/CF; `coa_mapping_rules` map source accounts to fs lines. No dedicated COA entity.

**Used in validation:** YES. Balance sheet equation uses classified entries (A, L, E). Classification comes from accountClassifier / coa_template_service, not a COA table.

**Account type options:** fs_taxonomy_lines: PL_REVENUE, PL_EXPENSE, BS_ASSET, BS_LIABILITY, BS_EQUITY. coa_template_service detects QuickBooks/NetSuite/Xero formats.

---

## TASK 10: GENERAL LEDGER CAPABILITY

**GL table:** MISSING. `journal_entries` is for close adjustments (draft→proposed→approved→posted), not GL upload.

**GL upload:** MISSING. No endpoint to upload GL.

**Entry parsing:** PARTIAL. `agentic_ledger_to_tb.ts` can parse GL-like rows but is never called. `ingestion_agent` classifies `general_ledger` but TB ingest uses `fileIngestion`, not ingestion_agent for the main path.

**Per-entry validation:** IMPLEMENTED only for journal_entry (close adjustments). No per-entry validation at TB/GL ingest.

**GL → TB aggregation:** MISSING in live flow. `agenticLedgerToTrialBalance` flattens GL rows to TB but is unused.

**Current GL capability:** NONE.

---

## TASK 11: HITL AUDIT

**Staging table:** EXISTS. `tenant_hitl_staging`.

**Staging trigger:** IMBALANCED_TB. When `absGt(totalDebits, totalCredits, tolerance)` at ingest, data is staged. Also policy_change, flag_override for overrides.

**AI integration:** IMPLEMENTED. `runClassifier`, `runAdvisor` on staged imbalanced TB; `saveProposals` to tenant_ai_proposals. AI suggests fixes but human must supply correction via resolve-ingest.

**AI capabilities:** Classifier (fs_placement, suggested_accounts); Advisor (proposals). No AI-generated amounts — "human supplies correction via resolve-ingest."

**Resolution workflow:** IMPLEMENTED. `POST /api/hitl/resolve` (approve/reject). `POST /api/hitl/resolve-ingest` — human supplies adjustment with provenance; re-validates math; saves to period_trial_balance.

**Granularity:** TB_LEVEL. HITL stages entire imbalanced TB; resolution applies correction entries to fix balance. No per-entry HITL for GL.

---

## TASK 12: FRONTEND CAPABILITIES

**COA upload UI:** MISSING. No COA upload component found.

**TB upload UI:** EXISTS. `FileUploadZone`, `HeroCommandCenter` (ActionDropzone), `smart-ingestion-dropzone`. `lib/ingest-types.ts` defines IngestResult for POST /api/trial-balance/ingest. Root redirects to /diagnostics.

**GL upload UI:** MISSING.

**Validation results:** EXISTS. Ingest result includes trialBalance, balanceSheet, profitAndLoss. Dashboard components display results.

**Close session dashboard:** EXISTS. `cfo-dashboard`, consolidation views. Root page redirects to /diagnostics (lab HUD).

**Certification flow:** EXISTS. Backend supports certify; frontend may call API. No dedicated certification wizard found.

**Evidence attachment:** EXISTS. Backend has upload endpoint; frontend components reference evidence/upload.

**Export page:** EXISTS. Export flows via API; notification/export context components exist.

**Overall completeness:** Partial. UI components exist but root redirects to diagnostics; no cohesive controller-facing flow.

---

## TASK 13: API ENDPOINT INVENTORY (Financial Ingestion & Certification)

| ENDPOINT | PURPOSE | STATUS | AUTH | REQUEST | CALLS |
|----------|---------|--------|------|---------|-------|
| POST /api/trial-balance/ingest | Upload TB (CSV/XLSX) | WORKING | JWT | multipart file, periodLabel, etc. | fileIngestion, parseTrialBalance, executeBridgeCommand SaveTrialBalance, createStagingItem |
| POST /api/hitl/resolve-ingest | Fix imbalanced staged TB | WORKING | JWT | stagedId, adjustment[] | getStagingItem, parseTrialBalance, executeBridgeCommand, persistence |
| POST /api/close/sessions/ensure | Ensure draft session | WORKING | JWT | entityId, periodLabel | ensureSessionForPeriod |
| POST /api/close/sessions/:id/advance | Advance state | WORKING | JWT | — | advanceSession |
| POST /api/close/sessions/:id/certify | Certify (locked→certified) | WORKING | JWT | certifiedBy, certificationMemo? | certifyCloseSession |
| POST /api/close/journal-entries | Create draft JE | WORKING | JWT | closeSessionId, source, lines[] | executeBridgeCommand CreateDraftJE |
| POST /api/close/journal-entries/:id/evidence/upload | Attach evidence | WORKING | JWT | multipart file | attachEvidenceWithFile |
| GET /api/close/journal-entries/:jeId/evidence/:evidenceId/download | Download evidence | WORKING | JWT | — | evidence storage adapter |
| POST /api/export/pdf | Generate PDF | WORKING | JWT | exportMode?, closeSessionId?, financial_statements, clean_ledger | checkExportGate, createPdfFromStructuredPayload |
| GET /api/audit/binder | Binder (certified-only) | WORKING | JWT | closeSessionId | getCertifiedStatementsForBinder, checkExportGate |
| GET /api/verification/certification/artifacts/:closeSessionId | Get artifact | WORKING | JWT | — | getArtifactByCloseSessionId |
| POST /api/verification/certification/verify | Verify artifact | WORKING | optional | artifact, signatureB64, publicKeyB64 | verifyArtifactHash, verifyChain |

---

## TASK 14: GAP ANALYSIS — TB-ONLY vs GL-FIRST

```
┌────────────────────────────────────────────────────────────────────┐
│ FEATURE                 │ CURRENT        │ TARGET     │ GAP        │
├────────────────────────────────────────────────────────────────────┤
│ COA Management          │ MISSING        │ REQUIRED   │ Full build │
│ GL Ingestion            │ MISSING        │ REQUIRED   │ Full build │
│ Per-Entry Validation    │ JE only (close)│ REQUIRED   │ Extend     │
│ GL → TB Aggregation     │ MISSING        │ REQUIRED   │ Full build │
│ TB Validation           │ COMPLETE       │ REQUIRED   │ Done       │
│ Evidence Policy         │ COMPLETE       │ REQUIRED   │ Done       │
│ Entry-Level HITL        │ TB-level only  │ OPTIONAL   │ Extend     │
│ Certification (GL-based)│ TB-based       │ REQUIRED   │ Snapshot   │
└────────────────────────────────────────────────────────────────────┘
```

**CRITICAL PATH (must build):**
1. COA table + upload — new table, endpoint, UI
2. GL table + upload — new table, endpoint, parser (entry grouping)
3. Per-entry validation at GL ingest — validate each entry D=C
4. GL → TB aggregation — deterministic aggregation by account
5. Certification snapshot to include GL — extend snapshot payload

**SECONDARY (can defer):**
- Entry-level HITL (stage individual unbalanced entries)
- COA-driven validation (account type from COA)

---

## TASK 15: BUILD PRIORITIZATION

### PHASE 1: FOUNDATION (MUST BUILD FIRST)

□ **Task 1.1: COA table and migration**
- Files: New migration `094_tenant_chart_of_accounts.sql`
- Schema: tenant_id, account_code, account_name, account_type (Asset|Liability|Equity|Revenue|Expense), parent_id?, effective_from, effective_to
- Effort: 4h
- Depends on: None

□ **Task 1.2: COA upload endpoint**
- Files: New route `routes/coa.ts` or extend onboarding; service `coa_upload_service.ts`
- Effort: 8h
- Depends on: Task 1.1

□ **Task 1.3: GL table and migration**
- Files: New migration `095_general_ledger.sql`
- Schema: tenant_id, period_label, entry_id, line_index, account_ref, debit, credit, description, amount_provenance, created_at
- Effort: 4h
- Depends on: None (can parallel with 1.1)

□ **Task 1.4: GL upload endpoint**
- Files: New route `routes/gl/ingest.ts`; parser for GL format (entry_id grouping)
- Effort: 16h
- Depends on: Task 1.3

□ **Task 1.5: Per-entry validation**
- Files: New validation in gl_ingest; validate each entry_id group sums debits = credits
- Effort: 4h
- Depends on: Task 1.4

### PHASE 2: INTEGRATION (BUILD SECOND)

□ **Task 2.1: GL → TB aggregation**
- Files: New service `gl_to_tb_aggregation_service.ts`; aggregate by account_ref
- Effort: 8h
- Depends on: Task 1.4, 1.5

□ **Task 2.2: Integrate GL aggregation into adjusted TB**
- Files: `adjusted_trial_balance_service.ts`; add GL as source alongside period_trial_balance
- Effort: 12h
- Depends on: Task 2.1

□ **Task 2.3: Extend snapshot to include GL**
- Files: `ledger_snapshot_service.ts`, `snapshot_hash.ts`; add generalLedger to payload; hash version bump
- Effort: 8h
- Depends on: Task 2.2

□ **Task 2.4: Certification reads GL**
- Files: `close_session_service.ts` certifyCloseSession; snapshot includes GL entries
- Effort: 6h
- Depends on: Task 2.3

### PHASE 3: ENHANCEMENT (BUILD THIRD)

□ **Task 3.1: COA upload UI**
- Files: frontend component, API integration
- Effort: 8h
- Depends on: Task 1.2

□ **Task 3.2: GL upload UI**
- Files: frontend component, API integration
- Effort: 12h
- Depends on: Task 1.4

□ **Task 3.3: Entry-level HITL (optional)**
- Files: Extend tenant_hitl_staging payload; route unbalanced entries to staging
- Effort: 16h
- Depends on: Task 2.1

**TOTAL ESTIMATED EFFORT:** ~110h  
**CRITICAL PATH:** ~70h (Phase 1 + Phase 2)

---

## RISK FLAGS

1. **agenticLedgerToTrialBalance is dead code** — Exists but never called. Cannot reuse as-is; would need integration into ingest pipeline and decision: use LLM or deterministic parse for GL.
2. **journal_entries conflates close-adjustment JEs with GL** — GL is different: bulk upload, entry_id grouping. Need clear separation.
3. **Snapshot hash versioning** — Adding GL to snapshot requires new hash version; must handle verification of existing v3 snapshots.
4. **Evidence links to JE** — Evidence is per journal_entry (close adjustment). For GL-first, evidence may need to link to GL lines or entries; schema consideration.

---

## QUICK WINS

1. **Wire agenticLedgerToTrialBalance into ingestion_agent** — When classification is `general_ledger`, call it and produce TB rows. Still TB output, but allows GL-shaped uploads to be processed. Effort: 4h.
2. **Add GET /api/verification/audit-chain** — Expose verifyChain for auditors. Effort: 2h.
3. **COA mapping rules → COA-like view** — `coa_mapping_rules` + `fs_taxonomy_lines` could be exposed as a "COA" API for read-only use before full COA build. Effort: 4h.

---

## FAKE FEATURES (Documented but Not Implemented)

- **GL ingestion** — Classifier and agentic_ledger_to_tb support "general_ledger" but no GL upload path exists.
- **COA upload** — No COA table or upload; coa_mapping_rules are mapping rules, not COA.
- **Accounting integration (QuickBooks/Xero/NetSuite)** — Mock adapter only; no real API calls.

---

*End of SOVEREIGN_CPA_ENGINE_V2_COMPREHENSIVE_AUDIT.md*
