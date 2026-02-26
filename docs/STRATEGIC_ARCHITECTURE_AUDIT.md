# Strategic Architecture Audit — Path A vs. Path B

**Date:** February 4, 2025  
**Scope:** Code evidence only. No speculation beyond what is implemented.

---

## PATH DEFINITIONS

| Aspect | Path A: Deterministic Close Engine | Path B: Financial Trust Protocol |
|--------|-----------------------------------|----------------------------------|
| **Core product** | Structural validation before external exposure | Externally verifiable financial state |
| **Primary buyer** | Controller / CFO | Audit firms, PE firms, IPO-bound companies |
| **Value prop** | Prevent structural errors, enforce invariants, reduce audit friction | Independent recomputability, cryptographic lineage, third-party trust |
| **Focus** | Deterministic correctness, certification gating, internal discipline | Verifiable snapshots, hash-chain integrity, read-only auditor portal |

---

## 1. ENGINE MATURITY ANALYSIS (Path A: Deterministic Close Engine)

### 1.1 Deterministic Invariants Enforced

| Invariant | Location | Enforcement |
|-----------|----------|--------------|
| **Debits = Credits** | `integrity_gate_service.ts`, `financialStatements.ts`, `protocol_bridge.ts` | `runIntegrityGate`, `buildValidatedStatements`, `assertIntegrityGateOrThrow`. Tolerance from `financial_rules.json` (default 0.01). |
| **Assets = Liabilities + Equity** | Same | Same gate. Balance sheet equation. |
| **No plug abuse** | `integrity_check.ts`, `integrity_gate_service.ts` | `detectSuspiciousPlugs` — blocks when Suspense/Misc/Other absorb >90% of net activity. |
| **Period lock before TB mutation** | `protocol_bridge.ts` | `assertPeriodNotLocked` before SaveTrialBalance, ApplyHitlAdjustment, CreateDraftJE, ProposeJE, ApproveJE, PostJE. |
| **JE lines balanced** | `journal_entry_service.ts` | `validateBalanced` at create/propose. |
| **Certification only from locked** | `close_session_service.ts` | `session.status === 'locked'` required. |
| **Readiness before advance** | `close_session_service.ts` | `computeReadiness` hardBlockers must be empty before finalized→locked. |
| **Approver role for certify** | `segregation_service.ts` | `canPerform(actorRole, 'certify_close')`. |

### 1.2 Non-Bypass Certification Gates

| Gate | Location | Bypass |
|------|----------|--------|
| **Truth Gate (buildCertifiedStatementsFromSnapshot)** | `certified_statements_service.ts` | Runs before snapshot INSERT. Throws `CertifiedIntegrityError` on failure. No bypass in production path. |
| **Export gate** | `export_gate_service.ts` | `checkExportGate` (period_export_checks, verifyChain, conflicts). `exportBypassCertification` ignored in production. |
| **Final integrity check** | `integrity_check.ts` | `finalIntegrityCheck` before PDF/CSV and binder. |
| **Binder gate** | `audit_binder.ts` | `requireCertifiedSession` + `runBinderExportGates`. |

### 1.3 Areas Where Invariants Could Still Be Bypassed

| Bypass | Location | Risk |
|--------|----------|------|
| **Sync TB without balance check** | `accounting_integration.ts` lines 70–78 | `saveUnadjustedFromSync` called directly. No `executeBridgeCommand`, no `assertPeriodNotLocked`, no `runIntegrityGate`. Imbalanced sync data can be written to `period_trial_balance`. |
| **Sync TB without period lock** | Same | Period lock not asserted before sync write. |
| **Sync TB without audit event** | Same | No `recordMaterialEvent` for sync. |
| **Tolerance is configurable** | `financial_rules.json` | `roundingTolerance: 0.01`. Admin can increase; larger gaps allowed. |
| **ALLOW_LEGACY_CERTIFIED_SOURCE** | `env.ts`, export routes | When true, certified output can use last-registered snapshot + Truth Gate instead of certified snapshot. Legacy path; still requires Truth Gate. |

### 1.4 Flows That Mutate Financial State

| Flow | Mutation | Via Bridge? | Audit Event? |
|------|----------|-------------|--------------|
| **Ingest balanced TB** | `period_trial_balance` upsert | Yes (SaveTrialBalance) | Yes (recordBridgeMutation) |
| **HITL resolve-ingest** | `period_trial_balance` + staging | Yes (ApplyHitlAdjustmentToTrialBalance) | Yes |
| **Sync TB** | `period_trial_balance` upsert | **No** | **No** |
| **Create/Propose/Approve/Post JE** | `journal_entries`, `journal_entry_lines` | Yes | Yes |
| **Certify** | `ledger_snapshots`, `close_sessions`, `audit_ledger` | N/A (service) | Yes |
| **Advance** | `close_sessions`, `audit_ledger` | N/A | Yes |

### 1.5 Mathematical vs. Conventional Enforcement

| Aspect | Enforcement | Evidence |
|--------|-------------|----------|
| **Debits = Credits** | **Conventional (tolerance)** | `absGt(totalDebits, totalCredits, tolerance)`. Tolerance 0.01 from `financial_rules.json`. Not exact equality. |
| **Balance sheet equation** | **Conventional (tolerance)** | Same. |
| **Plug detection** | **Conventional (threshold)** | 90% threshold. |
| **Certification** | **Rule-based** | State machine. No math. |
| **Hash-chain** | **Mathematical** | SHA-256. Deterministic. |

**Conclusion:** Integrity is **conventionally enforced** within a configurable tolerance. Not mathematically exact (exact equality would require zero tolerance). Tolerance is domain-appropriate for currency rounding.

### 1.6 Engine Readiness Score (Path A): **7.5 / 10**

**Justification:**

- **Strengths:** Single bridge for TB and JE mutations; Truth Gate before certification; export gate; hash-chain; state machine; transactions for certify/advance.
- **Deductions:** Sync TB bypasses bridge and invariants (−1.0); tolerance is configurable (−0.5); no hash spec documentation (−0.5); migration atomicity open (−0.5).

---

## 2. PROTOCOL READINESS ANALYSIS (Path B: Financial Trust Protocol)

### 2.1 Components Supporting Independent Verification

| Component | Location | Purpose |
|-----------|----------|---------|
| **Hash-chain** | `audit_ledger_repository.ts` | `verifyChain` recomputes hash per entry, checks `previous_entry_hash` link. |
| **Snapshot hash** | `snapshot_hash.ts`, `ledger_snapshot_service.ts` | `hashSnapshotPayload`, `verifySnapshotHash`. SHA-256 of canonical JSON. |
| **Canonicalization** | `canonical_json.ts`, `snapshot_hash.ts` | `canonicalStringifyKeysOnly`, `entrySortKey` for stable ordering. |
| **Hash versioning** | `audit_ledger_repository.ts`, `snapshot_hash.ts` | `hash_version` column (v1/v2). `HASH_VERSION`, `ALLOWED_HASH_VERSIONS`. |

### 2.2 Can an External Party Recompute State Without Trusting Backend?

| Verification | Recomputable | Dependencies |
|--------------|--------------|--------------|
| **Audit chain** | **Yes** | Must trust: (1) hash payload schema (tenantId, periodLabel, eventType, deterministicFlagSnapshot, agentDissentSnapshot, userPromptRationale, previousEntryHash, createdAt); (2) `canonicalizeForHash` implementation (sorted keys). Logic is in code; no external spec. |
| **Snapshot hash** | **Yes** | Must trust: (1) `entrySortKey` ordering; (2) `hash_version`; (3) `canonicalStringifyKeysOnly`. Logic in code; no external spec. |

**Conclusion:** Recomputability is **possible** only by reimplementing from source. No standalone spec or formal contract. Third party must trust or replicate the implementation.

### 2.3 Dependencies That Prevent Third-Party Reproducibility

| Dependency | Impact |
|------------|--------|
| **No published hash spec** | Canonicalization and ordering rules exist only in TypeScript. No RFC or JSON schema. |
| **DB as source of truth** | `verifyChain` reads from DB. External party needs DB access or exported data. |
| **Timestamp in hash payload** | `createdAt` in audit ledger hash. Slightly different timestamp formats could break. |
| **entrySortKey implementation** | Domain-specific. AccountName, debit, credit, lineId, accountCode, description, provenance. Order must match exactly. |
| **Legacy vs. current hash** | Two paths (v1, v2 for audit; legacy vs. v1 for snapshot). Verification logic must handle both. |

### 2.4 Hash Computation Stability, Documentation, Versioning

| Aspect | Status | Evidence |
|--------|--------|----------|
| **Stable** | Yes | Deterministic. Same payload → same hash. `snapshot_reproducibility.test.ts` verifies. |
| **Documented** | **No** | Inline comments only. No standalone spec, no external doc. |
| **Versioned** | Yes | `hash_version` column. v1/v2 for audit; v1 for snapshot. `ALLOWED_HASH_VERSIONS`. |

### 2.5 Protocol Readiness Score (Path B): **5.5 / 10**

**Justification:**

- **Strengths:** Hash-chain and snapshot hash work; deterministic; versioned; tested.
- **Deductions:** No published spec (−1.5); no read-only auditor portal (−1.0); DB required for full chain (−0.5); sync bypass weakens integrity (−0.5); evidence anchoring not implemented (−1.0).

---

## 2B. PATH B: FINANCIAL TRUST PROTOCOL — DEEP DIVE

### 2B.1 Path B Value Proposition (per Scope Statement)

- **Independent recomputability:** External party can verify snapshot hash and audit chain without trusting backend logic.
- **Cryptographic lineage:** Hash-chained audit ledger detects tampering, mutation, truncation.
- **Third-party trust:** Audit firms, PE firms, IPO-bound companies can verify certification state.
- **Read-only auditor verification surface:** Optional. External auditors verify snapshot hash, chain continuity, evidence manifest hashes, certification timestamp.

### 2B.2 Path B Components — Implemented vs. Missing

| Component | Status | Evidence |
|-----------|--------|----------|
| **Hash-chain audit ledger** | ✅ Implemented | `audit_ledger_repository.ts`, `verifyChain`, `appendEntry`, `previous_entry_hash` |
| **Snapshot deterministic hash** | ✅ Implemented | `snapshot_hash.ts`, `hashSnapshotPayload`, `verifySnapshotHash` |
| **Canonical JSON** | ✅ Implemented | `canonical_json.ts`, `canonicalStringifyKeysOnly`, `entrySortKey` |
| **Hash versioning** | ✅ Implemented | `hash_version` column, v1/v2 for audit, v1 for snapshot |
| **Published hash spec** | ❌ Missing | No RFC, no JSON schema, no external doc |
| **Read-only verification API** | ❌ Missing | No GET verify/snapshot, GET verify/chain endpoints |
| **Hash in export artifact** | ❌ Missing | PDF/CSV do not embed snapshot_hash or chain hash |
| **Evidence anchoring** | ❌ Missing | Optional per scope. Hash-linked evidence not implemented |
| **Evidence manifest in snapshot** | ❌ Missing | Snapshot payload has trialBalance only; no evidence manifest |
| **Standalone verification format** | ❌ Missing | No export format for third-party recompute without backend |

### 2B.3 Path B Roadmap (Phased)

| Phase | Steps | Effort | Outcome |
|-------|-------|--------|---------|
| **Phase 1: Spec** | Publish hash canonicalization spec; JSON schema for snapshot and audit payload; entry sort key rules | Medium | Third parties can implement verification |
| **Phase 2: API** | Add GET /api/verify/snapshot/:id, GET /api/verify/chain/:tenantId; return validity + recomputed hashes | Medium | Auditors can verify without DB access |
| **Phase 3: Embed** | Include snapshot_hash, latest_entry_hash in PDF metadata or appendix; signed manifest | Medium | Export artifact is self-verifying |
| **Phase 4: Evidence** | Hash evidence records; link to JEs; include evidence manifest in snapshot payload | Deep | Full evidence anchoring (optional) |
| **Phase 5: Standalone** | Export format (JSON + manifest) enabling recompute without backend | Deep | Maximum third-party trust |

### 2B.4 Path B Readiness Checklist

| Criterion | Met? |
|-----------|------|
| Snapshot hash is deterministic | ✅ |
| Audit chain is hash-linked | ✅ |
| Hash computation is versioned | ✅ |
| Verification is testable | ✅ (`snapshot_reproducibility.test.ts`) |
| Hash spec is published | ❌ |
| Verification API exists | ❌ |
| Export embeds hashes | ❌ |
| Evidence is hash-linked | ❌ |
| Third party can verify without backend | ❌ |

### 2B.5 Path B — What Audit Firms / PE / IPO Buyers Need

1. **Verification without application access:** Read-only API or exported manifest.
2. **Snapshot integrity proof:** Recompute hash from payload; compare to stored.
3. **Chain integrity proof:** Verify each entry hash and previous_entry_hash link.
4. **Timestamp immutability:** Certification timestamp in chain; tamper-evident.
5. **Evidence linkage (optional):** For material JEs; hash of evidence; manifest in snapshot.

---

## 3. TRUST SURFACE MAPPING

### 3.1 What an External Auditor Must Trust (Today)

| Component | Trust Required | Reason |
|-----------|----------------|--------|
| **Application logic** | Yes | Invariants, gates, and canonicalization live in TypeScript. No formal verification. |
| **Database integrity** | Yes | Chain and snapshots stored in DB. No independent storage format. |
| **Export layer** | Yes | PDF/CSV generated by application. No verifiable bindings to snapshot hash in export artifact. |
| **Snapshot builder** | Yes | `createSnapshotFromTrialBalanceAndEntries` builds payload. No external recomputation path. |
| **Financial rules** | Yes | `financial_rules.json` drives tolerance. Configurable. |

### 3.2 Components That Must Become Independently Reproducible for Path B

| Component | Current State | Path B Requirement |
|-----------|---------------|-------------------|
| **Hash canonicalization** | In code | Published spec (RFC or JSON schema). Reference implementation. |
| **Snapshot payload schema** | In code | Published schema. Entry ordering rules. |
| **Audit ledger payload** | In code | Published schema. Field ordering. |
| **Export artifact** | PDF/CSV generated | Embed snapshot hash + chain hash in artifact. Signed manifest. |
| **Verification API** | None | Read-only endpoints: verify snapshot, verify chain, verify evidence manifest. |
| **Evidence manifest** | Not implemented | Optional per scope. Hash-linked evidence. |

---

## 4. GAP REPORT

### 4.1 Path A: Fully Harden Deterministic Close Engine

| Step | Effort | Description |
|------|--------|-------------|
| Route sync TB through bridge | **Low / High leverage** | Add `validateBalanced` before saveUnadjustedFromSync. Add `assertPeriodNotLocked`. Add `recordMaterialEvent`. Or wrap in `executeBridgeCommand(SaveTrialBalance)` with sync entries. |
| Enforce period lock on sync | **Low** | Call `assertPeriodNotLocked` before sync write. |
| Audit event for sync | **Low** | `recordMaterialEvent` with eventType `sync_trial_balance` after sync. |
| Migration atomicity | **Medium** | Wrap each migration in `BEGIN`/`COMMIT`/`ROLLBACK`. |
| Lock tolerance config | **Low** | Restrict `roundingTolerance` in production (e.g. max 0.01). |
| Metrics/observability | **Medium** | Prometheus for certify, advance, export. |

### 4.2 Path B: Transition from Path A to Financial Trust Protocol

| Step | Effort | Description |
|------|--------|-------------|
| Publish hash spec | **Medium** | Document canonicalization, entry sort, payload schema. JSON schema for snapshot and audit payload. |
| Read-only verification API | **Medium** | Endpoints: GET verify/snapshot/:id, GET verify/chain/:tenantId. Return validity + recomputed hashes. |
| Embed hashes in export | **Medium** | Include snapshot_hash, latest_entry_hash in PDF metadata or appendix. |
| Evidence anchoring | **Deep architectural change** | Optional per scope. Hash evidence, link to JEs, manifest in snapshot. |
| Third-party recompute without backend | **Deep architectural change** | Spec + reference implementation. Export format that allows standalone verification. |

---

## 5. STRATEGIC CONCLUSION

### 5.1 Which Path Is Closer to Completion?

**Path A is closer.** The deterministic close engine is largely implemented: bridge, Truth Gate, export gate, state machine, hash-chain. Remaining work is closing sync bypass and migration atomicity.

Path B is further: no published spec, no read-only verification API, no hash embedding in export. Evidence anchoring is optional and not built.

### 5.2 If Funding Were Limited, Which Path to Prioritize?

**Prioritize Path A.** The sync bypass is a clear integrity hole. Fixing it is low effort and high leverage. Path B’s value (external verification, third-party trust) depends on Path A being solid first. A weak deterministic layer undermines any trust protocol.

### 5.3 If Venture-Scale Ambition Is the Goal, What Pivot?

| Goal | Implication |
|------|-------------|
| **Path A as primary** | Fix sync bypass. Add migration atomicity. Add observability. Ship. No pivot. |
| **Path B as primary** | Add: (1) published hash spec, (2) read-only verification API, (3) hash embedding in export. Evidence anchoring is optional. Architecture supports it; implementation is additive. |
| **Pivot risk** | Path B does not require a rewrite. Hash-chain and snapshot hash are already in place. The gap is specification and API surface, not core logic. |

---

## 6. PATH A vs. PATH B — SIDE-BY-SIDE

| Dimension | Path A | Path B |
|-----------|--------|--------|
| **Readiness score** | 7.5 / 10 | 5.5 / 10 |
| **Primary gap** | Sync TB bypass, migration atomicity | Published spec, verification API, hash embedding |
| **Closest to completion** | Yes | No |
| **Depends on** | — | Path A (deterministic layer must be solid first) |
| **Effort to production** | ~2–3 weeks (sync fix, migrations) | ~2–3 months (spec, API, embed, optional evidence) |
| **Buyer alignment** | Controllers, CFOs | Auditors, PE, IPO-bound |
| **Shared foundation** | Bridge, Truth Gate, hash-chain, snapshot hash | Same. Path B builds on Path A. |

---

*Audit based on code evidence only. No speculation beyond what is implemented.*
