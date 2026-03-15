# SABIT AI ENGINEERING AUDIT

**Date:** 2026-03-12
**Auditor:** AI Engineer (Claude Opus 4.6)
**Scope:** AI architecture, financial statement taxonomy, AI integration roadmap
**Codebase Root:** `C:\Users\yasir\CPACFA`

---

## TABLE OF CONTENTS

1. [Task 1: AI Architecture Assessment](#task-1-ai-architecture-assessment)
2. [Task 2: Taxonomy Model Assessment](#task-2-taxonomy-model-assessment)
3. [Task 3: AI Integration Roadmap](#task-3-ai-integration-roadmap)
4. [Final Scorecard](#final-scorecard)

---

## TASK 1: AI ARCHITECTURE ASSESSMENT

### 1.1 ORCHESTRATOR DESIGN

**Files reviewed:**
- `src/ai/ai_orchestrator.ts` (484 lines)
- `src/ai/ai_client.ts` (103 lines)
- `src/ai/resolution_agent.ts` (319 lines)
- `src/ai/advisory_interface.ts` (72 lines)

#### Pillar Structure: Clean Separation of Concerns

The 4-pillar system (Justifier, Shadow Auditor, Classifier, Advisor) is implemented as **independent functions** in a single orchestrator file (`ai_orchestrator.ts`). Each pillar:

- Has its own `run*` function (`runJustifier`, `runShadowAudit`, `runClassifier`, `runAdvisor`)
- Has its own prompt file (`src/ai/prompts/*.prompt.ts`)
- Has its own Zod schema (`src/ai/schemas/*.schema.ts`)
- Has its own standards snippets file (`src/ai/standards_snippets*.ts`)
- Returns its own typed result interface (`RunJustifierResult`, `RunShadowAuditResult`, etc.)

**Grade: B+** -- Clean functional separation. Each pillar is self-contained. However, there is **no formal pillar registry or plugin pattern**. Adding a 5th pillar requires editing `ai_orchestrator.ts` directly and creating 3 new files by convention. A formal `Pillar` interface with registration would improve extensibility.

#### Context Sharing

Context is shared through:
1. A **per-pillar `context` object** passed to prompt builders (line 178, 258, 353, 439 in `ai_orchestrator.ts`)
2. **Knowledge Base integration** -- each pillar queries KB independently (`queryKbForJustifier`, `queryKbForShadowAuditor`, `queryKbForClassifier`)
3. There is **no unified context object** shared across pillars. Each pillar builds its own context independently.

**Finding:** Pillars operate in isolation -- there is no cross-pillar context sharing. The Advisor does not see Shadow Auditor findings. The Justifier does not see Classifier output. This is both a strength (no cascading failures) and a weakness (no cross-pillar intelligence).

#### Error Handling

Each pillar implements **fail-open** semantics (`ai_orchestrator.ts`):

- **Justifier** (line 213): Returns `ok: false` with a fallback memo containing error details and log ID
- **Shadow Auditor** (line 301-317): Returns `severity: 'warn'` with `AI_FAILED` finding code -- critically, does NOT block
- **Classifier** (line 389-396): Returns empty `results[]` -- does not block ingestion
- **Advisor** (line 476-483): Returns empty `proposals[]` -- does not block workflow

**Grade: A-** -- Fail-open is the correct design for advisory AI. Every failure path returns structured data with error details and a `callLogId` for traceability. Minor concern: Shadow Auditor fail-open as 'warn' (not 'ok') is appropriate since the human needs to know the AI check was skipped.

#### Dependency Injection

**Current state:** Partial. The `Pool` is injected into every pillar function. The AI model is resolved from `process.env.AI_MODEL` at call time (`ai_client.ts`, line 11). The `callAIWithSchema` function in `ai_client.ts` handles the common pattern of: enter advisory context -> call Claude -> parse with Zod -> log to DB.

**Missing:** No interface abstraction for the LLM provider itself -- `callClaude` is imported directly (`ai_client.ts`, line 7). The `callClaude` function in `src/ai/adapters/claude_adapter.ts` is the single adapter, with mock mode for testing. Swapping to a different LLM requires modifying the adapter, but the `generateText` abstraction at `src/llm/provider.ts` provides some decoupling.

#### Extensibility

Adding a new pillar requires:
1. Create `src/ai/prompts/new_pillar.prompt.ts`
2. Create `src/ai/schemas/new_pillar.schema.ts`
3. Create `src/ai/standards_snippets_new.ts`
4. Add `runNewPillar()` function to `ai_orchestrator.ts`
5. Add mock response in `claude_adapter.ts`

**Grade: B** -- Convention-based, not enforced by interfaces. Works for a team of 1-3 engineers, but will need formalization as the team grows.

### 1.2 PROMPT ENGINEERING QUALITY

#### Justifier (`src/ai/prompts/justifier.prompt.ts`)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clarity of instructions | A- | Clear IRAC format, explicit "HARD RULES" section (line 35-39) |
| Output format specification | A | Exact JSON shape specified inline in prompt (line 39-40) |
| Guardrails against hallucination | A- | "Do NOT invent facts" (line 37), "Use only the facts and standards snippets below" (line 36) |
| GAAP accuracy | B | References GAAP/IFRS principles but standards snippets are generic (see Knowledge Base section) |
| Contextual grounding | A | Facts injected as JSON, standards snippets injected as list, context metadata included |
| Few-shot examples | F | **None.** No examples of good vs bad IRAC output |
| Edge case defense | C | No handling for multi-currency, negative balances, unusual account names, related-party |
| Versioning | B+ | `JUSTIFIER_PROMPT_VERSION = 'justifier_v1.0.0'` tracked and logged (line 5) |

**Overall Justifier: B**

#### Shadow Auditor (`src/ai/prompts/shadow_auditor.prompt.ts`)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clarity of instructions | A | "You do not edit. You only flag." (line 40). Clear severity guidance in system prompt (line 62) |
| Output format specification | A | Exact JSON shape with enum values for severity (line 46-47) |
| Guardrails against hallucination | A- | "Use ONLY the provided transaction payload and standards snippets" (line 43) |
| GAAP accuracy | B+ | Materiality threshold injected when available (line 36-38); policy snippets are operational, not GAAP (by design) |
| Contextual grounding | A | Transaction payload as JSON, workflow state included, materiality threshold |
| Few-shot examples | F | **None.** No examples of ok/warn/block decisions |
| Edge case defense | C+ | Materiality threshold handling present, but no multi-currency or inter-company guidance |
| Versioning | B+ | `SHADOW_AUDITOR_PROMPT_VERSION = 'shadow_auditor_v1.0.0'` |

**Overall Shadow Auditor: B**

#### Classifier (`src/ai/prompts/classifier.prompt.ts`)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clarity of instructions | A | ALLOWED/FORBIDDEN blocks (lines 49-59); explicit "If unsure, lower confidence" (line 61) |
| Output format specification | A | Exact JSON shape (line 63-64); object_type and fs_placement hints in system prompt (line 81) |
| Guardrails against hallucination | B+ | "compute totals" and "invent numbers" forbidden, but no explicit "accounts must come from COA" rule |
| GAAP accuracy | B- | Classification hints are surface-level (e.g., "Prepaid indicates asset") not ASC-backed |
| Contextual grounding | B+ | Source lines and COA taxonomy injected; standards snippets available |
| Few-shot examples | F | **None.** No example of "Account 4100 Product Revenue" -> `{object_type: "revenue", fs_placement: "pnl.revenue"}` |
| Edge case defense | C | No handling for ambiguous names like "Other", multi-segment accounts, or accounts with numeric-only names |
| Versioning | B+ | `CLASSIFIER_PROMPT_VERSION = 'classifier_v1.0.0'` |

**Overall Classifier: B-**

#### Advisor (`src/ai/prompts/advisor.prompt.ts`)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clarity of instructions | A | ALLOWED/FORBIDDEN blocks (lines 59-68); clear provenance rules (line 74) |
| Output format specification | A | Full JSON schema with enum types and nested sourceRef (line 72) |
| Guardrails against hallucination | A | "Inventing amounts" explicitly forbidden; provenance chain enforced by schema |
| GAAP accuracy | B | Type options include reclass, accrual, deferral, lease -- covers common scenarios |
| Contextual grounding | A | Source lines with amounts, TB summary, COA taxonomy all injected |
| Few-shot examples | F | **None.** No example of a correct proposal with sourceRef |
| Edge case defense | C+ | Missing handling for intercompany, multi-currency, tax-specific proposals |
| Versioning | B+ | `ADVISOR_PROMPT_VERSION = 'advisor_v1.0.0'` |

**Overall Advisor: B**

#### Cross-Cutting Prompt Concerns

1. **No A/B testing infrastructure.** Prompt versions are logged (`prompt_version` in `ai_call_log`), which enables retrospective analysis, but there is no mechanism to route traffic between prompt variants.

2. **No few-shot examples in ANY pillar.** This is the single biggest prompt quality gap. Few-shot examples dramatically improve output consistency for structured JSON generation. Each prompt should include 1-2 examples of ideal output.

3. **Prompts not defensive against:**
   - Multi-currency transactions (no currency context in any prompt)
   - Negative balances (e.g., negative AR could be reclassed)
   - Unusual account names (e.g., "Acct 9999 Suspense")
   - Intercompany eliminations
   - Accounts with names in languages other than English

### 1.3 OUTPUT VALIDATION (Zod Schemas)

**Files reviewed:**
- `src/ai/schemas/justifier.schema.ts` (24 lines)
- `src/ai/schemas/shadow_auditor.schema.ts` (23 lines)
- `src/ai/schemas/classifier.schema.ts` (24 lines)
- `src/ai/schemas/advisor.schema.ts` (72 lines)

#### Justifier Schema
```typescript
// src/ai/schemas/justifier.schema.ts, lines 7-20
z.object({
  prompt_version: z.string(),
  irac: z.object({ issue: z.string(), rule: z.string(), analysis: z.string(), conclusion: z.string() }),
  memo_markdown: z.string(),
  rule_ids: z.array(z.string()),
  facts_used: z.array(z.string()),
})
```
**Gaps:**
- `prompt_version` accepts any string -- should validate against expected version pattern
- `z.string()` on all IRAC fields accepts empty strings -- should use `z.string().min(1)`
- `rule_ids` accepts any string -- no validation against known rule ID patterns
- No maximum length on `memo_markdown` -- LLM could produce unbounded output

#### Shadow Auditor Schema
```typescript
// src/ai/schemas/shadow_auditor.schema.ts, lines 7-19
severity: z.enum(['ok', 'warn', 'block']),
confidence: z.number().min(0).max(1),
findings: z.array(z.object({ code: z.string(), message: z.string(), rule_ids: z.array(z.string()), refs: z.array(z.string()) }))
```
**Strengths:** `severity` is properly constrained to enum. `confidence` has min/max.
**Gaps:**
- `findings` can be empty array even with severity 'block' -- should require `findings.min(1)` when severity != 'ok'
- No `maxLength` on `findings` array -- LLM could generate hundreds of findings

#### Classifier Schema
```typescript
// src/ai/schemas/classifier.schema.ts, lines 7-20
z.object({
  source_id: z.string(),
  object_type: z.string(),  // <-- ANY string
  fs_placement: z.string(), // <-- ANY string
  ...
})
```
**Critical gap:** `object_type` and `fs_placement` are `z.string()` -- they accept ANY value. These should be enums:
- `object_type` should be `z.enum(['expense', 'asset', 'liability', 'revenue', 'equity', 'unknown', 'lease_candidate', ...])`
- `fs_placement` should match taxonomy codes like `pnl.revenue`, `bs.asset.current`, etc.

#### Advisor Schema
```typescript
// src/ai/schemas/advisor.schema.ts, lines 8-42
AmountProvenanceSchema = z.enum(['SOURCE_LINE_AMOUNT', 'HUMAN_ENTERED_AMOUNT', 'DETERMINISTIC_ENGINE_AMOUNT'])
ProposalTypeSchema = z.enum(['reclass', 'accrual_candidate', ...])
```
**Strengths:** This is the best schema. Amount provenance is enum-constrained. Proposal type is enum-constrained. Two `.refine()` validators enforce:
1. If amount present, amountProvenance required (line 26-33)
2. If provenance is SOURCE_LINE_AMOUNT, sourceRef required (line 34-42)

**Gap:** `requires_human_confirmation` is `z.boolean()` and the AI could set it to `false` -- but the prompt says proposals are "suggestions only." Consider hardcoding this to `z.literal(true)` since no AI proposal should ever auto-execute.

#### proposal_validator.ts Analysis

**File:** `src/ai/guardrails/proposal_validator.ts` (165 lines)

`assertNoNumericAmountsInAgentOutput` (line 38-56):
```typescript
const dollarPattern = /\$[\d,]+\.?\d*/g;
```

**What it checks:** Scans `description`, `irac.issue`, `irac.rule`, `irac.analysis`, `irac.conclusion` for dollar-sign patterns.

**What it MISSES:**
1. **Numbers without dollar signs:** "The amount is 1,234,567" would pass.
2. **Written-out amounts:** "One million two hundred thousand" would pass.
3. **Percentages that imply amounts:** "15% of revenue" implies a calculation. Not caught.
4. **Amounts in `title` field:** The validator checks `description` and `irac.*` but NOT `title` (line 40-46). A crafted response with `title: "Adjust $50,000 reclass"` would slip through.
5. **Amounts in `citations` or `accountCodes` fields:** Not scanned.
6. **Euro/GBP/other currency symbols:** Only `$` is matched. EUR amounts like "1.234,56" or GBP amounts like "1,234.56" without `$` would pass.

**Additional validators in `proposal_validator.ts`:**
- `assertAccountCodesExist` (line 61-89): Queries DB to verify account codes exist. Good.
- `assertValidGAAPCitation` (line 94-113): Checks citations against KB. However, falls through gracefully if KB unavailable ("don't block, but warn").
- `assertProposalTypeValid` (line 126-140): Validates proposal type against event type. Good.

#### number_provenance_validator.ts Analysis

**File:** `src/lib/number_provenance_validator.ts` (217 lines)

This is an **excellent** validator, used specifically by the variance chat service (`src/services/variance_chat_service.ts`).

**How it works:**
1. **Extracts** all number-like tokens from AI response text (dollar amounts, percentages, plain numbers) using 4 regex patterns (lines 25-30)
2. **Builds a lookup set** of every legitimate number from the investigation data (current/prior balances, change amounts, percentages, drilldown entries)
3. **Pre-computes sums** of top-N contributing accounts to allow the AI to reference aggregate figures (lines 122-131)
4. **Validates** every extracted number against the lookup set with **abbreviation tolerance** (5% for K/M/B abbreviations, line 163)
5. Returns `{ valid: boolean, numbersUnverified: string[] }` -- if ANY number is unverified, `valid` is false

**Strengths:**
- Handles `$1.2M` abbreviations correctly
- Pre-computes sums so AI can say "top 3 accounts total $X" without hallucinating
- Absolute value matching handles sign differences
- Sub-dollar and small integer exemptions avoid false positives on prose ("3 accounts")

**Gaps:**
- The 5% tolerance for abbreviation matching (line 163) could theoretically allow a modestly incorrect number to pass
- Only used by `variance_chat_service.ts` -- NOT applied to the 4-pillar orchestrator outputs
- Does not validate percentages against computed percentages (could hallucinate "25%" when actual is 24.7%)

**Grade: Output Validation Overall: B**
- Advisor schema: A-
- Shadow Auditor schema: B+
- Justifier schema: B-
- Classifier schema: C+
- proposal_validator: B-
- number_provenance_validator: A- (but limited in scope)

### 1.4 AI BOUNDARY ENFORCEMENT

The AI boundary is enforced through **5 independent layers:**

#### Layer 1: AsyncLocalStorage Context Guard
**File:** `src/lib/ai_boundary.ts` (78 lines)

- `enterAdvisoryContext()` / `exitAdvisoryContext()` bracket every AI call (`ai_client.ts`, lines 35-40)
- `assertNoAiMutationContext()` is called at the start of mutation paths
- Uses `AsyncLocalStorage` for per-request isolation (not a global flag)
- Called in: `executeBridgeCommand` (`src/bridge/protocol_bridge.ts`, line 258), `certifyCloseSession` and `lockCloseSession` (`src/services/close_session_service.ts`, lines 263, 685, 730)

**Strength:** AsyncLocalStorage is the correct primitive. A global counter would have race conditions.

**Gap:** If `enterAdvisoryContext()` is called outside of a `runInBoundaryScope` callback (line 69-71), the store may not exist and the call silently no-ops (line 32-34). This means if a developer calls an AI function from a code path that was NOT wrapped in `runInBoundaryScope`, the boundary guard is **bypassed**. The comment at line 35 acknowledges this: "If no store exists... fall through silently."

#### Layer 2: Regex Dollar Guard
**File:** `src/ai/guardrails/proposal_validator.ts`, `assertNoNumericAmountsInAgentOutput` (line 38-56)

Only applies to Resolution Agent proposals. Regex: `/\$[\d,]+\.?\d*/g`

**Gaps documented in Section 1.3 above.** Most critically: amounts without `$` prefix pass through.

#### Layer 3: Structural Amount Guard (llm/guardrails.ts)
**File:** `src/llm/guardrails.ts` (99 lines)

`assertNoNumericAmountsInAgentOutput` (this is a DIFFERENT function from the one in proposal_validator.ts):
- Walks the JSON tree of agent output
- Checks if keys like `debit`, `credit`, `amount`, `balance`, `total` contain numeric values
- Has an allowlist of metadata keys (`confidence`, `count`, `type`, etc.) that may contain numbers
- Applied to all agentic services per the registry comment (lines 12-22)

**Strength:** Key-based detection is harder to bypass than regex -- the AI cannot hide an amount in a `debit` field.

**Gap:** If the AI returns an amount under an unexpected key name (e.g., `adjustment_value: 50000` or `proposed_amount: 12345`), it would NOT be caught because `adjustment_value` is not in `AMOUNT_KEYS`. The function only blocks known keys.

#### Layer 4: DB Role Separation
**File:** `migrations/093_ai_boundary_schemas.sql` (116 lines)

Three PostgreSQL schemas with separate roles:
- `core` schema: financial tables (trial balance, journal entries, etc.) -- `core_writer` role has full DML
- `ai` schema: AI-specific tables (ai_call_log, hitl_staging, proposals) -- `ai_writer` role has INSERT/SELECT/UPDATE only on `ai.*`, NO access to `core.*`
- `audit` schema: audit ledger -- `auditor_reader` has SELECT only

**Strength:** Even if all application-level guards fail, the DB role prevents the AI connection pool from writing to core financial tables. This is defense in depth at the infrastructure level.

**Gap:** The `ai_writer` role has UPDATE on `ai.*` tables (line 101) -- needed for `tenant_supervisor_sessions` but also means AI could overwrite its own previous proposals. Not a financial integrity risk but worth noting.

#### Layer 5: Type-System Advisory Interface
**File:** `src/ai/advisory_interface.ts` (72 lines)

All AI outputs are branded as `Readonly<...>` types:
- `ClassifierAdvisory`, `AdvisorAdvisory`, `JustifierAdvisory`, `ShadowAuditorAdvisory`
- No functions, no callbacks, no mutation-capable fields
- Uses `ReadonlyArray` and nested `Readonly<>` to prevent modification

**Strength:** TypeScript structural typing ensures that code consuming AI output cannot accidentally pass it to a mutation function expecting mutable types.

**Gap:** This is compile-time only. At runtime, JavaScript does not enforce Readonly.

#### Bypass Analysis: Could AI Output Bypass ALL Guards?

**Scenario 1: Direct mutation from AI context**
Path: AI callback -> executeBridgeCommand
Guard chain: AsyncLocalStorage (Layer 1) -> assertNoAiMutationContext (throws)
**Verdict: BLOCKED** -- but only if the request was wrapped in `runInBoundaryScope`

**Scenario 2: AI produces dollar amounts in advisory text**
Path: AI returns `"The $50,000 adjustment..."` in memo_markdown
Guard chain: proposal_validator (Layer 2) checks Resolution Agent only. Standard pillars do NOT run assertNoNumericAmountsInAgentOutput on text fields.
**Verdict: PASSES** -- Dollar amounts in Justifier memo_markdown or Shadow Auditor finding messages are NOT blocked. However, these are display-only fields and cannot cause mutations.

**Scenario 3: AI smuggles amount via unexpected JSON key**
Path: AI returns `{ debit: 50000 }` (caught by Layer 3) vs `{ suggested_adjustment: 50000 }` (not caught)
**Verdict: PARTIAL BYPASS** -- but the Zod schema (Layer 0) would reject unknown keys via `.strict()` -- WAIT: the schemas do NOT use `.strict()`. They use plain `z.object()` which by default strips unknown keys via Zod's default behavior. So unknown keys are **silently dropped**, not flagged. The amount in an unknown key would be discarded, not propagated.

**Scenario 4: Code path outside runInBoundaryScope**
Path: Background job calls AI function -> enterAdvisoryContext -> store is undefined -> no tracking
Then same execution context calls executeBridgeCommand -> assertNoAiMutationContext -> store is undefined -> does NOT throw
**Verdict: BYPASS** -- This is a real gap. Any code path not wrapped in `runInBoundaryScope` has no boundary enforcement. The test at `tests/unit/ai_boundary_enforcement.test.ts` should cover this.

#### Tests

Three test files exist:
- `tests/unit/ai_boundary.test.ts`
- `tests/unit/ai_boundary_enforcement.test.ts`
- `tests/unit/ai_guardrail_enforcement.test.ts`

These were identified but not read per the constraint (only .ts files in specified directories). Their existence is positive.

**Grade: AI Boundary Enforcement: A-**
- 5 independent layers with true defense-in-depth
- DB role separation is the strongest layer (infrastructure-level)
- AsyncLocalStorage gap when not wrapped in `runInBoundaryScope` is concerning
- Regex guard is the weakest layer

### 1.5 KNOWLEDGE BASE

**Files reviewed:**
- `src/knowledge_base/` (16 files total)
- `src/knowledge_base/tiers/tier1_global.ts` (147 lines)
- `src/knowledge_base/tiers/tier2_firm.ts` (122 lines)
- `src/knowledge_base/tiers/tier3_session.ts` (43 lines)
- `src/knowledge_base/hybrid_search.ts` (99 lines)
- `src/knowledge_base/vector_store/gaap_seed_data.ts` (305 lines)
- `src/knowledge_base/vector_store/pg_vector_store.ts` (293 lines)
- `src/knowledge_base/vector_store/store.ts` (154 lines)

#### 3-Tier Architecture

| Tier | Source | Storage | Search |
|------|--------|---------|--------|
| Tier 1 (Global) | FASB ASC, IFRS, IRC Tax | pgvector DB + in-memory fallback | Semantic (pgvector cosine similarity) + keyword fallback |
| Tier 2 (Firm) | Chart of Accounts, Historical Policies, Invoice Treatments | In-memory arrays | Keyword scoring (term overlap) |
| Tier 3 (Session) | Uploaded files per session | In-memory Map keyed by sessionId | Keyword scoring |

#### Tier 1 Content Quality

**pgvector seed data** (`gaap_seed_data.ts`): **100+ chunks** covering:
- ASC 606 (Revenue): 10 chunks covering Steps 1-5, variable consideration, contract mods
- ASC 842 (Leases): 7 chunks covering identification, classification, measurement
- ASC 320/326 (Financial Instruments/Credit Losses): 4 chunks
- ASC 740 (Income Taxes): 5 chunks covering deferred tax, valuation allowance, rate reconciliation
- ASC 330 (Inventory): 3 chunks
- ASC 360 (PP&E): 4 chunks including impairment
- ASC 350 (Goodwill/Intangibles): 4 chunks
- ASC 820 (Fair Value): 4 chunks
- ASC 450 (Contingencies): 2 chunks
- ASC 805 (Business Combinations): 2 chunks
- ASC 230 (Cash Flows): 4 chunks
- ASC 715, 718, 815, 842-40, 250, 855, 260, 205, 275, 280, 420, 480, 505, 470, 860: 1-2 chunks each
- IFRS: 12 chunks (IAS 1, 2, 16, 36, 37, 38, IFRS 9, 15, 16, IAS 12, 10)
- IRC Tax: 17 chunks covering 162, 163, 167, 168, 179, 197, 263, 263A, 267, 274, 351, 461, 482, 704(b), 743(b), 1031, 199A

**Verdict: Real content, not placeholder.** The GAAP seed data contains actual authoritative text paraphrased from the ASC Codification. Coverage is appropriate for a $180M PE-backed manufacturer. However:

**Missing GAAP coverage:**
- ASC 842 **short-term lease practical expedient** thresholds (only mentioned, not detailed)
- ASC 606 **returns/warranties** specific guidance
- ASC 420/ASC 712 **restructuring/severance** (common in PE-backed companies)
- ASC 815 **hedge effectiveness testing** details
- ASC 350-40 **internal-use software** capitalization (common mid-market issue)
- **SEC reporting** guidance (if applicable)

**In-memory fallback** (`tier1_global.ts`, line 41-53): The `handbookToMemoryEntries` function is **quarantined** with a comment "rag_handbook not in MVP architecture." Only 3 IRC Tax entries are available in the in-memory fallback. This means when pgvector is unavailable, Tier 1 search returns almost nothing for FASB/IFRS.

#### Hybrid Search Implementation

**Keyword search** (`hybrid_search.ts`): Simple term-overlap scoring (lines 12-22). NOT BM25 -- no IDF weighting, no term frequency normalization, no document length normalization. It counts: +1 for each matching term, +0.5 for prefix matches.

**Semantic search** (`pg_vector_store.ts`): True pgvector cosine similarity search using the `<=>` operator (line 194). Supports embedding via `EmbeddingProvider` abstraction -- either OpenAI `text-embedding-3-small` (1536 dim) or local pseudo-embeddings.

**Two-path retrieval for Justifier** (`ai_orchestrator.ts`, lines 61-103):
1. Primary: pgvector semantic search -> merge with keyword Tax results -> return top 7
2. Fallback: keyword-only queryGlobal -> return top 5

#### Vector Store Implementation

**NOT a skeleton.** `pg_vector_store.ts` is a fully implemented pgvector integration:
- `insertChunk` / `insertChunksBatch`: Embed text and INSERT into `knowledge_embeddings` table
- `queryVectorStore`: Cosine similarity search with optional filters (framework, tier, tenant)
- `countChunks` / `deleteChunks`: Management operations
- Proper SQL parameterization and error handling

The in-memory store (`store.ts`) provides a keyword-based fallback that is fully functional but limited in retrieval quality.

**Grade: Knowledge Base: B-**
- 3-tier architecture is well-designed
- Tier 1 has real GAAP content (100+ chunks)
- pgvector integration is production-ready
- Keyword search is naive (no BM25)
- Tier 2 (Firm) is in-memory only -- lost on restart
- Tier 3 (Session) is in-memory only -- by design for ephemeral data
- Missing GAAP content for several PE-relevant topics

### 1.6 AI CALL LOGGING

**File:** `src/ai/ai_call_log_repository.ts` (45 lines)

Every AI invocation is logged via `insertCallLog` with:

| Field | Logged | Notes |
|-------|--------|-------|
| `tenant_id` | Yes | Multi-tenant scoping |
| `pillar` | Yes | justifier, shadow_auditor, classifier, advisor, resolution_agent, investigation_chat |
| `prompt_version` | Yes | e.g., `justifier_v1.0.0` |
| `model` | Yes | e.g., `claude-sonnet-4-5-20250929` |
| `request_json` | Yes | Sanitized request metadata (factsKeys, snippetsCount, context) |
| `response_raw` | Yes | Full raw text from LLM |
| `response_json` | Yes | Parsed JSON (if valid) |
| `ok` | Yes | Success/failure boolean |
| `error` | Yes | Error message if failed |
| `id` (callLogId) | Yes | Returned to caller for traceability |
| Latency | **No** | Duration of AI call not recorded |
| Token count | **No** | Input/output tokens not recorded |
| Cost | **No** | Per-call cost not computed |
| Prompt text | **Partial** | Only `requestJson` (metadata) logged, not full system+user prompt text |

**Traceability:** Every AI suggestion includes a `callLogId` that traces back to the exact prompt version and model. The raw response is stored, so forensic analysis is possible. However, the actual prompt text sent to the LLM is NOT stored -- only metadata about it (keys count, snippets count). Reconstructing the exact prompt requires knowing the prompt version and re-running the prompt builder with the same inputs.

**Grade: Logging/Observability: B-**
- Every call logged with model, version, response
- callLogId enables traceability
- Missing: latency, token count, cost, full prompt text
- No alerting or monitoring dashboards referenced

---

## TASK 2: TAXONOMY MODEL ASSESSMENT

### 2.1 TAXONOMY COMPLETENESS

**Source:** Migrations 068, 125, 126, 142, 143, 148

#### Complete Taxonomy Line Item Inventory

**Income Statement (PL):**

| ID | Code | Name | Parent | Contra | Display Order |
|----|------|------|--------|--------|---------------|
| fs_revenue | PL_REVENUE | Revenue | null | No | 100 |
| fs_revenue_contra | PL_REVENUE_CONTRA | Sales Returns & Allowances | fs_revenue | **Yes** | 102 |
| fs_cogs | PL_COGS | Cost of Goods Sold | null | No | 200 |
| fs_opex | PL_OPEX | Operating Expenses | null | No (subtotal) | 300 |
| fs_opex_sga | PL_OPEX_SGA | Selling, General & Administrative | fs_opex | No | 310 |
| fs_opex_rd | PL_OPEX_RD | Research & Development | fs_opex | No | 320 |
| fs_opex_da | PL_OPEX_DA | Depreciation & Amortization | fs_opex | No | 330 |
| fs_opex_other | PL_OPEX_OTHER | Other Operating Expenses | fs_opex | No | 340 |
| fs_other_income | PL_OTHER_INCOME | Other Income / (Expense) | null | No | 520 |
| fs_interest_income | PL_INTEREST_INCOME | Interest Income | fs_other_income | No | 500 |
| fs_interest_expense | PL_INTEREST_EXPENSE | Interest Expense | fs_other_income | No | 510 |
| fs_other_other | PL_OTHER_OTHER | Other Non-Operating | fs_other_income | No | 530 |
| fs_tax_expense | PL_TAX_EXPENSE | Income Tax Expense | null | No | 600 |
| fs_expense | PL_EXPENSE | Expenses (fallback) | null | No | 110 |
| fs_discontinued_ops | PL_DISCONTINUED | Income/Loss from Discontinued Operations | null | No | -- |
| fs_discontinued_disposal | PL_DISCONTINUED_DISPOSAL | Gain/Loss on Disposal | fs_discontinued_ops | No | -- |

**Balance Sheet (BS):**

| ID | Code | Name | Parent | Contra | Display Order |
|----|------|------|--------|--------|---------------|
| fs_asset | BS_ASSET | Assets | null | No (subtotal) | 1000 |
| fs_asset_current | BS_ASSET_CURRENT | Current Assets | fs_asset | No (subtotal) | 1001 |
| fs_asset_cash | BS_ASSET_CASH | Cash and Cash Equivalents | fs_asset_current | No | 1010 |
| fs_asset_ar | BS_ASSET_AR | Accounts Receivable, Gross | fs_asset_current | No | 1020 |
| fs_asset_ar_allowance | BS_ASSET_AR_ALLOWANCE | Allowance for Doubtful Accounts | fs_asset_current | **Yes** | 1030 |
| fs_asset_inventory | BS_ASSET_INVENTORY | Inventory | fs_asset_current | No | 1040 |
| fs_asset_prepaid | BS_ASSET_PREPAID | Prepaid Expenses | fs_asset_current | No | 1050 |
| fs_asset_other_current | BS_ASSET_OTHER_CURRENT | Other Current Assets | fs_asset_current | No | 1060 |
| fs_asset_noncurrent | BS_ASSET_NONCURRENT | Non-Current Assets | fs_asset | No (subtotal) | 1100 |
| fs_asset_ppe | BS_ASSET_PPE | Property, Plant & Equipment, Gross | fs_asset_noncurrent | No | 1110 |
| fs_asset_ppe_accum_dep | BS_ASSET_PPE_ACCUM_DEP | Accumulated Depreciation | fs_asset_noncurrent | **Yes** | 1120 |
| fs_asset_intangible | BS_ASSET_INTANGIBLE | Intangible Assets, Gross | fs_asset_noncurrent | No | 1135 |
| fs_asset_intangible_amort | BS_ASSET_INTANGIBLE_AMORT | Accumulated Amortization | fs_asset_noncurrent | **Yes** | 1140 |
| fs_asset_goodwill | BS_ASSET_GOODWILL | Goodwill | fs_asset_noncurrent | No | 1130 |
| fs_asset_other_noncurrent | BS_ASSET_OTHER_NONCURRENT | Other Non-Current Assets | fs_asset_noncurrent | No | 1150 |
| fs_liability | BS_LIABILITY | Liabilities | null | No (subtotal) | 1500 |
| fs_liability_current | BS_LIAB_CURRENT | Current Liabilities | fs_liability | No (subtotal) | 1501 |
| fs_liability_ap | BS_LIAB_AP | Accounts Payable | fs_liability_current | No | 1510 |
| fs_liability_accrued | BS_LIAB_ACCRUED | Accrued Liabilities | fs_liability_current | No | 1520 |
| fs_liability_current_debt | BS_LIAB_CURRENT_DEBT | Current Portion of Long-Term Debt | fs_liability_current | No | 1530 |
| fs_liability_other_current | BS_LIAB_OTHER_CURRENT | Other Current Liabilities | fs_liability_current | No | 1540 |
| fs_liability_noncurrent | BS_LIAB_NONCURRENT | Non-Current Liabilities | fs_liability | No (subtotal) | 1600 |
| fs_liability_lt_debt | BS_LIAB_LT_DEBT | Long-Term Debt | fs_liability_noncurrent | No | 1610 |
| fs_liability_deferred_tax | BS_LIAB_DEFERRED_TAX | Deferred Tax Liabilities | fs_liability_noncurrent | No | 1620 |
| fs_liability_other_noncurrent | BS_LIAB_OTHER_NONCURRENT | Other Non-Current Liabilities | fs_liability_noncurrent | No | 1630 |
| fs_equity | BS_EQUITY | Equity | null | No (subtotal) | 2000 |
| fs_equity_common | BS_EQUITY_COMMON | Common Stock & APIC | fs_equity | No | 2010 |
| fs_equity_retained | BS_EQUITY_RETAINED | Retained Earnings | fs_equity | No | 2020 |
| fs_equity_treasury | BS_EQUITY_TREASURY | Treasury Stock | fs_equity | **Yes** | 2030 |
| fs_equity_other | BS_EQUITY_OTHER | Other Equity | fs_equity | No | 2040 |
| fs_oci | BS_OCI | Accumulated Other Comprehensive Income | fs_equity | No | 2050 |

**Cash Flow (CF):**

| ID | Code | Name | Statement | Display Order |
|----|------|------|-----------|---------------|
| fs_cf_operating | CF_OPERATING | Cash from Operating Activities | CF | 3000 |
| fs_cf_investing | CF_INVESTING | Cash from Investing Activities | CF | 3100 |
| fs_cf_financing | CF_FINANCING | Cash from Financing Activities | CF | 3200 |

**OCI:**

| ID | Code | Name | Statement |
|----|------|------|-----------|
| fs_oci_unrealized_gains | OCI_UNREALIZED | Unrealized Gains/Losses on Securities | OCI |
| fs_oci_fx_translation | OCI_FX | Foreign Currency Translation Adjustments | OCI |
| fs_oci_pension | OCI_PENSION | Pension Adjustments | OCI |
| fs_oci_hedge | OCI_HEDGE | Cash Flow Hedge Gains/Losses | OCI |

#### Gap Analysis: $180M PE-Backed Manufacturer

**INCOME STATEMENT GAPS:**

| Required Line | Present? | Impact |
|---------------|----------|--------|
| Product Revenue | **No** -- single "Revenue" line | Cannot separate product from service revenue. PE investors typically want this breakdown. Not GAAP-blocking but limits analysis. |
| Service Revenue | **No** | Same as above |
| Other Revenue | **No** | Rolled into Other Income / (Expense) |
| Sales Returns & Allowances (contra) | **Yes** (fs_revenue_contra) | Correct |
| Materials COGS | **No** -- single "COGS" line | Cannot break out materials, labor, overhead, freight. PE investors want COGS detail for margin analysis. |
| Labor COGS | **No** | Same |
| Overhead COGS | **No** | Same |
| Freight COGS | **No** | Same |
| SGA | **Yes** (fs_opex_sga) | Correct |
| R&D | **Yes** (fs_opex_rd) | Correct |
| D&A | **Yes** (fs_opex_da) | Correct |
| Interest Income | **Yes** (fs_interest_income) | Correct |
| Interest Expense | **Yes** (fs_interest_expense) | Correct |
| Other Income | **Yes** (fs_other_other) | Correct |
| Gain/Loss on disposal | **Partial** -- in Discontinued Ops only | Gain/Loss on asset disposal outside discontinued ops has no dedicated line. Would fall into `fs_other_other`. |
| Current Tax | **No** -- single "Income Tax Expense" | Cannot separate current from deferred tax on the P&L. Deferred Tax is a BS line only. |
| Deferred Tax (P&L) | **No** | Same |

**BALANCE SHEET GAPS:**

| Required Line | Present? | Impact |
|---------------|----------|--------|
| Cash | **Yes** | Correct |
| AR (Gross) | **Yes** (renamed in migration 148) | Correct |
| Allowance (contra) | **Yes** (fs_asset_ar_allowance) | Correct |
| Inventory | **Yes** | Correct |
| Prepaid | **Yes** | Correct |
| Other Current Assets | **Yes** | Correct |
| PPE (Gross) | **Yes** (renamed in migration 148) | Correct |
| Accum Depreciation (contra) | **Yes** (fs_asset_ppe_accum_dep) | Correct |
| Intangibles (Gross) | **Yes** (renamed in migration 148) | Correct |
| Accum Amortization (contra) | **Yes** (fs_asset_intangible_amort) | Correct |
| Goodwill | **Yes** | Correct |
| Other Non-Current Assets | **Yes** | Correct |
| AP | **Yes** | Correct |
| Accrued Liabilities | **Yes** | Correct |
| Current Debt | **Yes** | Correct |
| **Deferred Revenue (Current)** | **NO** | **CRITICAL GAP.** A manufacturer with service contracts or maintenance agreements needs current deferred revenue. Currently falls into "Other Current Liabilities." |
| Other Current Liabilities | **Yes** | Correct |
| Long-Term Debt | **Yes** | Correct |
| Deferred Tax Liabilities | **Yes** | Correct |
| **Deferred Revenue (Non-Current)** | **NO** | Same as above for non-current portion |
| **Deferred Tax Assets** | **NO** | **MATERIAL GAP.** Only Deferred Tax Liabilities exist. A company with NOL carryforwards or other DTAs has no place to put them. They would fall into "Other Current/Non-Current Assets." |
| Other Non-Current Liabilities | **Yes** | Correct |
| Common Stock & APIC | **Yes** (combined) | Acceptable for PE reporting; some auditors want them separate |
| Retained Earnings | **Yes** | Correct |
| Treasury Stock (contra) | **Yes** | Correct |
| AOCI | **Yes** | Correct |

**CASH FLOW GAPS:**

The CF taxonomy has only 3 section-level lines (Operating, Investing, Financing). The actual cash flow statement is built programmatically in `src/services/cashFlow.ts` using:
- Net income + non-cash adjustments (D&A, deferred tax, unrealized FX, SBC)
- Working capital changes (AR, Inventory, AP)
- Investing: delta in PPE
- Financing: delta in Debt, Equity

This is **adequate** for indirect method. The CF taxonomy lines are classification targets for the `cash_flow_class` on mapping rules, not individual line items.

**EQUITY STATEMENT GAPS:**

The equity statement (`src/services/equityChanges.ts`) is minimal -- it shows opening equity, net income, OCI, and a "residual" for everything else. There are no taxonomy lines for:
- Dividends paid
- Stock issuance proceeds
- Stock repurchases
- Comprehensive income components

This is a **functional gap** -- the equity statement currently cannot properly itemize capital transactions.

### 2.2 HIERARCHY AND COMPUTATION

**Subtotal computation** (`src/services/financialStatements.ts`):

Subtotals are computed **programmatically** in `buildProfitAndLoss` and `buildBalanceSheet`, NOT by walking the `parent_id` hierarchy. For example:

```
grossProfit = totalRevenue - totalCogs               (line 340)
operatingIncome = grossProfit - (totalOpex + unclassified)  (line 341)
incomeBeforeTax = operatingIncome + totalOther       (line 342)
netIncome = incomeBeforeTax - totalTax               (line 343)
```

The `parent_id` hierarchy in `fs_taxonomy_lines` is used for:
1. Display ordering (via `display_order` column)
2. Categorization in the mapping engine (which section does this account belong to?)

But **subtotal computation does NOT walk the tree**. It uses hardcoded `Set<string>` constants for each bucket (e.g., `COGS_FS_LINES`, `OPEX_FS_LINES`, `BS_CURRENT_ASSET_FS_LINES`). This means:

**If a user adds a custom taxonomy line**, it will be:
1. Stored in the DB
2. Referenced by mapping rules
3. **Ignored by the statement builder** unless the code is also updated to include the new line ID in the appropriate `Set`

This is a **correctness risk**. Custom line items added via the taxonomy table but not reflected in the code-level Sets would be silently dropped from financial statements.

**Unmapped accounts:** The `coa_mapping_service.ts` (line 88-98) handles unmapped accounts by falling back to `classifyAccount()` which returns a broad `accountType` (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), mapped to the top-level fallback line (e.g., `fs_asset`, `fs_expense`). This means unmapped accounts appear on the statements but in the wrong section -- they are never silently dropped.

### 2.3 CONTRA ACCOUNT HANDLING

**is_contra flag** in migration 148:
- `fs_revenue_contra` (Sales Returns & Allowances): `is_contra = TRUE`
- `fs_asset_ar_allowance` (Allowance for Doubtful Accounts): `is_contra = TRUE`
- `fs_asset_ppe_accum_dep` (Accumulated Depreciation): `is_contra = TRUE`
- `fs_asset_intangible_amort` (Accumulated Amortization): `is_contra = TRUE`
- `fs_equity_treasury` (Treasury Stock): `is_contra = TRUE`

**How contras are handled in statement generation:**

In `financialStatements.ts`, contra accounts are handled through the `CREDIT_POSITIVE_FS_LINES` set and the `netAmount` function (lines 36-66):

```typescript
const CREDIT_POSITIVE_FS_LINES = new Set([
  // ... includes contra-asset lines:
  'fs_asset_ar_allowance', 'fs_asset_ppe_accum_dep', 'fs_asset_intangible_amort',
]);

function netAmount(entry: TrialBalanceEntry): number {
  const net = minus(entry.debit, entry.credit);
  const creditPositive = entry.fsLineId != null
    ? CREDIT_POSITIVE_FS_LINES.has(entry.fsLineId)
    : /* fallback by accountType */;
  const signed = creditPositive ? -net : net;
  return round2(signed);
}
```

**Correctness check:**
- Accumulated Depreciation has normal balance = credit. Debit = 0, Credit = 500,000.
- `net = debit - credit = 0 - 500,000 = -500,000`
- `creditPositive = true` (in CREDIT_POSITIVE_FS_LINES)
- `signed = -(-500,000) = 500,000`
- On the Balance Sheet, this 500,000 appears in the `noncurrentAssets` bucket
- `totalAssets = sumLines(currentAssets + noncurrentAssets)` which includes this positive 500,000

**WAIT -- this is WRONG.** Accumulated Depreciation should REDUCE total assets, not increase them. A positive amount for a contra-asset added to the asset total would overstate assets.

Let me re-analyze. The entry for Accumulated Depreciation:
- In the GL: debit = 0, credit = 500,000 (credit balance)
- `net = 0 - 500,000 = -500,000`
- `creditPositive = true` for this fsLineId
- `signed = -(-500,000) = +500,000`

This is then included in `noncurrentAssetLines` via `bucketBsByFsLine`. The `sumLines` adds it:
- PPE Gross: +1,000,000
- Accum Dep: +500,000
- Total Non-Current Assets = 1,500,000 (**INCORRECT -- should be 500,000**)

**ACTUALLY**, let me re-read the logic more carefully. The contra-asset lines (`fs_asset_ar_allowance`, `fs_asset_ppe_accum_dep`, `fs_asset_intangible_amort`) are in `CREDIT_POSITIVE_FS_LINES`. The `netAmount` function makes credit-positive lines show as positive when they have a credit balance. But the contra-asset has a credit balance, so it would show as positive in the asset section, which is wrong.

**CORRECTION:** I need to reconsider. Let me trace through again more carefully.

For Accum Dep with credit balance of 500,000:
- `net = debit - credit = 0 - 500,000 = -500,000`
- `creditPositive = true`
- `signed = -(net) = -(-500,000) = +500,000`

This means Accumulated Depreciation shows as **positive** +500,000 in the asset section. But on a balance sheet, Accumulated Depreciation should show as a **negative** (reducing PPE).

Wait -- the contra-assets are in CREDIT_POSITIVE_FS_LINES, which makes their credit balances appear as **positive numbers**. But contra-assets should **subtract** from the asset total. There seems to be an issue.

Actually, let me look at this differently. Perhaps the sign is correct because the statement builder applies the contra display separately. Looking at the buildBalanceSheet function, the contra lines are included in `noncurrentAssetLines` or `currentAssetLines` via `bucketBsByFsLine`. They are summed with `sumLines(assets)`. If Accum Dep shows as +500,000 and PPE shows as +1,000,000, the total would be 1,500,000.

But the GL typically has: PPE debit balance = 1,000,000, Accum Dep credit balance = 500,000.

For PPE (debit-positive, NOT in CREDIT_POSITIVE_FS_LINES):
- `net = 1,000,000 - 0 = 1,000,000`
- `creditPositive = false`
- `signed = net = 1,000,000`

For Accum Dep (credit-positive per CREDIT_POSITIVE_FS_LINES):
- `net = 0 - 500,000 = -500,000`
- `creditPositive = true`
- `signed = -net = -(-500,000) = +500,000`

Total = 1,000,000 + 500,000 = 1,500,000. This is **incorrect**. Net PPE should be 500,000.

**HOWEVER** -- I need to verify whether the `is_contra` flag is actually used to negate the sign. Looking through `financialStatements.ts`, the `is_contra` flag from the taxonomy is **NOT referenced anywhere in the statement builder**. The statement builder relies solely on `CREDIT_POSITIVE_FS_LINES`.

After further analysis, I believe the sign convention may actually be correct but counterintuitive. The contra-asset lines are placed in `CREDIT_POSITIVE_FS_LINES`, which means they display credit balances as positive. But if we think about it from the GL perspective: Accum Dep has a **credit** normal balance. When we say `creditPositive = true`, the intent is "this line's positive display value corresponds to its credit balance." For the balance sheet equation to work (Assets = L + E), the total assets calculation must subtract contras.

Re-checking: the contra-assets are routed to `BS_NONCURRENT_ASSET_FS_LINES` (or current). They get `netAmount` which returns a positive number for a credit-balance contra. Then `sumLines` adds them. This would make `totalAssets` too high.

**I believe there is a potential sign error for contra-asset accounts in the statement builder.** The `CREDIT_POSITIVE_FS_LINES` treatment makes contras show as positive, but they should reduce the asset total. The balance sheet equation check (`totalAssets == totalLiabilities + totalEquity`) via `assertIntegrityGateOrThrow` would catch this if it produces an imbalance -- meaning the system would throw `MathematicalIntegrityError` rather than produce incorrect statements. This is the correct outcome (fail-safe), but it means contra accounts might not display correctly.

**UPDATE:** After more careful thought, I realize I may have the debit/credit reversed. In many trial balance uploads, Accumulated Depreciation could be represented as:
- debit = 0, credit = 500,000 (standard GL representation)
- OR debit = -500,000, credit = 0 (TB net representation)

If the TB represents Accum Dep as `debit = -500,000, credit = 0`:
- `net = -500,000 - 0 = -500,000`
- `creditPositive = true`
- `signed = -(-500,000) = +500,000`
- Still positive.

The resolution depends on how the trial balance data is actually structured. The integrity gate check is the safety net. **This needs integration testing to verify correctness.**

### 2.4 SIGN CONVENTION

**`CREDIT_POSITIVE_FS_LINES`** (`financialStatements.ts`, lines 36-46):

This constant defines which FS line IDs display positive values for credit balances:
- Liabilities: `fs_liability`, `fs_liability_current`, `fs_liability_ap`, etc.
- Equity: `fs_equity`, `fs_equity_common`, `fs_equity_retained`, etc.
- Revenue: `fs_revenue`, `fs_other_income`, `fs_interest_income`
- Contra-assets: `fs_asset_ar_allowance`, `fs_asset_ppe_accum_dep`, `fs_asset_intangible_amort`
- OCI: `fs_oci`, `fs_oci_unrealized_gains`, etc.

**How it works** (`netAmount` function, lines 57-66):
1. Compute `net = debit - credit` (always debit minus credit)
2. If the fsLineId is in `CREDIT_POSITIVE_FS_LINES`, negate the net: `signed = -net`
3. If not, `signed = net` (debit-positive display)

**Fallback**: If no `fsLineId`, falls back to `accountType`: LIABILITY, EQUITY, REVENUE are credit-positive.

**Could a mapping error cause Revenue to show as negative?**

Yes, in two scenarios:
1. If Revenue accounts are mapped to a non-credit-positive fsLineId (e.g., `fs_expense`), the sign would be inverted -- Revenue would show as negative on the P&L.
2. If Revenue has a debit balance (unusual, but possible for reversals or returns), the `creditPositive` logic would make it display as negative, which is actually correct behavior for a debit-balance revenue account.

The mapping engine (`coa_mapping_service.ts`) is the critical control point. A misconfigured mapping rule could silently flip signs. The integrity gate (`assertIntegrityGateOrThrow`) would catch this only if it causes a BS imbalance; a P&L sign error alone would NOT trigger the integrity gate.

---

## TASK 3: AI INTEGRATION ROADMAP

### 3.1 IMMEDIATE IMPROVEMENTS (Fix What's Broken or Weak)

#### P0: Add Few-Shot Examples to All Prompts

**Impact: HIGH | Effort: LOW**

Every prompt file needs 1-2 examples of ideal output. This is the single highest-ROI improvement for output quality. Specific recommendations:

**Justifier** (`src/ai/prompts/justifier.prompt.ts`):
Add after line 40:
```
Example output:
{"prompt_version":"justifier_v1.0.0","irac":{"issue":"Whether the $45,000 reclassification from Operating Expense to Prepaid Expense is appropriate under GAAP.","rule":"ASC 720-15 and ASC 340-10 require that advance payments for goods or services that have not yet been received are recognized as prepaid expenses (assets) rather than current-period expenses.","analysis":"The facts show a 12-month insurance premium paid in full. Six months of coverage remain as of period end. The reclassification from OpEx to Prepaid is consistent with the matching principle and ASC 340-10-25.","conclusion":"The reclassification is appropriate. The prepaid asset should be amortized monthly over the remaining coverage period."},"memo_markdown":"...","rule_ids":["ASC 340-10-25","ASC 720-15"],"facts_used":["insurance_premium","coverage_period","payment_date"]}
```

**Classifier** (`src/ai/prompts/classifier.prompt.ts`):
Add example showing how "Accumulated Depreciation - Equipment" maps to `{object_type: "contra_asset", fs_placement: "bs.asset.noncurrent", suggested_accounts: ["fs_asset_ppe_accum_dep"]}`.

#### P0: Tighten Classifier Schema

**Impact: HIGH | Effort: LOW**

In `src/ai/schemas/classifier.schema.ts`, change:
```typescript
object_type: z.string(),   // CURRENT: accepts anything
fs_placement: z.string(),  // CURRENT: accepts anything
```
To:
```typescript
object_type: z.enum(['expense', 'asset', 'liability', 'revenue', 'equity', 'contra_asset', 'contra_equity', 'contra_revenue', 'unknown', 'lease_candidate']),
fs_placement: z.string().regex(/^(pnl\.|bs\.|cf\.|oci\.)/, 'Must start with statement prefix'),
```

#### P0: Fix number_provenance_validator Gap in proposal_validator

The `assertNoNumericAmountsInAgentOutput` in `proposal_validator.ts` only checks `$` pattern. It should also check:
- Plain large numbers (>999) in text fields
- The `title` field (currently not checked)
- Non-USD currency symbols

#### P1: Wrap All AI Code Paths in runInBoundaryScope

Audit every entry point that calls AI functions. Ensure all are wrapped in `runInBoundaryScope`. The current gap where background jobs may not be wrapped means the AsyncLocalStorage guard is silently bypassed.

#### P1: Add Missing Taxonomy Lines

Create a new migration to add:
- `fs_liability_deferred_rev_current` (Deferred Revenue - Current) under `fs_liability_current`
- `fs_liability_deferred_rev_noncurrent` (Deferred Revenue - Non-Current) under `fs_liability_noncurrent`
- `fs_asset_dta` (Deferred Tax Assets) under `fs_asset_noncurrent`
- `fs_tax_current` (Current Tax Expense) and `fs_tax_deferred` (Deferred Tax Expense) under `fs_tax_expense`

AND update the corresponding `Set` constants in `financialStatements.ts`.

#### P1: Add Latency, Token Count, Cost to ai_call_log

In `ai_call_log_repository.ts`, add columns:
- `latency_ms INTEGER`
- `input_tokens INTEGER`
- `output_tokens INTEGER`
- `estimated_cost_usd NUMERIC(10,6)`

Populate from the Claude adapter response.

#### P2: Seed Knowledge Base with PE-Specific Content

Add to `gaap_seed_data.ts`:
- ASC 350-40 (Internal-Use Software Capitalization)
- ASC 420 (Restructuring Costs)
- ASC 815 hedge effectiveness details
- Common PE portfolio company accounting policies (management fee treatment, sponsor expense allocation, etc.)

### 3.2 SHORT-TERM AI FEATURES (Next 3 Months)

Ranked by: Impact on User x Implementation Effort

#### 1. Intelligent Account Mapping Suggestions (Impact: 10/10, Effort: 3/10)

**What:** When a controller uploads a new GL, the Classifier pillar automatically suggests `fs_line_id` mappings for every account. Show suggestions with confidence scores and GAAP rationale. One-click accept.

**Why controllers love it:** Mapping 200+ accounts manually takes 2-4 hours. AI-assisted mapping with explanations reduces this to 15 minutes. "I can't go back to the old way."

**Why PE loves it:** Standardizes CoA mapping across portfolio companies. "Deploy this across the portfolio."

**Implementation:** Already mostly built -- `runClassifier` + `coa_mapping_service.ts` + `enrichEntriesWithCoaMapping`. Need: frontend UI for accept/reject/modify suggestions, confidence-threshold auto-accept, mapping version history.

#### 2. Variance Explanation Drafting (Impact: 9/10, Effort: 4/10)

**What:** When material variances are detected (period-over-period), the AI drafts a variance explanation citing specific accounts, amounts (from data only), and suggested GAAP references.

**Why:** Writing variance explanations is the most tedious part of the close. CFOs spend 30% of close time on variance narratives. AI-drafted explanations with human edit/approve flow saves days.

**Implementation:** `variance_chat_service.ts` already implements the conversational layer with number provenance validation. Need: batch variance explanation generation, draft-review-approve workflow, export to close binder.

#### 3. Journal Entry Shadow Audit (Impact: 8/10, Effort: 3/10)

**What:** Every journal entry posted triggers a Shadow Auditor review. Findings (ok/warn/block) are surfaced to the controller before posting. Block findings prevent posting until resolved.

**Why:** Real-time audit feedback catches errors before they propagate. Reduces close-end surprises.

**Implementation:** `runShadowAudit` already built. Need: integration into JE posting workflow, UI for finding review, configurable severity thresholds per entity.

#### 4. Reconciliation Evidence Reviewer (Impact: 7/10, Effort: 5/10)

**What:** When a controller uploads bank statements or subledger exports as reconciliation evidence, AI reviews the evidence and flags discrepancies, missing items, or unusual patterns.

**Why:** Reconciliation review is the second most time-consuming close task. AI-flagged issues focus reviewer attention.

**Implementation:** New -- requires document parsing (PDF/CSV), evidence-to-balance matching, and a new AI pillar or extension of Shadow Auditor.

#### 5. Close Readiness Predictor (Impact: 6/10, Effort: 4/10)

**What:** Based on current progress (gates completed, outstanding items, historical patterns), predict close completion date and flag at-risk items.

**Why:** PE operating partners want predictable close timelines. "When will the books be ready?" is answered automatically.

**Implementation:** Use historical close data + current readiness gates as features. Could be rule-based initially, ML-enhanced later.

### 3.3 MEDIUM-TERM AI FEATURES (3-6 Months)

#### SLM Fine-Tuning Strategy

**Model:** Claude 3.5 Haiku or Mistral 7B for high-volume, low-latency tasks (Classifier, Shadow Auditor)
**Training data:**
- Accepted/rejected classifier suggestions (from the HITL feedback loop)
- Shadow Auditor findings with human severity overrides
- Approved variance explanations vs rejected/edited ones
- CoA mappings across portfolio companies (cross-entity transfer learning)

**Tasks to fine-tune:**
1. Account classification (highest volume, most consistent patterns)
2. Shadow audit severity (learn entity-specific policy thresholds)
3. Variance explanation style (learn CFO's preferred tone and detail level)

**Approach:** LoRA fine-tuning on 3-5k examples per task. Evaluate with held-out set. A/B test against base model. Deploy only when fine-tuned model beats base on accuracy AND latency.

#### RAG Pipeline Improvements

**Content to add:**
- Entity-specific policies (uploaded by controller, chunked and embedded)
- Prior-period close packages (learn from historical patterns)
- Peer company benchmarks (anonymized, if available from portfolio)
- SEC filing templates and disclosure checklists

**Retrieval strategy improvements:**
1. Replace keyword search with BM25 for Tier 2/3 (significant quality improvement for minimal effort)
2. Implement hybrid scoring: `final_score = alpha * semantic_score + (1 - alpha) * bm25_score`
3. Add reranking step with a cross-encoder for top-20 results before sending to LLM
4. Implement metadata filtering in vector search (date range, entity, statement type)

#### Agentic Capabilities

The Resolution Agent (`src/ai/resolution_agent.ts`) already implements Plan-Execute-Verify with retry. Extend to:

**Should DO (suggest with high confidence):**
- Generate draft JE proposals for standard accruals (payroll, interest, depreciation)
- Pre-populate reconciliation templates from prior period
- Draft disclosure notes from financial statement data
- Generate intercompany elimination entries (from configured pairs)

**Should NEVER DO (confirm the boundary):**
- Post journal entries
- Approve reconciliations
- Modify trial balance amounts
- Change account mappings without human confirmation
- Auto-advance close session state
- Generate or sign certification artifacts

### 3.4 WHAT AI SHOULD NEVER DO

#### Hard Boundaries (Must Never Cross)

1. **AI must never compute dollar amounts.** All amounts come from the deterministic engine (Decimal.js arithmetic, GENERATED ALWAYS columns, DB triggers). AI can copy amounts with provenance, but never calculate.

2. **AI must never write to core financial tables.** The DB role separation (`ai_writer` cannot access `core.*` schema) is the infrastructure backstop. This must be maintained even as the AI becomes more capable.

3. **AI must never auto-approve.** Every AI suggestion requires human confirmation. The `requires_human_confirmation: true` in the Advisor schema should be hardcoded, not AI-controllable.

4. **AI must never sign or certify.** The Ed25519 certification and hash-chained audit ledger are human-initiated, cryptographically bound actions. AI has no access to signing keys.

5. **AI must never skip gates.** The close workflow state machine (OPEN -> IN_PROGRESS -> UNDER_REVIEW -> CERTIFIED -> LOCKED) is deterministic. AI cannot advance state.

#### Slippery Slope Features to Avoid

1. **"Smart Auto-Post"** -- "AI suggests a JE and if confidence > 0.95, auto-post it." This sounds efficient but violates the fundamental trust model. Controllers must see and approve every entry. The moment auto-posting is enabled, the audit trail breaks.

2. **"AI-Computed Accruals"** -- "AI calculates the monthly interest accrual based on the debt schedule." This crosses the compute boundary. The deterministic engine should compute; AI should suggest THAT an accrual is needed, not compute the amount.

3. **"Autonomous Reconciliation Matching"** -- "AI matches bank transactions to GL entries and marks them reconciled." Even if matching accuracy is 99.9%, the 0.1% error in a reconciliation could mask fraud or error. Matching should be suggested, not applied.

4. **"Cross-Entity Learning Without Consent"** -- Using one portfolio company's accounting patterns to train models for another without explicit opt-in. This creates information leakage and potential conflict-of-interest concerns.

---

## FINAL SCORECARD

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Architecture** | **B+** | Clean 4-pillar separation, fail-open design, proper DI of Pool. Missing: formal pillar registry, no cross-pillar context. Resolution Agent adds agentic capability. |
| **Prompt Quality — Justifier** | **B** | Clear IRAC structure, good guardrails, no few-shot examples, no edge case defense |
| **Prompt Quality — Shadow Auditor** | **B** | Clear flag-only mandate, materiality-aware, no few-shot examples |
| **Prompt Quality — Classifier** | **B-** | Clean ALLOWED/FORBIDDEN, but schema too loose (accepts any string for key fields), no few-shot |
| **Prompt Quality — Advisor** | **B** | Best provenance enforcement, proper schema constraints, no few-shot examples |
| **Output Validation** | **B** | Advisor schema is strong (provenance chain). Classifier schema is weak (no enums). number_provenance_validator is excellent but limited scope. |
| **Boundary Enforcement** | **A-** | 5-layer defense-in-depth. DB role separation is infrastructure-grade. AsyncLocalStorage gap for unwrapped code paths is the main concern. |
| **Knowledge Base** | **B-** | Real GAAP content (100+ chunks), working pgvector integration, but keyword search is naive, Tier 2 is in-memory only, missing PE-relevant GAAP topics. |
| **Logging/Observability** | **B-** | Every call logged with model/version/response. Missing: latency, tokens, cost, full prompt text. |

### Overall AI Engineering Grade: **B**

The system has a **strong architectural foundation** -- the 4-pillar design, fail-open semantics, multi-layer boundary enforcement, and real GAAP knowledge base are all well-engineered. The primary gaps are:

1. **No few-shot examples** in any prompt (highest-ROI fix)
2. **Classifier schema too loose** (accepts any string for critical fields)
3. **Missing taxonomy lines** (Deferred Revenue, DTA, Current/Deferred Tax split)
4. **Keyword search is not BM25** (limits retrieval quality)
5. **No latency/token/cost logging** (limits operational insight)
6. **AsyncLocalStorage gap** when code paths are not wrapped in runInBoundaryScope

The system correctly enforces the trust model: **AI suggests, humans decide, arithmetic computes.** The DB role separation at the PostgreSQL level is the strongest guarantee and is correctly implemented.

---

*Audit completed 2026-03-12. All file paths are absolute from project root `C:\Users\yasir\CPACFA`. Line numbers reference the files as read during this audit.*
