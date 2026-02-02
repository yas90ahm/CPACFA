# Stage 0–Stage 3 Review vs CPA-to-CFO Roadmap

This document compares the current FinOS Agent codebase to the **CPA_to_CFO_Roadmap** plan (Stages 0–3 / Phase 0–1). It answers: *How are we looking? What can we upgrade?*

---

## Plan Reference (from roadmap)

| Stage | Plan name | Key deliverables |
|-------|-----------|------------------|
| **Stage 0** | Phase 0 — Foundation (Data & Compliance) | Ingestion core (bank/GL/AP/AR/payroll), CoA mapping, standard selection, data quality checks |
| **Stage 1** | Core Agent Infrastructure | LLM abstraction, tool schema, policy memory, guardrails (confidence, HITL) |
| **Stage 2** | CPA Statement Engine (Full Set) | Input normalization, BS + P&L + CF + Equity + Notes, standard-specific logic, evidence graph |
| **Stage 3** | CPA Controls & Auditability | Gap analysis, reconciliation loop, audit binder export, HITL workflow |

---

## Stage 0 — Foundation (Data & Compliance)

### Plan asks for

- **Ingestion core**: bank + GL + AP/AR + payroll parsers, OCR pipeline, data normalization.
- **Chart of Accounts mapping**: robust account classification + configurable templates.
- **Standard selection**: ASPE/IFRS/FRS102 tag on each entity and period.
- **Data quality checks**: balancing, duplicate detection, missing periods, outliers.

### Current status

| Item | Status | Where |
|------|--------|--------|
| **GL / Trial Balance** | ✅ Strong | `fileIngestion.ts` (CSV/XLSX), `trialBalanceParser.ts`, column mapping (account name, debit, credit, account code). |
| **Bank** | ⚠️ Partial | Bank flows via **ingestion agent** (classify as `bank_statement`), transaction extraction in frontend; no dedicated bank-only parser in `fileIngestion.ts`. |
| **AP/AR/Payroll** | ✅ Good | Ingestion agent classifies AP/AR/Payroll; canonical schema in `canonical_ap_ar_payroll.ts`; `ingestion_agent.ts` + `agentic_ingestion_classifier.ts` normalize to full fields + provenance. |
| **OCR pipeline** | ✅ Good | `ocr_service.ts` (retries, backoff); PDF/image in `ingestion_agent.ts` use it; pdf-parse fallback. |
| **CoA mapping** | ✅ Good | `accountClassifier.ts` (keyword + agentic `agentic_account_classifier.ts`); codification refs (ASC 210, IAS 1). Configurable templates: keyword list only, no UI/config file for custom CoA. |
| **Standard selection** | ✅ Good | `standard_selector.ts` (jurisdiction/currency/taxId) + policy memory; `standard_inference_agentic.ts` + UI confirmation for low confidence. |
| **Data quality — balancing** | ✅ Done | Trial balance validation in `trialBalanceParser`; Plan-Execute-Verify checks TB and BS balance. |
| **Duplicate detection** | ⚠️ Partial | `ingestion_pipeline.ts` has dedup (hash/cluster); not applied to TB/GL upload path. |
| **Missing periods** | ❌ Missing | No explicit “missing period” or period-coverage checks. |
| **Outliers** | ⚠️ Partial | Proactive advice has “spending anomaly” (outlier expenses); no TB/GL outlier checks (e.g. unusual amounts, Benford in CFA analyst only). |

### Stage 0 — Upgrade ideas

1. **Bank-first path**: Add a dedicated bank ingestion path (e.g. in `fileIngestion.ts` or a clear “bank statement” branch) that outputs a canonical transaction list so TB + cash flow can consume it consistently.
2. **CoA configurable templates**: Allow custom CoA mapping (e.g. JSON/config or UI) so verticals can override keyword → account type without code change.
3. **Duplicate detection on TB/GL**: Run the same (or a lighter) dedup logic on TB/GL upload (e.g. duplicate account+amount+date) and surface in quality checks.
4. **Missing-period check**: Add a small “period coverage” module: required periods per entity/standard; flag missing periods in quality checks or gap list.
5. **TB/GL outlier signal**: Optional outlier check (e.g. single-line amount > X% of total, or Benford) and feed into quality checks / agentic assessor.

---

## Stage 1 — Core Agent Infrastructure

### Plan asks for

- **LLM provider abstraction**: unify Anthropic/OpenAI/Mistral.
- **Prompt + tool schema**: standardize tool definitions and return formats.
- **Memory layer**: entity policy memory (standards, overrides, approvals).
- **Guardrails**: confidence scoring, auto-escalation to HITL.

### Current status

| Item | Status | Where |
|------|--------|--------|
| **LLM abstraction** | ✅ Done | `llm/provider.ts`: `getProviderFromEnv()`, `generateText()`; Anthropic/OpenAI/Mistral behind one interface. |
| **Tool schema** | ✅ Done | `llm/tool_schema.ts`; agent tools in `agents/tools/` (buildFinancialStatements, getDataGaps, leaseLiability, etc.) with Zod-style params. |
| **Policy memory** | ✅ Done | `memory/policy_memory.ts` (per entity: standard, country, jurisdiction, currency, taxId, businessNumber); `updatePolicyMemory`; API `POST /api/memory/entity`. |
| **Confidence scoring** | ✅ Done | Standard inference returns confidence; UI confirms when &lt; 0.8. Agentic assessor/quality returns severity. |
| **HITL auto-escalation** | ✅ Done | `hitl_orchestrator.ts`: thresholds (amount, critical policy change); staging area; webhook approve/reject; context memory for rejections. |

### Stage 1 — Upgrade ideas

1. **Tool registry as single source of truth**: Expose a single “tool registry” (e.g. list of tools with schema) so Supervisor/Orchestrator and docs stay in sync.
2. **Structured confidence on more outputs**: Extend confidence (or “completeness”) to statement generation (e.g. “TB only” vs “TB + bank” vs “full inputs”) for clearer UX.
3. **Policy memory versioning**: Optional version or history for entity policy (who changed standard when) for audit.

---

## Stage 2 — CPA Statement Engine (Full Set)

### Plan asks for

- **Input normalization**: bank + GL + AP/AR + payroll → canonical schema.
- **Statement generation**: BS, P&L, Cash Flow, Equity Changes, Notes/Policies.
- **Standard-specific logic**: ASPE/IFRS/FRS102 rules applied dynamically.
- **Evidence graph**: every line item points to source + standard citation.

### Current status

| Item | Status | Where |
|------|--------|--------|
| **Input normalization** | ✅ Good | GL → TB; AP/AR/Payroll → canonical types with provenance; bank → transactions (ingestion + frontend). |
| **Balance Sheet & P&L** | ✅ Done | `financialStatements.ts`, `statementGenerator.ts`; classification → BS + P&L. |
| **Cash Flow** | ✅ Done | `cashFlow.ts`: indirect from TB; `buildCashFlowFromTransactions` when transaction data; operating/investing/financing. |
| **Equity Changes** | ✅ Done | `equityChanges.ts`: opening, net income, dividends, closing. |
| **Notes & Policies** | ✅ Done | `notesPolicies.ts` from `standards_registry`; ASPE/IFRS/FRS102 (and US_GAAP placeholder) have principles + citations. |
| **Standard-specific logic** | ⚠️ Partial | ASPE: simplified depreciation. IFRS: lease liability (IFRS 16). FRS102: full registry + notes. US_GAAP: registry empty (no principles). |
| **Evidence graph** | ✅ Good | Line-level: `sourceDocumentId`, `sourceDocumentUrl`, `sourceSheet`, `sourceRowIndex`, `sourceChunkId`, reasoning ids; audit binder builds links. |

### Stage 2 — Upgrade ideas

1. **US GAAP registry**: Populate `US_GAAP_REGISTRY` with revenue, assets, leases, depreciation principles (e.g. ASC 606, ASC 842, ASC 360) so notes and citations are complete for all four standards.
2. **Standard-specific cash flow**: If a standard requires different CF presentation (e.g. interest/dividends), branch in `cashFlow.ts` by standard.
3. **FRS 102 / IFRS lease options**: Roadmap says FRS 102 “lease rules closer to IFRS light”; consider optional FRS 102 lease capitalization path (or explicit “no ROU” for SME).
4. **Revenue recognition hooks**: Registry has revenue principles; add an optional “revenue recognition” step (e.g. deferral rules by standard) when contract/transaction data exists.

---

## Stage 3 — CPA Controls & Auditability

### Plan asks for

- **Gap analysis**: missing liabilities, assets, identity.
- **Reconciliation loop**: debits=credits, BS + CF + Equity consistency.
- **Audit binder export**: reasoning chain + evidence links.
- **HITL workflow**: exceptions routed to user approval.

### Current status

| Item | Status | Where |
|------|--------|--------|
| **Gap analysis** | ✅ Done | `cpa_brain.ts`: missing liabilities, missing assets, missing identity, missing transactions; `agentic_gap_analyzer.ts` for LLM-driven anomalies. |
| **Reconciliation** | ✅ Done | `quality_checks.ts`: BS balance, cash line, CF tie to BS cash, equity tie, abnormal margin, negative equity; Plan-Execute-Verify. |
| **Audit binder** | ✅ Done | `audit_export_service.ts`: bundle BS/P&L + line-level links (source doc + reasoning); GAAP consistency report; `GET /api/audit/binder`. |
| **HITL workflow** | ✅ Done | Staging area, thresholds, webhook approve/reject, context memory; UI banner when escalated. |
| **“Urgent To-Dos”** | ✅ Done | Data gaps surfaced in API and UI (Compliance tab); quality checks + agentic assessment. |
| **Export PDF/CSV** | ✅ Done | `export_service.ts`, `pdf_export.ts`; export router. |

### Stage 3 — Upgrade ideas (implemented)

1. **Reconciliation report as artifact** ✅ — `GET/POST /api/audit/reconciliation-summary` returns a single reconciliation summary (TB balance, BS balance, CF tie, equity tie, list of checks and failed checks). See `reconciliation_summary_service.ts`.
2. **Gap → actionable tasks** ✅ — Data gaps are converted to actionable to-dos (`reconciliation_todos.ts`). `GET /api/audit/todos`, `POST /api/audit/todos/from-gaps`, `PATCH /api/audit/todos/:id` (status open/done). Trial balance ingest/statements auto-populate todos from gaps.
3. **Audit binder includes CF & Equity** ✅ — Binder now includes `cashFlowBundle` and `equityChangesBundle` with line-level evidence (same source doc + reasoning URL per line). See `audit_export_service.ts` and types in `audit.ts`.
4. **HITL “reason required” on reject** ✅ — `POST /api/hitl/webhook` requires `rejectionReason` when signal is `HumanRejected`; reason is stored on the staging item and in context memory for the feedback loop.

---

## Summary Table

| Stage | Overall | Gaps / risks | Top 2 upgrades |
|-------|---------|--------------|----------------|
| **0 – Foundation** | Solid for GL + AP/AR/Payroll + OCR; bank and data quality partial | Bank not first-class; missing periods; duplicates not on TB | Bank-first path; missing-period + TB duplicate checks |
| **1 – Core Agent** | Complete | Tool registry not formalized; no policy history | Tool registry; optional policy memory versioning |
| **2 – Statement Engine** | Full set done; evidence graph and standards good | US_GAAP empty; standard-specific CF/lease optional | Populate US_GAAP registry; optional revenue/lease branches per standard |
| **3 – Controls & Audit** | Complete | Reconciliation as one artifact; gap → task tracking | Reconciliation summary API; gap → actionable to-dos with status |

---

## Alignment with roadmap “Agentic” goals

- **Evidence-driven standard selection**: ✅ Inference + policy memory + UI confirm.
- **Dynamic rules (registry, not hard-coded if/else)**: ✅ Standards registry + statement/notes generation; lease/depreciation branches by standard.
- **Auditability (citation + confidence)**: ✅ Line-level provenance, codification refs, reasoning chain, audit binder.
- **Plan-Execute-Verify**: ✅ Implemented; can be extended with standard-specific verification steps.
- **Tool orchestration by evidence**: ✅ Supervisor/tools; lease tool when IFRS; getDataGaps; buildFinancialStatements.
- **HITL + memory**: ✅ Staging, thresholds, context memory for rejections, policy memory for entity.

Overall, **Stages 0–3 are largely in place** relative to the CPA-to-CFO roadmap. The main upgrade areas are: **Stage 0** (bank as first-class input, missing periods, duplicates/outliers on TB), **Stage 2** (US_GAAP registry, optional standard-specific CF/revenue/lease), and **Stage 3** (reconciliation summary, gap-to-task tracking, and binder coverage of CF/equity).
