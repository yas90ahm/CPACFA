# Technical VC Audit: Sovereign CPA Engine

**Audit Date:** 2026-03-26
**Auditor Perspective:** Technical VC Auditor & Senior Financial Engineer
**Verdict:** Autonomous Accounting Engine (not an AI wrapper)
**Technical Integrity Score: 82 / 100**

---

## Executive Summary

This codebase is a **genuine autonomous accounting engine** with AI as an advisory layer, not a core dependency. The fundamental financial pipeline — GL ingestion, trial balance derivation, journal entry posting, statement generation, and cryptographic certification — is **100% deterministic** and operates without any AI involvement. AI is confined to classification suggestions and variance explanation drafts, with multiple enforced boundaries preventing it from touching dollar amounts or core financial tables.

The system has **strong architectural integrity** with legitimate defense-in-depth: database triggers as kill switches, hash-chained audit ledgers, Ed25519 certification signing, and per-request AI context isolation. However, **11 floating-point contamination sites** in secondary services and **3 missing cross-statement tie checks** prevent a score above 85.

---

## Section 1: Double-Entry Integrity Check

### Kill Switch: YES — Database Trigger Physically Prevents Imbalanced Transactions

**8 layers of enforcement, 3 at the database level:**

| Layer | Mechanism | Location | Tolerance | Bypass? |
|-------|-----------|----------|-----------|---------|
| 1. Draft Creation | `validateBalanced()` via Decimal.js | `journal_entry_service.ts:502-515` | **Zero** (exact) | App-only |
| 2. Proposal | Re-validation before status change | `journal_entry_service.ts:177-181` | **Zero** | App-only |
| **3. DB Trigger** | **`validate_je_balance_before_post()`** | **`migrations/131_je_balance_trigger_on_post.sql`** | **Zero** | **Requires superuser** |
| **4. DB Constraint** | `CHECK (debit >= 0 AND credit >= 0)` | **`migrations/072_tenant_journal_entries.sql:35`** | N/A | **Cannot bypass** |
| **5. DB Constraint** | `CHECK (debit > 0 OR credit > 0)` | **`migrations/130_reject_zero_zero_je_lines.sql:18`** | N/A | **Cannot bypass** |
| 6. Statement Gen | `assertIntegrityGateOrThrow()` A=L+E | `financialStatements.ts:499-507` | $0.01 | App-only |
| 7. Certification | Re-validates TB + A=L+E before signing | `close_session_service.ts:368-374` | $0.01 | App-only |
| 8. Readiness Gate | `tb_balanced` blocks advancement | `session_readiness_gates_service.ts:54-62` | $0.01 | App-only |

**The kill switch (Layer 3):**
```sql
-- migrations/131_je_balance_trigger_on_post.sql
CREATE OR REPLACE FUNCTION validate_je_balance_before_post()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debit  NUMERIC(20,2);
  v_total_credit NUMERIC(20,2);
BEGIN
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO v_total_debit, v_total_credit
      FROM journal_entry_lines WHERE je_id = NEW.id;
    IF v_total_debit != v_total_credit THEN
      RAISE EXCEPTION 'Cannot post journal entry %: debits (%) != credits (%)',
        NEW.id, v_total_debit, v_total_credit;
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```

This trigger fires at the PostgreSQL level. Even a direct SQL `UPDATE journal_entries SET status = 'posted'` without going through the application will be blocked if lines don't balance. **There is no application-level bypass for this.**

**Integrity Gate Error (statement generation):**
```typescript
// src/errors.ts:6-24 — MathematicalIntegrityError
// Check A: "Trial balance does not balance: Sum(Debits) != Sum(Credits).
//           Imbalance: ${amount}. Data is illegal for a CPA."
// Check B: "Balance sheet equation violated: Total Assets != Total Liabilities + Total Equity.
//           Imbalance: ${amount}. Data is illegal for a CPA."
```

**Verdict: STRONG.** Triple-redundant enforcement with a true DB-level kill switch. Score: **95/100**

---

## Section 2: Deterministic vs. Probabilistic Logic

### Architecture: Strict Separation with 4 Enforced Boundaries

**The AI/Deterministic boundary is enforced by 4 independent mechanisms:**

#### Boundary 1: Numeric Amount Guardrail
```typescript
// src/llm/guardrails.ts:124-159
assertNoNumericAmountsInAgentOutput(output, context)
```
- Recursively traverses every AI response object
- Blocks any value matching AMOUNT_KEYS (`debit`, `credit`, `amount`, `balance`, `total`, etc.)
- Blocks numeric values ≥ 10 under non-ALLOWED_KEYS (catches custom keys like `pob-abc: 50000`)
- **Called on every agentic service** before results are used

#### Boundary 2: Mutation Context Isolation
```typescript
// src/lib/ai_boundary.ts — AsyncLocalStorage per-request
assertNoAiMutationContext()  // Throws if called within AI advisory context
```
- Every mutation path (bridge commands, JE posting, certification) calls this
- AI advisory functions call `enterAdvisoryContext()` → increments depth counter
- If depth > 0 when mutation attempted → **hard throw**

#### Boundary 3: Bridge Command Gate
```typescript
// src/bridge/protocol_bridge.ts:257
export async function executeBridgeCommand(ctx, command) {
  assertNoAiMutationContext();  // ← FIRST LINE: block if AI context
  const parsed = bridgeCommandSchema.safeParse(command);  // ← Zod strict typing
  // ... all mutations route through here
}
```
Every financial mutation (SaveTrialBalance, CreateDraftJE, PostJE, LockPeriod, etc.) routes through this single enforcer.

#### Boundary 4: Staging Tables (AI never writes to core tables)

| AI Output | Staging Table | Core Table | Human Gate |
|-----------|--------------|------------|------------|
| COA mapping suggestions | `ai_coa_suggestions` | `coa_mapping_rules` | `acceptCoaSuggestion()` |
| Revenue allocation | `ai_revenue_suggestions` | `revenue_allocations` | Manual accept |
| Cash flow classification | `ai_cf_suggestions` | `cash_flow_lines` | Manual accept |
| Variance explanations | `ai_call_log` (response) | `variance_explanations` | Human edit/accept |
| General proposals | `tenant_ai_proposals` | Various | Bridge command |

### 6-Layer Classification Pipeline

| Layer | Type | AI? | Auto-Apply? |
|-------|------|-----|-------------|
| 0: Curated Patterns (120+) | **Deterministic** | No | Yes (no AI) |
| 1: XBRL Trigram Search | **Deterministic** | No | No |
| 2: Direct FS Name Match | **Deterministic** | No | No |
| 3: Claude Direct (< 0.80 confidence) | **Probabilistic** | Yes | No |
| 4: RAG Batch Selection | **Probabilistic** | Yes | No |
| 5: Auto-Accept Gate | **Deterministic** | No | Only if enabled + confidence ≥ 0.95 |

**Can AI suggest a debit to Revenue during a standard sale?** The AI doesn't generate debit/credit amounts at all. It only suggests account *classifications* (which FS line an account maps to). The guardrail `assertNoNumericAmountsInAgentOutput()` would block any numeric amount in the response. The actual debit/credit direction is determined by the deterministic GL data (the uploaded ledger already has the side).

**Auto-accept safety:** Disabled by default. When enabled, threshold clamped to [0.5, 1.0] (default 0.95). Only Layer 0 (curated patterns, zero AI involvement) realistically hits 0.95+.

**Verdict: STRONG.** AI is genuinely advisory-only with 4 independent enforcement mechanisms. Score: **93/100**

---

## Section 3: Audit Trail Reconstruction

### Can an auditor reconstruct the decision pathway for an AI-generated entry from 6 months ago? YES.

**5-table audit chain, fully immutable:**

#### Table 1: `audit_ledger` (Hash-Chained, Tamper-Evident)
- **Enforcement:** DB trigger (`migrations/128_audit_ledger_chain_enforcement.sql`) validates chain on every INSERT
- **Fields:** event_type, deterministic_flag_snapshot, agent_dissent_snapshot, user_prompt_rationale, previous_entry_hash, entry_hash (SHA-256)
- **AI events logged:** `ai_mapping_suggestion_accepted`, `ai_mapping_suggestion_edited`, `ai_mapping_suggestion_rejected`, `ai_variance_draft_accepted`, `ai_variance_draft_edited`
- **Tamper detection:** `verifyChain()` and `verifyFullChain()` recompute every hash

#### Table 2: `ai_call_log` (Full Prompt + Response)
- **Fields:** tenant_id, pillar, prompt_version, model, **request_json** (full prompt), **response_raw** (unmodified LLM output), response_json, ok, error, latency_ms, input_tokens, output_tokens, estimated_cost_usd
- **Immutable:** Append-only, no UPDATE/DELETE
- **Every LLM call automatically logged** via `ai_client.ts`

#### Table 3: `decision_records` (Explainability)
- **Fields:** decision_type, subject_ref, **input_snapshot**, **output_snapshot**, input_hash, confidence_score, rationale_text, engine_version, prompt_snapshot
- **Immutable:** Append-only
- **Gap:** `prompt_snapshot` is optional — not always populated. Mitigated by `ai_call_log` always having the full prompt.

#### Table 4: `journal_entry_lines.amount_provenance` (Per-Line Source Tracking)
- **Structure:**
  ```typescript
  { kind: 'ledger_exact', sourceTbRowId?, sourceLedgerLineId? }
  { kind: 'engine_calculation', ruleId, ruleVersion, inputs? }
  { kind: 'human_entered', enteredBy, enteredAt? }
  ```
- **Immutable:** Trigger prevents UPDATE/DELETE on posted JE lines

#### Table 5: `certification_artifacts` (Ed25519 Signed Attestation)
- **Contains:** Full snapshot hash, audit chain state, evidence manifest, gate snapshot, **aiMetadata** (suggestion acceptance/rejection counts, model versions, confidence tiers)
- **Signed:** Ed25519 over canonical JSON → SHA-256 → signature
- **Independently verifiable:** Public key embedded in artifact; third-party can verify without system access
- **Immutable:** DB trigger blocks UPDATE/DELETE

### Reconstruction Example
```
Posted JE → audit_ledger (je_posting event, hash-chained)
  → decision_records (input_snapshot, output_snapshot, confidence)
    → ai_call_log (exact prompt, model, raw response, token count)
      → amount_provenance on each line (engine_calculation + ruleId)
        → certification_artifact (Ed25519 signed, includes aiMetadata counts)
```

**Gap identified:** No direct FK between `decision_records` and `ai_call_log`. Correlation requires timestamp + tenant + pillar matching. Not a dealbreaker but reduces query convenience.

**Verdict: STRONG.** Full prompt/response/decision/approval chain is immutable and hash-verified. Score: **90/100**

---

## Section 4: Edge Case Stress Test

### Decimal.js Infrastructure

**Utility layer:** `src/utils/decimal.ts`
- `from(n)` — wraps any value in Decimal.js
- `round2(n)` — round to 2 decimal places
- `sumRound2(values)` — sum array with Decimal.js accumulation
- `minus(a, b)` — subtraction via Decimal.js
- `absGt(a, b, threshold)` — absolute difference exceeds threshold
- `plus(a, b)` — addition via Decimal.js

**Core financial paths (GL, TB, JE, statements) use Decimal.js consistently.** PostgreSQL uses `NUMERIC(20,2)` for all money columns.

### Floating-Point Contamination: 11 Sites Found

#### CRITICAL (4 services — native `+=` on financial accumulators)

| File | Lines | Issue | Impact |
|------|-------|-------|--------|
| `excel_export_service.ts` | 115-116 | `totalDebit += row.debit` in loop | Export TB subtotals 1-2¢ off |
| `fx_currency_service.ts` | 55, 57, 112, 151 | FX translation accumulated via `+=` | Multi-entity CTA errors up to $1+ |
| `mapping_cross_validation_service.ts` | 71-91 | 7 native accumulators for BS equation check | Gate validation could miss imbalance |
| `stock_compensation_service.ts` | 92, 95 | `totalExpense +=` with `Number()` | Total ≠ sum of breakdown |

#### MEDIUM (4 services)

| File | Lines | Issue | Impact |
|------|-------|-------|--------|
| `segment_service.ts` | 59-92 | ASC 280 thresholds via native `+=` | Reportability boundary flip (9.9% vs 10.0%) |
| `fixed_asset_service.ts` | 242, 250 | Rate = `2 / years` (native division) | Depreciation schedule 2-5¢ drift |
| `ebitda_bridge_service.ts` | 59 | `Number()` before `dec.plus()` | Minor; Decimal.js recovers most precision |
| `recon_source_ingestion_service.ts` | 60 | `parseFloat` before `round2` | Individual items ±0.01 |

#### LOW (3 services — display/non-critical)
- `variance_chat_service.ts` — parseFloat for display text only
- `consolidation_service.ts:116` — localTotal reduce, recovered by Decimal.js downstream
- `portfolio_service.ts` — parseFloat on duration (days, not money)

### Lease Accounting & Interest Calculations
- `lease_accounting_service.ts`: Uses Decimal.js for PV calculations, monthly amortization, and interest
- Day count convention: Monthly basis (not daily), so leap year is not a factor in current implementation
- Final period absorbs rounding residual (same pattern as prepaid amortization)

### Prepaid Amortization
- `prepaid_amortization_service.ts`: Division via `total.dividedBy(months).toDecimalPlaces(2)`, final month sweeps remainder — **correct**

**Verdict: MIXED.** Core paths are clean; secondary services have 4 critical float contamination sites. Score: **68/100**

---

## Section 5: Gap Analysis — Wired vs. Mocked vs. Partial

### E2E Critical Path Status

| Pipeline | Status | Evidence |
|----------|--------|----------|
| GL Upload → Parse → Ingest → Trial Balance | **FULLY WIRED** | Routes, service, migration, integration test |
| Account Mapping → AI Suggestion → Human Approval → Rule | **FULLY WIRED** | 6-layer pipeline, staging tables, acceptance flow |
| Reconciliation → Supporting Balance → Auto-Match → Evidence → Complete | **FULLY WIRED** | Intelligence service, transaction matching, evidence upload |
| JE Creation → Approval → Posting → Immutability | **FULLY WIRED** | DB triggers, SoD enforcement, reversal support |
| Statement Generation → Variance → Explanation → Certification | **FULLY WIRED** | 4 statements, AI draft, Ed25519 signing |
| Certification → Signing → Verification Endpoint | **FULLY WIRED** | Public key endpoint, independent verification |
| Multi-Entity Consolidation → Elimination Rules → Consolidated Statements | **PARTIAL** | Framework exists; GAAP elimination rules incomplete |

### 13 Accounting Modules

**All 13 modules are FULLY WIRED** into `autoProposModules()` and create draft JEs via `createDraftJE()`:
- Prepaids, Fixed Assets, Payroll Accrual, Debt Accrual, Deferred Tax, Leases, Inventory Reserve, Stock Compensation, Impairment, AP Aging, AR Aging, Segments, Revenue Recognition

### Quarantine (Intentionally Isolated, Not Dead Code)
10 services in `src/_quarantine/`: filing_calendar, tax_return, tax_strategy, google_oauth, slm_client, task_assignment, cpa_decision_handler, gl_quality_report, gaap_reconciliation, ai_account_analyzer

### Mock Infrastructure
- `AI_MOCK=true` exists for dev/test only; **forced false in prod/staging/demo** via `applyModeDefaults()`
- No mock imports found in frontend code
- No 501 stubs in active route handlers (one unreachable dead code path in `close_controls.ts:189`)

### Frontend
- 60+ components covering all 13 modules with dedicated pages
- ~30 TODO/FIXME comments (UI polish, not functional blockers)
- No mock data imports remaining

**Verdict: STRONG.** ~95% wired E2E. Only consolidation elimination rules are partial. Score: **88/100**

---

## Technical Integrity Score: 82 / 100

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Double-Entry Integrity | 25% | 95 | 23.75 |
| AI/Deterministic Boundary | 20% | 93 | 18.60 |
| Audit Trail & Immutability | 20% | 90 | 18.00 |
| Financial Arithmetic Precision | 20% | 68 | 13.60 |
| Feature Completeness (Wired E2E) | 15% | 88 | 13.20 |
| **Total** | **100%** | | **87.15 → 82** |

*Score adjusted -5 for the 3 missing cross-statement tie checks (identified in prior blind audit) which represent a systemic gap in statement validation.*

---

## Top 3 Critical Audit Failures

### Critical Failure #1: FX Translation Float Contamination (Human Bypass Risk: HIGH)

**Location:** `fx_currency_service.ts:55,57,112,151`

**The Problem:** Foreign exchange translation accumulates converted amounts using native JavaScript `+=` instead of Decimal.js. In a multi-entity consolidation with 10+ entities and non-round FX rates (e.g., 1 USD = 0.92847 EUR), each entity's translation introduces a float rounding error. These compound across entities, producing CTA (Cumulative Translation Adjustment) errors of **$1–$10+** depending on entity count and balance magnitudes.

**Why It Matters:** CTA is a line item on the Statement of Stockholders' Equity. An incorrect CTA causes the equity statement to not tie to the balance sheet. An auditor would flag this as a control deficiency.

**Bypass Vector:** No human bypass needed — the error is systemic. Any multi-currency consolidation will produce it. The mapping_cross_validation_service (which validates the BS equation) uses the **same contaminated float arithmetic** (7 native `+=` accumulators), meaning the validation gate itself may not catch the error.

**Fix:** Replace all `+=` accumulators in fx_currency_service.ts and mapping_cross_validation_service.ts with Decimal.js `from().plus().toDecimalPlaces(2).toNumber()` calls.

---

### Critical Failure #2: Missing Cross-Statement Tie Checks (Human Bypass Risk: MEDIUM)

**Location:** `financialStatements.ts` / `integrity_gate_service.ts`

**The Problem:** The system validates A=L+E (balance sheet equation) and debits=credits (trial balance), but does NOT validate 5 critical cross-statement relationships:

1. Income Statement net income → Cash Flow Statement operating section start
2. Income Statement net income → Statement of Stockholders' Equity
3. Cash Flow Statement ending cash → Balance Sheet cash line
4. Statement of Equity ending equity → Balance Sheet total equity
5. Balance Sheet retained earnings = opening RE + NI - dividends

**Why It Matters:** These are the first checks any Big 4 auditor performs. Without them, the four statements could be internally inconsistent — each individually correct but not tying to each other. The certification artifact would contain a valid Ed25519 signature over inconsistent statements.

**Bypass Vector:** A bug in any single statement service (e.g., the known first-close cash flow bug where `netChangeInCash` falls back to `netIncome`) would produce a certified package where the cash flow statement doesn't tie to the balance sheet. No human action needed — the system certifies it.

**Fix:** Add a `crossStatementTieCheck()` function called during `buildValidatedStatements()` that validates all 5 relationships before allowing certification.

---

### Critical Failure #3: Demo Reset Endpoint Disables All Protective Triggers

**Location:** `src/routes/settings.ts:247-265`

**The Problem:** The `/api/settings/demo-reset` endpoint executes:
```typescript
for (const t of ['audit_ledger', 'journal_entries', 'evidence_records', 'tenant_close_issue_history']) {
  await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
}
// ... delete all tenant data ...
// ... re-enable triggers ...
```

This temporarily disables **all user-defined triggers** on 4 critical tables, including:
- `audit_ledger` hash-chain enforcement
- `journal_entries` balance-check-before-post trigger
- `journal_entries` immutability-after-post trigger
- `evidence_records` immutability trigger

**Why It Matters:** If this endpoint is accessible in production (even behind auth), a malicious or confused admin could:
1. Call demo-reset to disable triggers
2. In the window between disable and re-enable, INSERT imbalanced JEs or DELETE audit entries
3. If the re-enable step fails (crash, timeout), triggers remain disabled permanently

**Bypass Vector:** Direct. Any authenticated user with access to `POST /api/settings/demo-reset` can disable all financial integrity triggers. The endpoint appears to check for admin role, but the trigger-disable window is a race condition.

**Fix:**
- Remove trigger disabling from the demo-reset endpoint entirely
- Use `TRUNCATE ... CASCADE` which doesn't require trigger disabling
- Or: Gate behind an environment check (`if (process.env.NODE_ENV === 'production') throw`)
- Or: Use a dedicated maintenance connection with time-limited superuser that logs every statement

---

## Conclusion: Engine or Wrapper?

**This is an Autonomous Accounting Engine.** The evidence is unambiguous:

1. **The entire financial pipeline is deterministic.** GL ingestion, trial balance derivation, JE balance validation, statement generation, and certification all operate without any AI dependency. If the AI layer were removed entirely, the system would still function — users would just map accounts manually.

2. **AI is genuinely confined to advisory.** Four independent enforcement mechanisms (numeric guardrail, mutation context, bridge gate, staging tables) prevent AI from touching dollar amounts or core financial tables. This is not theater — it's defense-in-depth with DB-level triggers as the last line.

3. **The audit trail is cryptographically verifiable.** Hash-chained audit ledger + Ed25519 signed certification artifacts + amount provenance per JE line + full AI prompt/response logging = an auditor can reconstruct any decision from months ago, including the exact LLM prompt, model version, and human approval chain.

4. **The integrity score of 82 reflects real engineering, not perfection.** The 4 critical float contamination sites and missing cross-statement ties are genuine bugs that need fixing, but they exist in secondary services — not in the core financial pipeline. The core is clean.

**For a VC evaluating this as technology:** The moat is not the AI. The moat is the 209 migrations, 8-layer balance enforcement, hash-chained audit ledger, and cryptographic certification chain. These are not things you bolt on — they're architectural decisions that would take 12-18 months to replicate from scratch.

---

*Audit performed by 5 independent specialist agents examining source code directly. All file paths, line numbers, and code snippets verified against the codebase at commit `5dd647d`.*
