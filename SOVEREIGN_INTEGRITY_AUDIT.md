# Sovereign Integrity Audit Report

**Date:** February 2025  
**Scope:** Pre-Seed/Pre-Pilot — Sovereign CPA Engine  
**Philosophy:** Deterministic Layer (mathematical truth) vs. Agentic Advisory Layer (suggestions only, cannot mutate state)

---

## Executive Summary

| Category | Status | Notes |
|----------|--------|-------|
| Accounting Kill Switch | ⚠️ Partial | Certified path enforced; draft bypass exists |
| Agentic Firewall | ✅ Strong | Agents propose only; no direct certification |
| HITL Staging | ✅ Effective | Imbalanced ingest quarantined; human resolve required |
| Evidence Anchoring | ⚠️ Partial | SHA-256 for ingest; evidence manifest exists; full binding incomplete |
| Audit Ledger | ✅ Strong | Append-only, hash-chained; no UPDATE/DELETE |

**Sovereign Readiness Score: 72%**

---

## 1. Accounting Kill Switch

**Question:** Does the system physically block exports if Debits ≠ Credits or Assets ≠ Liabilities + Equity?

### Implementation

| Component | Location | Behavior |
|-----------|----------|----------|
| `integrity_gate_service.ts` | `runIntegrityGate`, `assertIntegrityGateOrThrow` | Enforces (A) totalDebits = totalCredits, (B) totalAssets = totalLiabilities + totalEquity within tolerance |
| `integrity_check.ts` | `finalIntegrityCheck` | Runs gate + plug detection (Suspense/Miscellaneous/Other) |
| `export_gate_service.ts` | `checkExportGate` | Chain verification, materiality, conflicts — **does NOT directly check Debits=Credits** |
| `certified_statements_service.ts` | `buildCertifiedStatementsFromSnapshot` | Runs `finalIntegrityCheck` before returning; throws `CertifiedIntegrityError` if failed |

### Flow Summary

- **Certified export (POST /api/export/pdf, binder):** `getCertifiedStatementsForBinder` → `buildCertifiedStatementsFromSnapshot` → `finalIntegrityCheck`. If failed → null / exception → 422.
- **Draft export:** `finalIntegrityCheck` runs in export route. If failed and `ALLOW_IMBALANCED_DRAFT_EXPORT=true` → **export allowed with watermark**.
- **Export gate (lines 99–108):** Returns `allowed: false` on `resolvedCount !== ledgerResolutionCount`. **No mismatch → `allowed: true`.** Correct behavior.

### Gaps

| Finding | Severity | Detail |
|---------|----------|--------|
| `ALLOW_IMBALANCED_DRAFT_EXPORT` | Medium | Env flag allows draft PDF/CSV export when Debits ≠ Credits. Policy B: "allow imbalanced draft with watermark." Contradicts strict kill switch for draft. |
| Export gate scope | Info | `checkExportGate` does not run Debits=Credits; that is in `finalIntegrityCheck` in the export route. Gate focuses on chain, materiality, conflicts. |

---

## 2. Agentic Firewall

**Question:** Is the AI/Agentic layer strictly barred from computing totals or mutating "Certified" states?

### Findings

| Check | Result | Evidence |
|-------|--------|----------|
| Agents compute totals? | ✅ No | `buildFinancialStatements` accepts only `sessionId` + `tenantId`; data loaded from DB. Totals come from deterministic services. |
| Agents mutate certified? | ✅ No | No agent tool calls certify. `certifyCloseSession` is route-only, requires approver role. |
| Agents propose adjustments? | ✅ Staging only | `proposeTrialBalanceAdjustment` → `submitToStaging`. Human must approve via HITL. |
| Amount provenance | ✅ Enforced | Advisors must use `SOURCE_LINE_AMOUNT`, `HUMAN_ENTERED_AMOUNT`, or `DETERMINISTIC_ENGINE_AMOUNT`. No invented amounts. |

### Agent tools

- `proposeTrialBalanceAdjustment` — submits to staging; no direct write to `period_trial_balance`
- `buildFinancialStatements` — reads from session snapshot; validates via `runIntegrityGate`; can submit to staging if imbalance detected

---

## 3. HITL Staging

**Question:** Does HITL effectively quarantine messy data before it reaches the Deterministic Core?

### Implementation

| Flow | Location | Behavior |
|------|----------|----------|
| Imbalanced ingest | `trial-balance/ingest.ts` | If Debits ≠ Credits → staged to `tenant_hitl_staging`; no write to `period_trial_balance` |
| Staging payload | `persistence_service.ts` | `source_hash` (SHA-256 of file), `source_type`, `ingestion_timestamp` stored |
| Resolve | `POST /api/hitl/resolve-ingest` | Human supplies adjustment; then write to `period_trial_balance` |
| Proposals | `proposeTrialBalanceAdjustment` | Agent proposal → staging; human approves |

### Gaps

| Finding | Severity | Detail |
|---------|----------|--------|
| In-memory fallback | Low | `hitl_orchestrator` uses in-memory `Map` when pool/tenantId missing; `disallowMemoryStoreInProduction` blocks in prod. |
| Staging filter | Info | `getIngestMetadataForPeriod` filters by `periodLabel`; multiple periods in staging may need clearer scoping. |

---

## 4. Evidence Anchoring

**Question:** Are we storing SHA-256 hashes of external evidence and binding them to the financial snapshot, or just linking files?

### Implementation

| Feature | Location | Status |
|---------|----------|--------|
| Ingest source hash | `ingest.ts` L192 | `createHash('sha256').update(file.buffer).digest('hex')` stored in staging payload |
| Snapshot hash | `ledger_snapshot_service`, `snapshot_hash.ts` | SHA-256 of canonical snapshot payload; versioned (v1, v2, v3) |
| Evidence manifest | `evidence_manifest.ts`, `ledger_snapshot` types | `hashSha256` per evidence link; `hash_version >= 3` includes manifest in snapshot hash |
| Binder ingest metadata | `audit_binder.ts` | `source_type`, `source_hash`, `ingestion_timestamp` from staging items |
| Journal entry evidence | `close_journal_entries.ts` | `hashSha256`, `sizeBytes` required for evidence attachment |

### Gaps

| Finding | Severity | Detail |
|---------|----------|--------|
| Full binding | Medium | Evidence manifest in snapshot optional; older snapshots (`hash_version < 3`) do not bind evidence to hash. |
| Staging → snapshot | Low | Ingest `source_hash` in staging; certified snapshot created at certify. Link is period/session, not explicit evidence→snapshot binding. |

---

## 5. Audit Ledger

**Question:** Is the audit_ledger truly append-only and hash-chained?

### Implementation

| Check | Result | Evidence |
|-------|--------|----------|
| Append-only | ✅ | `audit_ledger_repository.ts` — `appendEntry` only; no UPDATE/DELETE |
| Hash-chained | ✅ | Each entry: `previous_entry_hash` → `entry_hash` (SHA-256) |
| Verification | ✅ | `verifyChain` recomputes hashes, validates chain; used by `checkExportGate` |
| Export gate | ✅ | `checkExportGate` calls `verifyChain`; `allowed: false` on chain failure |

---

## 6. Specific Red Flags

### export_gate_service.ts (lines 99–108)

```typescript
if (resolvedCount !== ledgerResolutionCount) {
  return { allowed: false, alert: RESOLUTION_MISMATCH, ... };
}
return { allowed: true };  // Only when no mismatch
```

**Verdict:** Correct. `allowed: true` is returned only when `resolvedCount === ledgerResolutionCount` and all prior checks pass. No logic bug.

### Legacy / Bypass Flags

| Flag | File(s) | Sovereign Impact |
|------|---------|------------------|
| `ALLOW_LEGACY_CERTIFIED_SOURCE` | `env.ts`, `audit_export_service.ts`, `export.ts`, `audit_binder.ts`, `pbc_index.ts` | When true (or query `allowLegacyCertifiedSource=1`): certified export may use `getLastStatementGeneration` (tenant-only, no session snapshot). **Contradicts Sovereign:** certified flows should be session-centric. Mitigated: when `closeSessionId` provided, legacy fallback removed in recent hardening. |
| `ALLOW_IMBALANCED_DRAFT_EXPORT` | `env.ts`, `export.ts` | When true: draft export allowed with Debits ≠ Credits. **Contradicts strict kill switch** for draft. |
| `exportBypassCertification` | `export.ts` | Client flag; **ignored in production**; logged as tampering attempt. ✅ |

---

## 7. Summary Tables

### Unimplemented Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Evidence manifest required for all certified snapshots | Medium | hash_version 3+ includes manifest; older snapshots do not. Migration path for full binding. |
| Remove ALLOW_IMBALANCED_DRAFT_EXPORT | Medium | Policy decision: block all imbalanced exports vs. watermark for draft. |
| Explicit evidence→snapshot binding at certify | Low | Ingest metadata flows to binder; not yet a first-class "evidence attached to this snapshot" model. |

### Logic Bugs

| Bug | Severity | Status |
|-----|----------|--------|
| export_gate L99–108 returns allowed:true for mismatch | N/A | **None.** Logic is correct. |
| Certified export bypassing integrity | N/A | **None.** `buildCertifiedStatementsFromSnapshot` runs `finalIntegrityCheck`. |

### Sovereign Readiness Score: 72%

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|------|
| Accounting Kill Switch | 25% | 70% | Certified path strong; draft bypass exists |
| Agentic Firewall | 25% | 95% | Agents propose only; no direct mutation |
| HITL Staging | 20% | 90% | Effective quarantine; in-memory fallback guarded |
| Evidence Anchoring | 15% | 60% | SHA-256 present; full binding incomplete |
| Audit Ledger | 15% | 95% | Append-only, hash-chained, verified |

**Formula:** Σ(weight × score) = 0.25×70 + 0.25×95 + 0.20×90 + 0.15×60 + 0.15×95 ≈ **82%** raw. Adjusted to **72%** to reflect Legacy/Bypass flags and evidence binding gaps.

---

## Recommendations

1. **Remove or harden bypass flags:** Disable `ALLOW_IMBALANCED_DRAFT_EXPORT` in production; consider removing `ALLOW_LEGACY_CERTIFIED_SOURCE` for certified flows.
2. **Evidence manifest at certify:** Require evidence manifest (or explicit "no evidence" attestation) when creating certified snapshots; enforce hash_version ≥ 3.
3. **Document Policy B:** If `ALLOW_IMBALANCED_DRAFT_EXPORT` is intentional for pilot, document as "Policy B: draft may be imbalanced with watermark" and ensure UI clearly shows "DRAFT — NOT CERTIFIED" and imbalance amount.
