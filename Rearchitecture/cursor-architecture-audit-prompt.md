# CURSOR PROMPT: Codebase Architecture Audit

## INSTRUCTION

You are performing a comprehensive architecture audit of this codebase. Your job is to map every file, function, component, and data model in this project against the target architecture defined below. You will produce a detailed gap analysis that tells me exactly what exists, what's missing, what's misaligned, and what needs to be refactored.

## HOW TO PROCEED

**Step 1: Full Codebase Scan**

First, read the ENTIRE codebase. Every file. Every directory. Do not skip anything. For each file, document:
- File path
- What it does (one sentence)
- Which architectural component it maps to (from the target architecture below)
- Whether it aligns, partially aligns, or does not align with the target

**Step 2: Produce the Audit Report**

Create a file called `ARCHITECTURE_AUDIT.md` in the project root with the following sections:

---

### SECTION 1: CODEBASE INVENTORY

List every file in the project organized by directory. For each file:
```
File: [path]
Purpose: [what it does]
Maps to: [target architecture component, or "NO MATCH"]
Status: [ALIGNED | PARTIAL | MISALIGNED | EXTRA]
Notes: [specific observations]
```

### SECTION 2: TARGET ARCHITECTURE COVERAGE

For each component in the target architecture, document what exists in the codebase:

#### 2.1 Close Orchestrator (State Machine)
- Target: State machine with states OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED
- Target: Transition gates enforced by validation checks
- Target: Period locking and reopening with audit trail
- What exists in codebase: [describe what you find]
- Gap: [what's missing or different]

#### 2.2 Ingestion Service
- Target: CSV/Excel trial balance import
- Target: Account matching to COA mapping
- Target: Structural validation (D=C, all accounts mapped, contra-type detection, period-over-period comparison)
- Target: Immutable TB snapshots with hash
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.3 Chart of Accounts and Mapping Layer
- Target: Account table with code, name, type, normal_balance
- Target: AccountMapping linking each account to a reporting line item
- Target: Cash flow classification per account (operating/investing/financing/non_cash/n_a)
- Target: Reporting taxonomy with line items organized by statement and section
- Target: Mapping versioning and audit trail
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.4 Reconciliation Service
- Target: Per-account reconciliation tracking (GL balance vs supporting balance)
- Target: Variance computed as a deterministic operation (GL − supporting)
- Target: Tolerance enforcement
- Target: Reconciling items management
- Target: Preparer/reviewer workflow
- Target: Hard gate — cannot certify until all required recons complete
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.5 Adjusting Entry Service
- Target: Three AJE types (recurring, correcting, non-recurring)
- Target: AJE templates for recurring entries
- Target: Debits = Credits enforcement on save
- Target: Required memo field
- Target: Approval workflow with configurable threshold
- Target: Linkage to original entry for correcting AJEs
- Target: Immutable once posted
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.6 Statement Generator
- Target: Deterministic generation of Income Statement from adjusted TB + mappings
- Target: Deterministic generation of Balance Sheet
- Target: Deterministic generation of Cash Flow Statement (indirect method)
- Target: Deterministic generation of Statement of Stockholders' Equity
- Target: All computation using Decimal.js or equivalent (NO native floating point for money)
- Target: Cross-statement integrity checks (A=L+E, net income ties, cash ties, CF completeness)
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.7 Validation Engine
- Target: Hard checks that block certification (D=C, A=L+E, mapping completeness, net income tie, cash tie, CF completeness, recon completeness, AJE completeness, variance explanations, reviewer approval)
- Target: Soft checks that warn (contra balances, flux thresholds, ratio anomalies, round numbers, duplicates)
- Target: Runs continuously after every state change (cascade principle)
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.8 HITL Issue Resolution System
- Target: Issue object with lifecycle (DETECTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED)
- Target: Severity levels (critical, blocking, warning, info)
- Target: Resolution types (aje_posted, mapping_corrected, re_ingested, reconciling_items_added, acknowledged_with_justification, classification_updated, escalated_and_resolved)
- Target: Issues auto-resolve when fixes address them (cascade)
- Target: New issues auto-created when changes trigger new problems
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.9 Certification Service
- Target: Pre-certification checklist (all hard checks must pass)
- Target: Certification record (who, when, hash, validation snapshot)
- Target: Immutable snapshot of entire close at certification
- Target: Period locking post-certification
- Target: Reopen workflow with authorization and documentation
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.10 AI Advisory Layer
- Target: AI has READ access to financial data, WRITE access ONLY to ai_* tables
- Target: AI never computes dollar amounts
- Target: AI never pre-populates financial input fields
- Target: AI functions: mapping suggestions, variance explanation drafts, anomaly detection, AJE suggestions (amounts as suggestions only, never auto-posted)
- Target: All AI output displayed in visually distinct UI containers
- What exists in codebase: [describe]
- CRITICAL CHECK: Is there ANY code path where AI-generated numbers flow into financial calculations? Document every instance.
- Gap: [what's missing or misaligned]

#### 2.11 Audit Log
- Target: Append-only log of every action (AJE posted, recon approved, mapping changed, period certified, period reopened)
- Target: Records user, timestamp, action, target, before_state, after_state
- Target: Never modified or deleted
- What exists in codebase: [describe]
- Gap: [what's missing]

#### 2.12 Data Model
- Target: Organization → Entities → ChartOfAccounts → Accounts → AccountMapping
- Target: ClosePeriods → TB Snapshots, AJEs, Reconciliations, Statements, Variance Analysis, Validation Results, Issues, Certification Record
- Target: Separate ai_* tables for all AI output
- Target: Decimal precision for all money fields (DECIMAL(15,2) or equivalent)
- What exists in codebase: [describe the actual schema/models]
- Gap: [what's different]

#### 2.13 Decimal Precision
- Target: All money calculations use Decimal.js or equivalent
- Target: No native JavaScript floating-point for any dollar amount
- CRITICAL CHECK: Search the entire codebase for any arithmetic on money values using native JS (+, -, *, /). Document every instance. This is a critical architectural violation if found.

### SECTION 3: CRITICAL VIOLATIONS

List any code that violates these non-negotiable architectural rules:

1. **AI computes dollar amounts** — Any code where an AI model output is used in a financial calculation
2. **AI writes to financial tables** — Any code where AI output is stored in a non-ai_* table
3. **AI pre-populates financial fields** — Any UI where an AI-generated number auto-fills a financial input
4. **Native floating-point for money** — Any arithmetic on dollar amounts not using Decimal.js
5. **Uncertified statement access** — Any path where financial statements can be exported or shared without passing all hard validation checks
6. **Missing audit trail** — Any state change to financial data that is not logged

For each violation found, provide:
- File path and line numbers
- What the violation is
- What it should be instead
- Severity (CRITICAL / HIGH / MEDIUM)

### SECTION 4: WHAT EXISTS BUT ISN'T IN THE TARGET ARCHITECTURE

List anything in the codebase that doesn't map to any component in the target architecture. For each:
- What it is
- Whether it should be kept, refactored, or removed
- If kept, where it fits in the target architecture

### SECTION 5: PRIORITY REFACTORING ROADMAP

Based on the gaps found, create a prioritized list of changes needed:

**P0 — Critical (fix immediately, architectural violations):**
[list items]

**P1 — Core functionality gaps (needed for the product to work as designed):**
[list items]

**P2 — Important but can ship without (needed before production):**
[list items]

**P3 — Nice to have (post-launch):**
[list items]

For each item, estimate:
- Complexity: Low / Medium / High
- Dependencies: What must be built first
- Files affected: Which existing files need to change

### SECTION 6: REFACTORING ORDER

Given the dependencies between components, what is the correct ORDER to refactor? Number each step and explain why it must come in that order.

---

## TARGET ARCHITECTURE REFERENCE

The following is the complete target architecture for the Sovereign CPA Engine. Every component, data model, and principle described below is what the codebase should align to.

### SYSTEM DEFINITION

A financial close infrastructure that ingests GL data and produces certified, auditor-ready financial statements. Replaces the manual Excel-based close process for PE-backed mid-market companies.

### FUNDAMENTAL CONSTRAINT: AI NEVER TOUCHES NUMBERS

Two type systems, enforced at database, API, and UI layers:

**Deterministic Values:** Computed by arithmetic functions or sourced from GL import. Stored in financial tables. Used in TB, statements, recons, AJEs. Participate in certification. Every number traceable to source through deterministic chain.

**Advisory Values:** Generated by AI. Stored in separate ai_* tables. Never used as input to computation. Never appear on financial statements. Always displayed in visually distinct UI. Exist only to help humans work faster.

These types never cross. No code path where AI-generated number flows into financial calculation.

### THE HANDOFF PATTERN (wherever AI assists)
1. AI suggests → writes to ai_* table only
2. Human reviews → sees suggestion displayed separately
3. Human enters/confirms → types or explicitly approves the value
4. Deterministic processing → system computes downstream effects

### THE CASCADE PRINCIPLE
Every correction ripples instantly:
AJE posted → adjusted TB recalculates → affected recons recalculate → statements marked stale → validation re-runs → dashboard updates → issues auto-resolve or new issues created

### CLOSE FLOW — SIX PHASES

**Phase 0: Pre-Close** — Lock subledgers, lock GL, extract TB
**Phase 1: Ingest & Validate** — Parse TB, map accounts, structural validation, snapshot
**Phase 2: Reconciliation** — GL vs supporting balance per account, tolerance enforcement, reconciling items
**Phase 3: Adjusting Entries** — Recurring (system-proposed), correcting, non-recurring. All require D=C, memo, preparer, approval workflow
**Phase 4: Statement Generation** — Deterministic. IS, BS, CF (indirect), Equity. Cross-statement integrity checks. Hard stop if any check fails.
**Phase 5: Review & Variance Analysis** — Flux analysis, AI-drafted explanations (human-reviewed), ratio analysis, senior reviewer sign-off
**Phase 6: Certification & Lock** — Pre-check all hard validations, certify with hash, immutable snapshot, lock period

### STATE MACHINE
```
OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED
```
Each transition gated by specific requirements. System shows exactly what's missing if transition is blocked.

### HITL ISSUE RESOLUTION
Every detected problem is a first-class Issue object:
- Lifecycle: DETECTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED
- Severity: critical / blocking / warning / info
- Resolution happens within the system (inline AJE creation, mapping correction, etc.)
- Issues auto-resolve when fixes address them
- New issues auto-created when changes trigger new problems

### VALIDATION ENGINE
**Hard checks (block certification):** D=C, A=L+E, mapping completeness, net income ties, cash ties, CF completeness, retained earnings tie, recon completeness, AJE completeness, variance explanations, reviewer approval

**Soft checks (warnings):** Contra balances, flux thresholds, ratio anomalies, round numbers, duplicates, unapproved AJEs, thin explanations

### STATEMENT GENERATOR — DETERMINISTIC CORE
Pure arithmetic functions using Decimal.js:
- sumBalances, computeVariance, validateDebitsEqualCredits, checkBalanceSheetEquation
- computeAccountChange, computeCashFlowImpact, aggregateToLineItem, computeSubtotal
- reconciliationVariance (computed column in DB)

~200 lines of actual computation code. No AI. No estimation. No floating-point.

### DATA MODEL
```
Organization → Entities → ChartOfAccounts → Accounts → AccountMapping
ClosePeriods → TB Snapshots, AJEs, Reconciliations, Statements,
               VarianceAnalysis, ValidationResults, Issues, CertificationRecord
AJETemplates (recurring, persist across periods)
ReportingTaxonomy → ReportingLineItems

Separate: ai_mapping_suggestions, ai_variance_explanations,
          ai_aje_suggestions, ai_anomaly_flags

Append-only: AuditLog
```

### AI BOUNDARIES (PRECISE)
**Can do:** Suggest COA mappings, draft variance explanations (using pre-computed numbers as input, never computing), detect anomalies (output text only), suggest AJEs (never auto-post), predict close timelines, answer natural language queries

**Cannot do:** Compute any dollar amount, post any entry, modify any TB, generate any statement line item, pre-populate any financial input field, participate in certification, write to any financial table

### TECH STACK
Next.js + React + Tailwind, PostgreSQL, Decimal.js, S3, Clerk/Auth0, Puppeteer/react-pdf, Anthropic API (advisory only), Zod, SHA-256, SheetJS

---

## OUTPUT FORMAT

Produce the `ARCHITECTURE_AUDIT.md` file with all six sections fully completed. Be exhaustive. Do not summarize or skip files. Every file in the codebase must appear in the inventory. Every gap must be documented. Every violation must be flagged with file path and line numbers.

When you're done with the audit file, give me a brief verbal summary of the top 5 most critical findings.
