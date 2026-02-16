# Sovereign CPA Engine — Architecture & Frontend Specification

**Document Purpose:** Architectural analysis of the deterministic financial certification infrastructure layer. Use this to build a UI that communicates structural integrity, separation of concerns, and mathematical rigor.

---

## 1. Core Architecture Summary

The Sovereign CPA Engine is **not** a traditional accounting system or ERP. It is a **deterministic validation and certification protocol** that operates alongside existing systems. Key invariants:

| Invariant | Enforcement |
|-----------|-------------|
| **Deterministic core cannot be overridden** | AI writes to `ai.*` schema only; `ai_writer` role has no INSERT on `core.*`; `assertNoAiMutationContext()` throws in prod when AI attempts mutation |
| **All journal entries require human attribution** | `amountProvenance` required for non-zero amounts; `createdBy` / `approvedBy`; Protocol Bridge records `recordMaterialEvent` for every mutation |
| **Certified snapshots are immutable** | DB triggers on `ledger_snapshots` block UPDATE/DELETE; `period_trial_balance` blocks UPDATE/DELETE when linked close_session is certified |
| **Evidence is anchored (hashed), not stored in snapshot** | `evidence_records.hash_sha256`; manifest includes hashes; `evidenceManifest` in snapshot payload for v3+ hash |
| **All state transitions recorded in verifiable audit chain** | `audit_ledger` append-only; `previous_entry_hash` → `entry_hash` chain; triggers block UPDATE/DELETE |

---

## 2. State Machine — Period / Close Session

### States

```
draft → in_progress → ready_for_review → finalized → locked → certified
```

| State | Allowed Next States | Notes |
|-------|---------------------|-------|
| draft | in_progress | Initial state |
| in_progress | draft, ready_for_review | Working state |
| ready_for_review | in_progress, finalized | Review gate |
| finalized | ready_for_review, locked | Pre-lock |
| locked | certified | **Only** locked → certified |
| certified | — | **Terminal**; no outgoing transitions |

### Transition Rules

- **Certify**: Only from `locked`. Throws `INVALID_TRANSITION` if status ≠ locked.
- **Advance**: Draft → … → locked (one call advances one step). Locked → certified via separate certify endpoint.
- **Rollback**: Allowed only for non-terminal states (e.g. in_progress → draft).
- **Concurrent access**: `SELECT ... FOR UPDATE` in certify; row lock in advance.

### Source

`src/services/close_session_service.ts` L27-35, L195-199, L261-267, L411-423

---

## 3. Deterministic Core — Mathematical Validation

### Integrity Gate

- **Debit = Credit**: `totalDebits === totalCredits` (tolerance from `financial_rules.json`, typically 0.01).
- **Balance Sheet Equation**: `totalAssets === totalLiabilities + totalEquity`.
- **Plug Detection**: `detectSuspiciousPlugs()` flags accounts matching `Miscellaneous|Suspense|Other` when plug share ≥ threshold (default 0.9).
- **Failure**: Throws `MathematicalIntegrityError` → 422; no soft warnings.

### Source

`src/services/integrity_gate_service.ts` L46-78, L153-210; `shared/config/financial_rules.json`

### Trial Balance Ingest

- Imbalanced TB → routed to HITL staging (`tenant_hitl_staging`); not written to `period_trial_balance`.
- Row limit: `MAX_TB_ROWS` (default 100,000); 413 when exceeded.

---

## 4. Agentic Advisory Layer

### AI Boundary

- **DB-enforced**: Migration 093 creates `core_writer`, `ai_writer`, `auditor_reader`. `ai_writer` can INSERT only into `ai.*` tables.
- **Runtime guard**: `assertNoAiMutationContext()` in `executeBridgeCommand`, `certifyCloseSession`. In prod/staging, throws if called from within AI advisory context.
- **Staging tables**: `tenant_ai_proposals`, `ai_call_log`, `tenant_hitl_staging`, `tenant_supervisor_sessions`.
- **Human approval flow**: `persistence_service.approveStagingItem` moves from staging to deterministic tables; `rejectStagingItem` for rejection.

### Source

`src/lib/ai_boundary.ts`; `src/startup_validation.ts` L191-225; `src/services/persistence_service.ts`; `src/bridge/protocol_bridge.ts` L33 (`assertNoAiMutationContext`)

---

## 5. Evidence Anchoring

- **File upload**: POST multipart; SHA-256 computed on upload; stored in `evidence_records.hash_sha256`.
- **Link to JE**: `evidence_links` (object_type, object_id).
- **Manifest**: `buildEvidenceManifest()` — sorted by journalEntryId, then evidenceId. Deterministic.
- **Manifest in snapshot**: `evidenceManifest` included in `LedgerSnapshotPayload` (hash version 3+).
- **Storage**: Local or S3 via `STORAGE_ADAPTER`; files stored by adapter, metadata + hash in DB.
- **Download**: GET `/api/close/journal-entries/:jeId/evidence/:evidenceId/download` streams from adapter.
- **Integrity check**: `verifyEvidenceIntegrity()` — recomputes hash from stored file; blocks export on mismatch.

### Source

`src/services/evidence_manifest_service.ts`; `src/services/evidence_storage_service.ts`; `src/routes/close/close_journal_entries.ts` L641; `src/services/export_gate_service.ts` L127-137

---

## 6. Audit Ledger — Hash-Chained Append-Only

- **Schema**: `audit_ledger` (id, tenant_id, period_label, event_type, deterministic_flag_snapshot, agent_dissent_snapshot, user_prompt_rationale, previous_entry_hash, entry_hash, created_at, hash_version).
- **Chain**: Each entry's `entry_hash` = SHA-256(canonical payload including `previous_entry_hash`). First entry: `previous_entry_hash` null.
- **Verification**: `verifyChain()` walks entries in order, recomputes hashes; detects mutation, truncation, insertion.
- **DB immutability**: Triggers `audit_ledger_no_update`, `audit_ledger_no_delete` raise exception on UPDATE/DELETE.
- **Hash versions**: v1 (legacy), v2 (canonical), v3 (evidence manifest).

### Source

`src/db/repositories/audit_ledger_repository.ts` L90-230; `migrations/091_append_only_triggers.sql` L6-22

---

## 7. Certification Gates

Before certification is allowed:

1. **Status**: Must be `locked`.
2. **Readiness**: No hard blockers from `computeReadiness()` (checklist, triage, etc.).
3. **Evidence policy**: `checkEvidencePolicyForCertification()`.
4. **Audit chain**: `verifyChain()` must pass (run at certify time).
5. **Balance**: Trial balance must balance; no materiality breach.

Before **export** (certified PDF/CSV):

1. **Session status**: `session.status === 'certified'`.
2. **Export gate**: `checkExportGate()` —
   - Audit chain valid
   - Rounding gap ≤ materiality (from DB, not client)
   - Evidence integrity (hash mismatch → block)
   - Unresolved conflicts = 0 (when Integration enabled)
   - Resolution count match (resolved conflicts vs ledger `user_induced_variance` count)

### Source

`src/services/close_session_service.ts` L238-400; `src/services/export_gate_service.ts` L55-184; `src/routes/export.ts` L135-204; `src/routes/audit/audit_binder.ts` L52-94

---

## 8. Export Gating — Physical Prevention

- **Certified export**: Requires `closeSessionId` and `session.status === 'certified'`. 403 if not.
- **Materiality flags**: Client **cannot** supply `roundingGapExceedsMateriality` or `aggregateRoundingExceedsMateriality`; 403 if present (tampering attempt).
- **Export gate**: Runs server-side before PDF/CSV generation. On `allowed: false` → 403 with `CRITICAL_TAMPER_ALERT`, `UNRESOLVED_CONFLICTS_ALERT`, or `RESOLUTION_MISMATCH`.
- **Draft export**: Allowed without certification; watermark applied.

### Source

`src/routes/export.ts` L78-94, L135-204; `src/services/export_gate_service.ts`

---

## 9. API Endpoint Inventory

### Period / Close Session Management

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | /api/close/sessions/ensure | Idempotent ensure session (draft) | `{ entityId, periodLabel }` | `{ closeSessionId, status, created }` |
| POST | /api/close/sessions | Create session | `{ entityId, periodStart, periodEnd, basis?, standard? }` | `{ session }` |
| GET | /api/close/sessions/:id | Get session | — | `{ session }` |
| GET | /api/close/sessions | List sessions | query: entityId?, status? | `{ sessions }` |
| POST | /api/close/sessions/:id/advance | Advance state (draft → … → locked) | — | `{ session, actionTaken }` |
| POST | /api/close/sessions/:id/certify | Certify (locked → certified) | `{ certifiedBy, certificationMemo? }` | `{ session, certifiedSnapshotId }` |
| GET | /api/close/sessions/:id/readiness | Readiness / blockers | — | `{ ready, hardBlockers, softWarnings }` |
| PATCH | /api/close/sessions/:id/status | Direct status update (admin) | `{ status }` | `{ session }` |

### Journal Entry Lifecycle

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | /api/close/journal-entries | Create draft JE | `{ closeSessionId, source, lines[], memo? }` | `{ journalEntry }` |
| GET | /api/close/journal-entries | List JEs | query: closeSessionId | `{ journalEntries }` |
| GET | /api/close/journal-entries/:id | Get JE with lines | — | `{ journalEntry, lines }` |
| PATCH | /api/close/journal-entries/:id | Update draft JE | `{ lines?, memo? }` | `{ journalEntry }` |
| POST | /api/close/journal-entries/:id/propose | Propose for approval | — | `{ journalEntry }` |
| POST | /api/close/journal-entries/:id/approve | Approve JE | `{ approvedBy }` | `{ journalEntry }` |
| POST | /api/close/journal-entries/:id/reject | Reject JE | `{ reason }` | `{ journalEntry }` |
| POST | /api/close/journal-entries/:id/evidence/upload | Attach evidence | multipart file | `{ evidenceId, hashSha256 }` |
| GET | /api/close/journal-entries/:jeId/evidence/:evidenceId/download | Download evidence | — | file stream |

### Evidence Anchoring

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | /api/close/journal-entries/:id/evidence/upload | Upload + hash | multipart | `{ evidenceId }` |
| GET | /api/close/journal-entries/:jeId/evidence/:evidenceId/download | Download | — | binary |

### Certification & Verification

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | /api/close/sessions/:id/certify | Certify session | `{ certifiedBy, certificationMemo? }` | `{ session }` |
| GET | /api/close/sessions/:id/certified-source | Get certified snapshot/binder source | — | `{ snapshot, statements }` |
| GET | /api/verification/certification/public-key | Ed25519 public key (verification) | — | `{ publicKeyB64, alg }` |
| GET | /api/verification/certification/artifacts/:closeSessionId | Get certification artifact | — | `{ artifact, artifactHash, signatureB64 }` |
| POST | /api/verification/certification/verify | Verify artifact signature + chain | `{ artifact, signatureB64, publicKeyB64 }` | `{ signatureValid, snapshotHashMatches?, auditChainVerified? }` |

### Export / Binder (Gated)

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | /api/export/pdf | Generate PDF | `{ financial_statements, clean_ledger?, exportMode?, closeSessionId?, periodLabel? }` | PDF or 403 |
| POST | /api/export/csv | Generate CSV | similar | CSV or 403 |
| GET | /api/audit/binder | Binder (certified-only) | query: closeSessionId | `{ statements, chainVerification }` |
| GET | /api/audit/binder/export/pdf | Binder PDF export | query: closeSessionId | PDF or 403 |
| GET | /api/audit/binder/export/csv | Binder CSV export | query: closeSessionId | CSV or 403 |

### Audit Ledger & Chain

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| (no direct query API; used internally) | — | Chain verification | — | via `verifyChain()` |

*Note: Audit ledger entries are append-only; no public "list ledger" API in core. Binder includes `chainVerification` with `latestEntryHash` for third-party verification.*

### Trial Balance Ingestion

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | /api/trial-balance/ingest | Upload TB (CSV/XLSX) | multipart + body | `{ periodLabel, status, ... }` or 422 if imbalanced; imbalanced → HITL staging |
| POST | /api/trial-balance/statements | Build statements from body | `{ periodLabel, entries, ... }` | Statements or 422 |
| GET | /api/trial-balance/period/:periodLabel | Get period TB | — | Trial balance |
| GET | /api/trial-balance/period/:periodLabel/adjusted | Get adjusted TB | — | Adjusted trial balance |

### HITL (Human-in-the-Loop)

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | /api/hitl/resolve | Approve/reject staging item | `{ id, action: 'approve'|'reject', reason? }` | — |
| POST | /api/hitl/resolve-ingest | Apply human correction to staged imbalanced TB | `{ stagingId, correction: { entries } }` | Persists to period_trial_balance |
| GET | /api/hitl/staging | List staging items | — | `{ items }` |

---

## 10. Data Model Relationships

### Core Entities

```
CloseSession (id, tenantId, entityId, periodStart, periodEnd, status, certifiedSnapshotId?, ...)
    │
    ├── JournalEntry (id, closeSessionId, status, createdBy, approvedBy, ...)
    │       ├── JournalEntryLine (debit, credit, amountProvenance)
    │       └── EvidenceLink → EvidenceRecord (hash_sha256, size_bytes, ...)
    │
    ├── LedgerSnapshot (id, snapshotHash, snapshotPayloadJson, hashVersion, ...)
    │       └── LedgerSnapshotPayload { trialBalance, entries?, evidenceManifest? }
    │
    └── CertificationArtifact (artifactId, snapshotId, artifactHash, signatureB64, ...)

AuditLedger (id, tenantId, eventType, previous_entry_hash, entry_hash, ...)
    └── chain: entry[0].entry_hash → entry[1].previous_entry_hash → ...
```

### Entity Details

| Entity | Key Fields | Immutability |
|--------|------------|--------------|
| **CloseSession** | status, certifiedAt, certifiedBy, certifiedSnapshotId | status transitions enforced |
| **JournalEntry** | status (draft→proposed→approved→posted→exported), source, createdBy, approvedBy | Amount provenance required |
| **EvidenceRecord** | hash_sha256, size_bytes, mime_type | Hash computed on upload |
| **LedgerSnapshot** | snapshotHash, snapshotPayloadJson, hashVersion | DB trigger blocks UPDATE/DELETE |
| **AuditLedger** | previous_entry_hash, entry_hash | DB trigger blocks UPDATE/DELETE |
| **CertificationArtifact** | artifactHash, signatureB64 | Immutable once created |

---

## 11. State Transition Guards (Summary)

| Action | Guard | Error Code |
|--------|-------|------------|
| Advance session | `ALLOWED_TRANSITIONS[current][next]` | INVALID_TRANSITION |
| Certify | `status === 'locked'` | INVALID_TRANSITION |
| Certify | Readiness hard blockers | NOT_READY |
| Certify | Evidence policy | HARD_BLOCKERS |
| Export (certified) | `session.status === 'certified'` | CLOSE_NOT_CERTIFIED |
| Export (certified) | `checkExportGate()` | CRITICAL_TAMPER_ALERT, UNRESOLVED_CONFLICTS_ALERT, RESOLUTION_MISMATCH |
| TB ingest (imbalanced) | Debit ≠ Credit | 422 MathematicalIntegrityError |
| TB ingest | Row count > MAX_TB_ROWS | 413 |
| Client supplies materiality flags | — | TAMPERING_ATTEMPT_DETECTED 403 |

---

## 12. Recommended Frontend Component Structure

### Separation of Concerns

| Layer | Components | Responsibility |
|-------|------------|----------------|
| **State Display** | `CloseSessionStatusBadge`, `PeriodStateTimeline` | Show current state; certified = frozen visual |
| **Transition Controls** | `AdvanceButton`, `CertifyButton` | Disabled when guard fails; show explicit error on click |
| **Deterministic Validation** | `AccountingEquationMonitor`, `IntegrityGateStatus` | Real-time D=C, A=L+E; red block (not warning) on violation |
| **Hash Visibility** | `SnapshotHashBadge`, `ChainVerificationBadge`, `EvidenceHashChip` | Cryptographic fingerprints as badges |
| **Attribution** | `CreatedByChip`, `ApprovedByChip`, `ProvenanceTooltip` | Who did what, when |
| **Export Gating** | `CertifiedExportButton` | Disabled when not certified; tooltip: "Certification required" |
| **Advisory vs Enforceable** | `AIProposalCard` (staging), `DeterministicTable` (core) | Clear visual distinction; advisory = "Suggestions" panel |

### UX Principles

1. **Hard blocks, not soft warnings**: For invariant violations (D≠C, A≠L+E, uncertified export), show blocking UI with explicit reason. No "are you sure?" for mathematically impossible actions.
2. **Certified = frozen**: Certified periods: greyed-out edit controls, lock icon, "Immutable" badge.
3. **Hash visibility**: Show truncated SHA-256 (e.g. `a1b2c3…`) as badges; link to verification endpoint for full check.
4. **Attribution always visible**: Every JE line shows `createdBy` / `amountProvenance`; audit events show `createdBy`.
5. **Export disabled state**: When session not certified, export button disabled with tooltip "Session must be certified first."

---

## 13. Gotchas — UI Must NEVER Allow

| Action | Why Backend Rejects |
|--------|---------------------|
| Advance from certified | `certified: []` — no outgoing transitions |
| Certify from non-locked | `status !== 'locked'` → INVALID_TRANSITION |
| Export certified PDF without certified session | 403 CLOSE_NOT_CERTIFIED |
| Supply materiality flags in export request | 403 TAMPERING_ATTEMPT_DETECTED |
| Edit journal entry in certified period | DB trigger blocks UPDATE on period_trial_balance |
| Approve JE without segregation | approvedBy === createdBy may be disallowed |
| Create JE without amountProvenance for non-zero | Validation error |
| Assume AI can mutate ledger | assertNoAiMutationContext throws in prod |

---

## 14. Error Code Reference

| Code | HTTP | Meaning |
|------|------|---------|
| INVALID_TRANSITION | 409 | State transition not allowed |
| NOT_READY | 422 | Hard blockers (checklist, etc.) |
| HARD_BLOCKERS | 409 | Evidence policy or other blockers |
| NOT_LOCKED | 409 | Certify requires locked |
| CLOSE_NOT_CERTIFIED | 403 | Export requires certified |
| CRITICAL_TAMPER_ALERT | 403 | Chain/materiality/evidence failed |
| TAMPERING_ATTEMPT_DETECTED | 403 | Client sent forbidden flags |
| UNRESOLVED_CONFLICTS_ALERT | 403 | Unresolved conflicts block export |
| RESOLUTION_MISMATCH | 422 | Ledger resolution count mismatch |
| MathematicalIntegrityError | 422 | D≠C or A≠L+E |

---

*End of SOVEREIGN_CPA_ENGINE_ARCHITECTURE.md*
