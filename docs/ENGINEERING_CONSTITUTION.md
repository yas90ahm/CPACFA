# ENGINEERING CONSTITUTION — SOVEREIGN CPA ENGINE

## MISSION

Build a **deterministic accounting engine** that converts messy or unstructured financial data into mathematically correct, standards-compliant financial statements with a complete, cryptographically verifiable audit trail.

The system must be:

- **deterministic**
- **reproducible**
- **auditable**
- **mathematically provable**

**Trust > Intelligence.**

---

## CORE ARCHITECTURAL LAW

### 1. Determinism First

Identical inputs MUST produce identical outputs.

- No randomness.
- No hidden state.
- No non-deterministic math.

### 2. Math is Sovereign (TypeScript Core Only)

ONLY deterministic TypeScript services may:

- compute amounts
- perform calculations
- balance entries
- post journal entries
- mutate ledger values
- generate statements

**If math happens anywhere else, it is a bug.**

### 3. AI is Advisory Only

AI may assist judgment but NEVER controls truth.

AI MUST NEVER:

- calculate numbers
- estimate values
- mutate ledger data
- post entries
- bypass workflow gates
- directly write to the database

---

## THE FOUR PILLARS OF THE AGENTIC LAYER

### Pillar 1 — Classifier (Ingestion & Characterization)

**Allowed:**

- identify accounting object (lease, prepaid, expense, payroll, etc.)
- determine financial statement classification (asset/liability/etc.)
- select applicable accounting standard (ASC/IFRS rule)
- output structured labels/parameters only

**Forbidden:**

- computing amounts
- performing math
- mutating ledger

**Output must be metadata only.**

---

### Pillar 2 — Advisor (Suggestion Engine)

**Purpose:** Recommend accounting treatments and propose journal entry templates.

**Allowed:**

- suggest that an entry should exist
- recommend accounts to debit/credit
- create draft JE templates
- flag missing entries
- provide reasoning/explanations

**Forbidden:**

- computing or estimating amounts
- balancing entries
- performing math
- posting entries
- auto-approval
- mutating ledger
- bypassing workflow
- **inventing or estimating monetary amounts**

**Constraints:**

- proposals enter Draft/HITL only
- human approval required
- TypeScript core computes all amounts

**Amount provenance (scope interpretation):** Advisor may propose journal entry amounts **only** if the amount is provably sourced from:
- **(A)** an existing source ledger line / TB row (exact match), or
- **(B)** a deterministic TS engine calculation with stored rule/version + inputs, or
- **(C)** a human-entered amount.

**Implementation:** Every JE suggestion and HITL adjustment line must carry a valid `amount_provenance` (ledger_exact | engine_calculation | human_entered). AI outputs without valid provenance are **rejected** at the gate (400 / AMOUNT_PROVENANCE_REQUIRED).

**Rule:** Words/labels → AI allowed. Numbers → TypeScript only. Amounts → (A), (B), or (C) only.

---

### Pillar 3 — Shadow Auditor

**Allowed:**

- review human/manual entries
- detect violations
- flag inconsistencies
- block unsafe postings

**Forbidden:**

- modifying entries automatically

---

### Pillar 4 — Justifier

**Allowed:**

- generate IRAC memos
- create documentation
- explain reasoning

**Forbidden:**

- touching financial data

**Text only.**

---

## MANDATORY SYSTEM COMPONENTS

| Component | Requirement |
|-----------|-------------|
| **The Forge** | Staging area that blocks imbalanced data |
| **The Protocol Bridge** | Strict service interface; no direct DB mutation |
| **The Attribution Engine** | Every change tied to user/agent ID |
| **The Truth Gate** | Export blocked if discrepancy ≥ $0.01 |
| **The Audit Binder** | Statements + memos + hashes + full trail |

**Workflow must be:** Ingest → Stage → Draft → Audit → Lock → Certify → Export

**No shortcuts.**

---

## EXPLICITLY OUT OF SCOPE (PERMANENTLY FORBIDDEN)

- forecasting
- budgeting
- scenario analysis
- CFO/CFA advisory logic
- financial health scoring
- valuation models
- strategy or planning tools
- predictive models
- autonomous posting
- direct DB writes
- AI-generated math
- anything not directly required to produce certified statements

**This is an accounting engine. Not an advisory system.**

---

## ENFORCEMENT

- **CORE / OUT OF SCOPE / RISKY** module lists, recommended actions (DELETE, FREEZE, MOVE to `/experimental`), and safeguards: **[SCOPE_ENFORCEMENT_CTO.md](./SCOPE_ENFORCEMENT_CTO.md)**.
- Any code that wires LLM output to `period_trial_balance`, `close_adjustments`, or `journal_entries` insert/update **violates** this constitution.

---

*SOVEREIGN CPA ENGINE — purity and determinism.*
