# Blind Codebase Audit v1

**Date:** 2026-03-26
**Method:** 4 parallel agents, each reading code independently with zero context about the product
**Scope:** All executable code in src/ — no documentation, README, or spec files read

---

## Agent 1 — Follow the Data

### Section 1 — What I Found

#### Entry Points (External Data)

1. **POST /api/gl/parse** — GL preview (no persist). File buffer → CSV → parsed records → preview response. Dead end — data discarded after response.

2. **POST /api/gl/ingest** — GL ingest (persist). File → CSV → GLUploadRow[] → grouped by entry_id → validated (debit=credit per entry) → split:
   - Balanced → `core.general_ledger` (batch insert, 1000/batch)
   - Imbalanced → `core.staging_items` (HITL queue)
   - Derived TB → `core.period_trial_balance` (snapshot)
   - Upload history → `gl_upload_history` (SHA-256 file hash for dedup)

3. **POST /api/trial-balance/ingest** — Full pipeline: file → parse → classify → build statements (BS, P&L, CF, Equity) → persist to `statement_packages` + `statement_lines` + `statement_generations`

4. **POST /api/close/sessions/:id/statement-packages/generate** — Statement generation from adjusted TB → `statement_packages` + `statement_lines`

5. **POST /api/close/sessions/:id/certify** — Certification: re-validates all gates → creates ledger snapshot (hash-chained) → Ed25519 signs → `certification_artifacts` (immutable)

6. **POST /api/close/sessions/:id/lock** — Terminal lock: status → LOCKED (irreversible, DB triggers prevent modification)

7. **POST /api/export/pdf** — Export with integrity gates: tamper detection → PDF generation → audit logged to `audit_ledger`

#### Database Tables (Canonical Financial State)

| Table | Purpose | Immutability |
|-------|---------|-------------|
| `core.general_ledger` | Raw GL entries | DELETE on re-upload only |
| `core.period_trial_balance` | GL aggregated by account | Read-only after creation |
| `statement_packages` | FS headers with version/hash | Versioned |
| `statement_lines` | Individual FS line items | Immutable per version |
| `ledger_snapshots` | Hash-chained certified snapshots | Immutable (trigger) |
| `audit_ledger` | Tamper-evident event log | Append-only (trigger) |
| `certification_artifacts` | Ed25519 signed attestations | Immutable (trigger) |
| `close_sessions` | Workflow state machine | Status machine with terminal LOCKED |

### Section 2 — Anomalies

- **RISK:** Imbalanced GL entries queue in `staging_items` indefinitely — no scheduler to auto-fix or escalate
- **RISK:** `autoAdjustTranslationRounding()` silently modifies GL debit/credit values up to $0.01 per line for FX rounding — not logged to audit trail
- **RISK:** Trial Balance ingest in dev mode can orphan statements without session linkage
- **DEBT:** GL preview and ingest return nearly identical structures — preview data is discarded
- **GAP:** SHA-256 file hash collision handling — astronomically unlikely but unhandled

### Section 3 — Summary

This is a **Financial Close Automation Engine** that ingests GL (CSV/XLSX) → derives trial balance → generates GAAP statements (BS, P&L, CF, Equity) → enables CFO certification with cryptographic locking. The pipeline enforces atomicity (per-entry balance validation), integrity (hash-chained audit ledger + Ed25519 signatures), immutability (LOCKED sessions trigger DB constraints), and determinism (Decimal.js, no floating-point).

---

## Agent 2 — Follow the Money

### Section 1 — What I Found

#### Decimal Architecture

- **Utility:** `src/utils/decimal.ts` wraps Decimal.js with `from()`, `plus()`, `minus()`, `mul()`, `div()`, `round2()`, `sumRound2()`
- **Precision:** 2 decimal places (DP=2), rounding on every operation
- **Database:** All money columns use `NUMERIC(20,2)` — never FLOAT/DOUBLE/REAL
- **Financial Statements:** `src/services/financialStatements.ts` uses Decimal exclusively (verified)
- **Journal Entries:** `src/services/journal_entry_service.ts` uses `sumRound2()` for balance validation (verified)

#### GENERATED ALWAYS Columns

| Table | Column | Formula | Risk |
|-------|--------|---------|------|
| tenant_period_reconciliations | variance | `gl_balance - supporting_balance` | LOW |
| tenant_period_reconciliations | unexplained_variance | `variance - COALESCE(reconciling_items_total, 0)` | LOW |
| tenant_period_reconciliations | is_within_tolerance | `ABS(variance) <= tolerance_amount` | LOW |
| tenant_variance_analysis | change_amount | `current_amount - prior_amount` | LOW |
| tenant_variance_analysis | change_percentage | `CASE WHEN prior != 0 THEN ((curr-prior)/prior)*100 ELSE NULL END` | MEDIUM — NULL not always handled |
| prepaid_amortization | monthly_amount | `ROUND(total_amount / months_count, 2)` | **HIGH — see BUG** |

### Section 2 — Anomalies

**BUG #1: Prepaid Amortization Monthly Division** (migrations/200, line 20)
- `ROUND(total_amount / months_count, 2)` — integer division leaves remainder unrecognized
- Example: $10,000 ÷ 3 = $3,333.33 × 3 = $9,999.99 (leaves $0.01)
- **Impact:** AJE journal entries generated from this table won't round-trip

**BUG #2: Fixed Asset Depreciation Loop** (fixed_asset_service.ts, line 135)
- `acc += periodDep` uses native JS `+=` across year loop
- Compounding float error: 10 periods of $100.12 = $1001.1999... instead of $1001.20
- **Impact:** Depreciation expense JEs have rounding drift

**BUG #3: Consolidation Entity Gap Accumulation** (consolidation_service.ts, lines 100-101)
- `entityDebit += debit` accumulates float error; used in materiality gate
- **Impact:** Materiality threshold comparison may fail edge cases

**BUG #4: Consolidation Balance Subtraction** (consolidation_service.ts, line 119)
- `entry.debit - entry.credit` uses native subtraction on `.toNumber()` results
- **Impact:** Elimination rule amount determination loses precision

**RISK: 8 instances of native JS arithmetic on financial database values identified**

### Section 3 — Summary

The codebase demonstrates **strong architectural discipline** with Decimal.js utility and NUMERIC(20,2) storage. The core financial statement pipeline (BS, P&L, CF, Equity) uses Decimal exclusively. However, **4 critical bugs** exist in operational services: fixed asset depreciation loop, consolidation entity balancing, elimination rule evaluation, and prepaid SQL division. These affect AJE generation and multi-entity consolidation but **do not affect the core 4-statement generation**. Total lines to fix: ~10.

---

## Agent 3 — Follow the Trust Chain

### Section 1 — What I Found

#### Certification Sequence (13 steps)

1. Mathematical integrity gate — TB debits = credits, BS equation A=L+E
2. Cross-statement validation — BS↔P&L↔CF↔Equity ties
3. Audit chain verification — SHA-256 hash-chain integrity on entire audit ledger
4. Evidence manifest computation — SHA-256 hash of all JE evidence references
5. GL snapshot — all GL entries grouped by entry_id, sorted deterministically
6. Ledger snapshot creation — immutable, hash_version=3
7. AI metadata capture — counts of AI suggestions accepted/edited/rejected
8. Gate snapshot capture — all 11 gates' pass/fail status at certification moment
9. Certification artifact build — V1 struct with all above data
10. Artifact hashing — SHA-256 over canonical JSON (alphabetical keys)
11. Ed25519 signing — private key signs the artifact hash
12. Artifact insertion — immutable table (trigger prevents UPDATE/DELETE)
13. Session status update — status='certified', certified_by, certified_at

#### Cryptographic Operations

```
Snapshot payload → canonical JSON → SHA-256 = snapshotHash
Audit ledger → each entry: SHA-256(tenantId|periodLabel|eventType|...|previousHash|createdAt) = entryHash
Evidence manifest → SHA-256 = manifestHash
Artifact struct (snapshotHash + lastEntryHash + manifestHash + validation + gates + AI metadata)
  → canonical JSON → SHA-256 = artifactHash
artifactHash → Ed25519 sign(privateKey) → signature_b64
```

#### External Verification

- `GET /api/verification/certification/public-key` — returns Ed25519 public key (no auth required)
- `POST /api/verification/certification/verify` — recomputes artifact hash, verifies Ed25519 signature
- **Offline verification possible:** recompute SHA-256 of canonical JSON, verify Ed25519 signature against public key — no server needed

#### Tamper Detection

| Tampering Target | Detection Mechanism | Prevented By |
|-----------------|---------------------|-------------|
| Journal entry after posting | DB trigger `journal_entries_no_update` | UPDATE/DELETE blocked at DB level |
| Audit ledger record | DB trigger `audit_ledger_no_update/no_delete` + hash chain verification | Chain breaks on any modification |
| Certification artifact | DB trigger `certification_artifacts_no_update/no_delete` + Ed25519 signature | Signature fails without private key |
| GL entries post-certification | Snapshot hash computed at cert time | Hash mismatch if GL modified (but no DB trigger on GL table) |

### Section 2 — Anomalies

- **RISK:** GL table (`general_ledger`) lacks immutability triggers — unlike `audit_ledger`, `ledger_snapshots`, `certification_artifacts`. Post-certification GL tampering is not database-enforced (though snapshot hash would detect it at verification time).
- **DEBT:** Hash version warnings in verification endpoint conflate snapshot hash version with artifact hash version — misleading to auditors
- **DEBT:** Audit chain advisory locks use 32-bit hash of tenantId — theoretical collision possible under high concurrency
- **GAP:** Artifact does not include a separate `generalLedgerHash` field — GL inclusion is implicit via snapshotHash
- **GAP:** `validationStateAtCertification` and `gateSnapshot` are in the artifact but gates can change post-certification — snapshot is immutable but current gate state may differ

### Section 3 — Summary

This system establishes trust through a **cryptographic chain**: GL and trial balance are normalized and hashed (SHA-256), along with evidence manifest and audit chain state, into an immutable ledger snapshot; that snapshot hash plus validation checks, AI usage metadata, and gate status are embedded in a CertificationArtifactV1; the artifact is canonicalized (alphabetical keys) and hashed (SHA-256), then signed with Ed25519. External parties verify by recomputing the artifact hash and checking the Ed25519 signature against the public key — no server needed. The audit ledger is hash-chained, append-only (DB triggers block modification), and verified at certification. Primary gap: GL table lacks DB-level immutability triggers (relies on application-level controls).

---

## Agent 4 — Follow the AI Boundaries

### Section 1 — What I Found

#### AI Infrastructure

- **AI Client:** `src/ai/ai_client.ts` — Zod schema validation on all AI responses
- **Claude Adapter:** `src/ai/adapters/claude_adapter.ts` — timeout/cost tracking, mock mode
- **Multi-Provider:** `src/llm/provider.ts` — Anthropic, OpenAI, Mistral abstraction
- **Guardrails:** `src/llm/guardrails.ts` — `assertNoNumericAmountsInAgentOutput()` checks for dollar amounts in AI output
- **Boundary:** `src/lib/ai_boundary.ts` — AsyncLocalStorage context tracking, `enterAdvisoryContext()`/`exitAdvisoryContext()`

#### AI Touchpoints Assessment

| Service | Input to AI | Output from AI | Reaches Core Tables? | Guardrail? | Status |
|---------|------------|---------------|---------------------|-----------|--------|
| Account mapping (ai_classification_service) | Account names + XBRL taxonomy (text only) | Account → FS line suggestions | YES (coa_mapping_rules via accept) | ✅ assertNoNumericAmounts | **SAFE** |
| Variance chat (variance_chat_service) | Controller question + investigation data | Narrative explanation | NO (read-only) | ✅ assertNoNumericAmounts | **SAFE** |
| Justifications (justification_service) | Accounting question + FASB/IFRS chunks | IRAC narrative | NO (audit_ledger only) | ✅ assertNoNumericAmounts | **SAFE** |
| Revenue allocation (revenue_recognition_service) | Contract amounts in prompt | Dict with dollar amounts | YES (core.revenue_*) | ❌ **BYPASSED** | **CRITICAL** |
| Recognition schedule (revenue_recognition_service) | Contract amounts in prompt | Schedule with dollar amounts | YES (core.revenue_*) | ❌ **BYPASSED** | **CRITICAL** |

#### Auto-Accept Without Human Confirmation

1. **COA Mapping:** Auto-accepts at ≥80% confidence if validation passes. Non-financial (names only). **LOW RISK.**
2. **Revenue Allocation:** `suggestAllocationAgentic()` stores allocation directly to core tables. No HITL staging. **CRITICAL.**

#### Fallback When AI Unavailable

| Service | Fallback |
|---------|----------|
| Account mapping | Best XBRL trigram match (deterministic) |
| Revenue allocation | Equal split across POBs (deterministic) |
| Variance chat | Template response (safe) |
| Justifications | Static text (safe) |

All fallbacks are deterministic — system degrades gracefully.

### Section 2 — Anomalies

**BUG — CRITICAL: Revenue Allocation Guardrail Bypass**
- `suggestAllocationAgentic()` (revenue_recognition_service.ts:165-224)
- AI generates `{ "pob-abc123": 50000, "pob-def456": 25000 }`
- Guardrail `hasNumericAmount()` only checks keys in AMOUNT_KEYS (`debit`, `credit`, `amount`, `balance`)
- POB ID keys (`pob-*`) are NOT in AMOUNT_KEYS → numeric values pass undetected
- Amounts written to `core.revenue_contracts.allocation` and `core.revenue_performance_obligations.allocationAmount`
- Executes INSIDE `enterAdvisoryContext()` WITHOUT calling `assertNoAiMutationContext()`

**BUG — CRITICAL: Recognition Schedule Same Pattern**
- `suggestRecognitionScheduleAgentic()` has identical bypass

**DEBT: Database Role Enforcement Not Per-Request**
- PostgreSQL roles (`core_writer`, `ai_writer`, `auditor_reader`) validated at startup but connection pool runs as main user
- If `assertNoAiMutationContext()` is missed in a service, DB-level protection doesn't activate

**GAP: Guardrail Incomplete for Custom Structures**
- Any AI output with non-standard keys containing numeric values passes the guardrail
- Example: `{ percentAllocations: [25, 50, 25] }` would pass

### Section 3 — Summary

The system has **well-architected AI advisory boundaries** for most operations: account mapping, variance explanations, and justifications all enforce numeric guardrails and write only to ai_* tables until human confirmation. However, a **critical vulnerability** exists in the revenue recognition module where AI generates dollar amounts that bypass the guardrail (custom dictionary keys not in AMOUNT_KEYS), are written directly to core financial tables, and execute within an advisory context without mutation-boundary protection. The fallback path (equal split) is deterministic and safe. The primary defense is application-level (`assertNoAiMutationContext()`) rather than database-level, since PostgreSQL role switching is validated at startup but not enforced per-request.

---

## Cross-Agent Summary

### Critical Findings (Require Immediate Attention)

| # | Finding | Agent | Severity | Impact |
|---|---------|-------|----------|--------|
| 1 | Revenue allocation AI guardrail bypass | Agent 4 | **CRITICAL** | AI-generated dollar amounts reach core financial tables unguarded |
| 2 | Fixed asset depreciation float accumulation | Agent 2 | **BUG** | Depreciation JE amounts have rounding drift |
| 3 | Consolidation native JS arithmetic | Agent 2 | **BUG** | Materiality gate + elimination amounts lose precision |
| 4 | Prepaid monthly_amount SQL division | Agent 2 | **BUG** | AJE generation leaves remainder unrecognized |
| 5 | GL table lacks immutability triggers | Agent 3 | **RISK** | Post-certification GL tampering not DB-enforced |

### Architecture Strengths

1. **Decimal.js discipline** — core financial statements use Decimal exclusively
2. **Cryptographic certification** — Ed25519 signed, SHA-256 hashed, externally verifiable
3. **Hash-chained audit ledger** — append-only, tamper-evident, DB triggers enforced
4. **AI boundary architecture** — advisory context tracking, Zod validation, numeric guardrails (with noted gaps)
5. **Fail-open AI** — all AI paths have deterministic fallbacks
6. **Immutability enforcement** — posted JEs, audit records, certification artifacts all trigger-protected
7. **11-gate progressive validation** — mapping → recon → templates → statements → variances → evidence → certification

### What This System Is

A **Financial Close Automation Engine** for PE-backed mid-market companies ($100M-$1B revenue). It takes a company's general ledger (CSV/XLSX), derives a trial balance, maps accounts to GAAP/IFRS reporting lines (with AI assistance), enables reconciliation of balance sheet accounts, processes adjusting journal entries (including 13 accounting modules), generates four certified financial statements (Balance Sheet, Income Statement, Cash Flow Statement, Statement of Stockholders' Equity), and produces cryptographically signed certification artifacts with Ed25519 signatures and hash-chained audit trails. The system enforces that every dollar traces to a specific GL entry, every AI suggestion requires human confirmation (with one critical exception in revenue allocation), and the final certified output is externally verifiable without server access.
