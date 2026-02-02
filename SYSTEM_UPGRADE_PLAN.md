# SYSTEM_UPGRADE_PLAN — Hybrid Professional Finance Engine

This plan extends the existing file structure. No new top-level directories; new services, types, migrations, and route integrations are placed where the codebase already lives.

---

## Pillar 1: Deterministic Integrity (Zero-Variance Policy)

**Goal:** Enforce that Trial Balance revenue (and other key totals) cannot materially contradict source contract totals. The system must detect conflicts and block or escalate, not "explain them away."

**Current state:** ProfessionalReviewInput already carries `trialBalance` and `contracts` (with `totalContractValue`). There is no cross-check between TB-derived revenue and `sum(contracts.totalContractValue)` (or period-recognized contract revenue). Revenue recognition and TB flow independently.

**Planned changes:**

1. **New integrity gate service** (`src/services/integrity_gate_service.ts`):
   - Inputs: classified TB entries (or TB + classification result), revenue contracts with `totalContractValue` (and optionally period-level recognized amounts from revenue_recognition_repository if available).
   - Compute: (a) TB revenue = sum of REVENUE-type entries from TB; (b) Contract revenue = sum of `totalContractValue` for in-scope contracts, or recognized revenue for the period when available.
   - Policy: configurable tolerance (e.g. 0 for "zero variance" or a small materiality). If `|TB_Revenue - Contract_Revenue| > tolerance`, throw a **blocking exception** (e.g. `IntegrityGateViolation`) with a clear message. No AI narrative to reconcile the gap.
   - All currency math in this service will use decimal.js (`from`, `minus`, `abs`, `greaterThan`).
2. **Integration points:**
   - Call the integrity gate **before** building financial statements in pipelines that have both TB and contracts (e.g. in statementGenerator or the ingest/close path that produces statements). If the gate throws, do not proceed to build statements; return a structured error (e.g. 400 with `code: 'INTEGRITY_VIOLATION'`).
   - Optional: expose a dedicated route (e.g. under routes/audit.ts or a new routes/integrity.ts) for "validate TB vs contracts" that returns pass/fail and variance details.
3. **Typing:** Introduce a small boundary type (e.g. in src/types/financial.ts or a new src/types/integrity.ts) for the gate input/output so that "Fact Data" (TB totals, contract totals) is explicitly distinguished from any "Inferred" agent output used elsewhere.

---

## Pillar 2: Agentic Skepticism (The Ceiling)

**Goal:** The "Brain" proactively hunts for embedded leases, unbundled revenue obligations, and channel stuffing without being explicitly told.

**Planned changes:**

1. **Revenue spike (channel stuffing):** New "skepticism" check: if the system has period-level revenue (e.g. by period or by day), flag when **>25% of quarterly revenue** is in the **final 5 business days** of the quarter. Implementation: extend judgment_fraud_skepticism.ts; if data is not available, the check is no-op.
2. **Embedded leases:** Extend judgment_substance_over_form.ts: add keywords/phrases such as **"dedicated servers"** and **"exclusive facility access"** (and keep scanning contract/expense text as today).
3. **Going concern (deteriorating runway + accelerating burn):** Extend judgment_going_concern.ts: add a "deteriorating" condition when `runwayMonths < 12` **and** prior-period runway (or burn) is available and current burn is higher (accelerating).

---

## Pillar 3: Adversarial Defense

**Goal:** Prevent "gaslighting" (users talking the AI out of a flag) and "salami slicing" (cumulative sub-material errors).

**Gaslighting:** New **audit ledger** (Pillar 4) records every human override with (1) original deterministic flag snapshot, (2) agent skeptical dissent snapshot, (3) user prompt/rationale, (4) SHA-256 chain. Override flows (e.g. resolving a professional audit flag or approving a staging item) append to this ledger before updating flag status or staging status. API that resolves a flag or approves staging requires an explicit "override rationale" and writes to the ledger.

**Salami slicing:** Use decimal for **all** currency aggregation in statement build and consolidation: (a) In buildBalanceSheet / buildProfitAndLoss, replace sumLines with a decimal-based sum (e.g. sumRound2 over line amounts). (b) In consolidation_service.ts, aggregate entity balances with decimal so that sub-material rounding does not accumulate. (c) Fail-shut when rounding gap exceeds aggregate materiality (export gate).

---

## Pillar 4: Immutable Audit Ledger

**Goal:** Cryptographic, hash-chained, non-rewritable log of all human overrides.

**Design:**

1. **New table `audit_ledger`** (migration `migrations/051_audit_ledger.sql`):
   - Columns: `id` (PK), `tenant_id`, `period_label` (optional), `event_type` (e.g. `flag_override`, `staging_approval`, `staging_rejection`), `deterministic_flag_snapshot` (JSONB), `agent_dissent_snapshot` (JSONB), `user_prompt_rationale` (TEXT), `previous_entry_hash` (TEXT, nullable), `entry_hash` (TEXT), `created_at` (TIMESTAMPTZ), `created_by` (TEXT, optional).
   - Indexes: `tenant_id`, `(tenant_id, created_at)`, `(tenant_id, event_type)`.
   - No UPDATE/DELETE from application code; append-only.
2. **Hash chain logic:** On insert: compute `entry_hash` = SHA256(canonical content + previous_entry_hash). Verification: walk the chain and recompute each hash; if any mismatch, chain is broken.
3. **Repository and service:** audit_ledger_repository.ts: `appendEntry`, `getLatestHash`, `verifyChain`. audit_ledger_service.ts: `recordOverride`, `verifyChain`.
4. **Integration:** PATCH /api/audit/professional-review/flags/:id requires note/userRationale and calls recordOverride before updating flag. HITL resolve (approve/reject) for policy_change or flag_override appends to audit_ledger.

---

## Architectural Mandates (Summary)

| Mandate | Implementation |
|---------|----------------|
| **Floor (Deterministic)** | Integrity gate: TB revenue vs contract revenue; throw blocking exception if variance > tolerance. All currency math via decimal.js. |
| **Ceiling (Agentic)** | Extend judgment layer: revenue spike >25% in last 5 days, "dedicated servers"/"exclusive facility access," going concern with accelerating burn. Flag-only. |
| **Witness (Logging)** | Hash-chained audit_ledger; every override stores (1) deterministic flag, (2) agent dissent, (3) user rationale, (4) SHA-256 link to previous entry. |

---

## Execution Constraints

1. **Strict typing:** Use TypeScript interfaces to separate **Fact Data** (deterministic TB totals, contract totals, ledger entries) from **Inferred Data** (agent suggestions, narratives). FactData / InferredData branded types in financial.ts.
2. **Fail-shut policy:** If audit ledger chain verification fails, trigger **CRITICAL_TAMPER_ALERT** and block financial export (PDF/CSV). Same if rounding gap exceeds aggregate materiality (export gate checks roundingGapExceedsMateriality when provided). Before generating PDF/CSV, call export gate service: verifyChain for tenant; block if roundingGapExceedsMateriality. On failure: return 403 with CRITICAL_TAMPER_ALERT.
3. **No new top-level dirs:** All new code under existing `src/`, new migration under `migrations/`.

---

## Professional Judgment Triggers (Skepticism Flags)

| Scenario | Trigger | Where |
|----------|---------|-------|
| Revenue spike | >25% of quarterly revenue in the final 5 business days | judgment_fraud_skepticism.ts; flag category fraud_skepticism. |
| Embedded leases | "Dedicated servers" or "exclusive facility access" (and existing keywords) | judgment_substance_over_form.ts: extend keyword list. |
| Going concern | Runway < 12 months **and** accelerating burn (vs prior period) | judgment_going_concern.ts: add branch when prior liquidity/burn available. |

---

## File-Level Summary

| Area | New / Modified |
|------|----------------|
| Migrations | New: `051_audit_ledger.sql`. |
| Types | New: `integrity.ts`, `audit_ledger.ts`; extend `financial.ts` (FactData/InferredData), `professional_review.ts` (priorLiquidityMetrics, revenueInLast5BusinessDays, totalQuarterlyRevenue). |
| Services | New: `integrity_gate_service.ts`, `audit_ledger_service.ts`, `export_gate_service.ts`. Extend: `financialStatements.ts` (decimal sumLines), `consolidation_service.ts` (decimal aggregation), `judgment_substance_over_form.ts`, `judgment_going_concern.ts`, `judgment_fraud_skepticism.ts`. |
| Repositories | New: `audit_ledger_repository.ts`. |
| Routes | Extend: audit.ts (flag resolve → ledger, POST /integrity/validate), hitl.ts (approve/reject → ledger when override). export.ts: call export gate before PDF/CSV. |
| Pipeline | statementGenerator: call integrity gate when TB + contracts exist before building statements. |

---

## Implementation Status

This plan has been implemented. All pillars, mandates, execution constraints, and professional judgment triggers are in place.
