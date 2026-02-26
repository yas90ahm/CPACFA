# Final Red-Flag Audit — Sovereign CPA Engine

**Date:** February 4, 2025  
**Purpose:** VC Series A Due Diligence — Evaluate viability of the Sovereign CPA Engine as infrastructure vs. liability  
**References:** Sovereign CPA Engine Full Scope Statement, VC_TECHNICAL_ASSESSMENT_REPORT.md, INDEPENDENT_SYSTEM_AUDIT.md, P1_P2_VALIDATION_STATUS.md  

---

## Executive Summary

The Sovereign CPA Engine presents a **Build** recommendation. The Deterministic Layer (Sovereign Core) exists as a rigid, non-bypassable protocol. The Truth Gate, hash-chain logic, and export gating are structurally sound and implemented in production code paths. Critical transaction gaps identified in the VC Technical Assessment have been **addressed** for certify and advance flows. The Agentic Layer does not bleed into the Deterministic Layer; accounting invariants cannot be bypassed by a simple API call.

---

## 1. Integrity Audit: Deterministic Layer Verification

### 1.1 Does the Deterministic Layer Exist as a Rigid Protocol?

**Yes.** The system is not a series of loose Express routes. Evidence:

| Component | Location | Behavior |
|-----------|----------|----------|
| **Truth Gate** | `integrity_check.ts` → `integrity_gate_service.ts` | `finalIntegrityCheck` → `runIntegrityGate` enforces debits=credits, Assets=Liabilities+Equity. `detectSuspiciousPlugs` blocks export when Suspense/Misc/Other absorb >90% of net activity. |
| **Certification Gate** | `certified_statements_service.ts` | `buildCertifiedStatementsFromSnapshot` runs Truth Gate before any certified output. Throws `CertifiedIntegrityError` on failure. Called **before** snapshot INSERT in `certifyCloseSession`. |
| **Protocol Bridge** | `protocol_bridge.ts` | Single mutation path: Zod-validated commands (SaveTrialBalance, CreateDraftJE, ProposeJE, ApproveJE, PostJE, ApplyHitlAdjustmentToTrialBalance, LockPeriod). Period lock asserted before mutations. Every mutation recorded via `recordMaterialEvent`. |
| **Hash-Chain** | `audit_ledger_repository.ts` | Append-only, `previous_entry_hash` linking. `computeEntryHashV2` (canonical sorted keys). `verifyChain` validates full chain before certified export. |
| **Snapshot Determinism** | `snapshot_hash.ts`, `canonical_json.ts` | Canonical JSON + SHA-256. `entrySortKey` for stable ordering. `hash_version` in payload. Tested in `snapshot_reproducibility.test.ts`. |
| **Export Gate** | `export_gate_service.ts` | `checkExportGate`: period_export_checks (DB only), `verifyChain`, optional unresolved-conflicts. Materiality flags read **only from DB**; client cannot supply. `auditBypassFlagIfPresent`: production ignores `exportBypassCertification` and logs tampering attempt. |

### 1.2 Can Accounting Invariants Be Bypassed?

**No.** Verified:

- **Direct DB writes from routes:** None. Mutations go through `executeBridgeCommand` or services.
- **Export bypass:** `exportBypassCertification` in body/query is ignored in production; `tampering_attempt` logged.
- **Client-supplied materiality:** Export route returns 403 if `roundingGapExceedsMateriality` or `aggregateRoundingExceedsMateriality` in body.
- **AI posting:** `executeBridgeCommand` and `recordMaterialEvent` are **not** called from `src/ai/` or `src/agents/`. AI is advisory only.

### 1.3 Structural Soundness vs. Stubs

| Component | Status | Evidence |
|-----------|--------|----------|
| Truth Gate | **Real** | `runIntegrityGate`, `assertIntegrityGateOrThrow`. Used in ingest, certified path, export, binder. |
| Hash-chain | **Real** | `appendEntry`, `verifyChain`, `computeEntryHashV2`. Used before certified export. |
| Snapshot hash | **Real** | `hashSnapshotPayload`, `verifySnapshotHash`. Reproducibility tested. |
| Integrity gate | **Real** | `runIntegrityGate` checks trial balance and balance sheet equation. |
| Export gate | **Real** | `checkExportGate` + `finalIntegrityCheck` before PDF/CSV and binder. |

---

## 2. Technical Debt Verification (VC Top 3 Concerns)

### 2.1 Transactions for certify/advance

**Status: ADDRESSED**

| Flow | Before | After |
|------|--------|-------|
| `certifyCloseSession` | Snapshot INSERT + session UPDATE + audit append (no transaction) | `withTransaction(pool, async (client) => { ... })` wraps all three writes. |
| `advanceSession` | Status updates + `recordMaterialEvent` (no transaction) | `withTransaction` wraps status loop + `recordMaterialEvent`. |

**Evidence:** `src/db/transaction.ts` (`withTransaction`), `close_session_service.ts` lines 277–323 (certify), 489–519 (advance).

### 2.2 Migration Atomicity

**Status: NOT ADDRESSED**

Migrations run `pool.query(sql)` then `INSERT INTO schema_migrations`. If migration fails mid-SQL, schema_migrations may not reflect applied state. No transaction wrapper.

**Estimate:** 1 week (wrap each migration in `BEGIN`/`COMMIT`/`ROLLBACK`).

### 2.3 Sparse Observability

**Status: NOT ADDRESSED**

- Request ID: present on responses.
- Critical route logs: precheck, advance, certify, binder.
- No Prometheus metrics, no APM, no distributed tracing.

**Estimate:** 2–3 weeks (Prometheus metrics, instrument certify/advance/export).

### 2.4 Engineering Hours Summary (P0 Risks)

| Item | Status | Est. Hours |
|------|--------|------------|
| Transactions (certify/advance) | Done | 0 |
| Migration atomicity | Open | 40 |
| Observability (metrics) | Open | 80–120 |
| **Total remaining P0** | | **120–160 hrs (3–4 weeks)** |

---

## 3. Gap Analysis: Quarantined / Mock Endpoints

### 3.1 410 (Quarantined) Endpoints

| Endpoint | File | Purpose |
|----------|------|---------|
| Supervisor | `dev_diagnostics.ts` | Supervisor moved to /experimental |
| Close coach | `close_signoff_readiness.ts` | Advisory; out of scope |
| Agentic JE suggestions from text | `close_je_accruals.ts` | Use deterministic je-suggestions or HITL |
| Agentic JE explain | `close_je_accruals.ts` | Use justification service for IRAC memos |

**Total 410 endpoints: 4**

### 3.2 Stub / Mock-Only (Non-410)

| Item | Behavior |
|------|----------|
| `forensic-anomalies` | Returns empty list (agentic forensics quarantined) |
| Budget/forecasting catalog | Returns empty |
| `gaap_reconciliation_service` | Pass-through |
| Agentic ledger-to-TB | Branch `false`; never runs |

### 3.3 P1/P2 Routes (per P1_P2_VALIDATION_STATUS)

- **P1:** 2/6 fully completed (stock_compensation, deferred_tax); 4 in progress (dcf, impairment, business_combination, equity_method).
- **P2:** 0/6 complete (comps, precedent, portfolio, segment_reporting, audit, revenue_recognition).
- **Sovereign scope:** Close, certification, export, binder, trial balance ingest, HITL, JE lifecycle — **these are implemented and tested**. P1/P2 are CFA/valuation modules outside core certification.

---

## 4. Pillar Status (Red / Yellow / Green)

| Pillar | Status | Rationale |
|--------|--------|-----------|
| **Deterministic Layer (Sovereign Core)** | **Green** | Truth Gate, hash-chain, snapshot determinism, export gate, protocol bridge are implemented and non-bypassable. |
| **Separation of Concerns** | **Green** | AI does not call `executeBridgeCommand` or `recordMaterialEvent`. Agentic layer is advisory only. |
| **Accounting Invariants** | **Green** | Debits=credits enforced at ingest, JE creation, HITL resolve, certification, export. Balance sheet equation enforced. Plug detection blocks export. |
| **Transaction Integrity** | **Green** | certify and advance now wrapped in `withTransaction`. Snapshot + session + audit append are atomic. |
| **Migration Safety** | **Yellow** | Migrations not wrapped in transactions. Mid-failure can leave partial schema. Low frequency; fixable in ~1 week. |
| **Observability** | **Yellow** | Request ID and critical logs present. No metrics/APM. Limits operational visibility. Fixable in 2–3 weeks. |
| **Quarantined Code** | **Yellow** | 4 endpoints return 410. Stubs return empty. Clear scope; no bleed into deterministic layer. |
| **Export Gating** | **Green** | Certified export requires session.status === 'certified', checkExportGate, finalIntegrityCheck. Production ignores bypass flag. |

---

## 5. The Verdict

### Recommendation: **BUILD**

**Conditions satisfied:**

1. **Core deterministic state machine is robust** — Truth Gate, hash-chain, snapshot determinism, export gate, protocol bridge, and state machine (draft → locked → certified) are structurally sound.
2. **Remaining work is plumbing** — Migration atomicity and observability are P0 items with clear fixes (3–4 weeks total). No architectural rewrite.
3. **Agentic layer does not bleed into deterministic layer** — AI never computes totals, never posts, never mutates certified state. Invariants are enforced in TypeScript services.
4. **Accounting invariants cannot be bypassed** — Export bypass is ignored in production. Materiality is DB-only. No client-supplied certification or materiality flags.

**Abandon would be warranted if:**

- Agentic layer could override invariants or post JEs — **Not the case.**
- Debits=credits could be bypassed by API — **Not the case.**
- Export could be tricked into certifying uncertified data — **Not the case in production.**

---

## 6. Recommendations for Series A

1. **Ship with current state** — Core is production-grade for pilot/seed.
2. **Fix migration atomicity** — 1 week. Wrap each migration in transaction.
3. **Add Prometheus metrics** — 2–3 weeks. Instrument certify, advance, export, binder.
4. **Add SIGTERM handler** — Call `closePool()` on shutdown for graceful drain.
5. **Document API contracts** — OpenAPI spec for client generation and auditability.

---

*Report generated from codebase scan and referenced audit documents. No file modifications were made during this audit.*
