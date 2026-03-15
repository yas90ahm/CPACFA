# Blind AI Engineer Review -- Sovereign CPA Engine

**Reviewer**: AI Engineer (cold read, source code only)
**Date**: 2026-03-14
**Files Read**: 30+ TypeScript source files across src/ai/, src/services/, src/knowledge_base/, src/llm/, src/lib/

---

## Architecture Diagram

```
                        HTTP Request
                             |
                    [Express Middleware]
                    runInBoundaryScope()        <-- AsyncLocalStorage per-request scope
                             |
                +------------+------------+
                |                         |
        [Mutation Paths]          [AI Advisory Paths]
        assertNoAiMutation        enterAdvisoryContext()
        Context() blocks if       +-----------+-----------+-----------+-----------+
        depth > 0                 |           |           |           |           |
                                  |           |           |           |           |
                            Justifier   Shadow      Classifier    Advisor    Resolution
                             Pillar     Auditor      Pillar       Pillar      Agent
                                  |           |           |           |           |
                                  +-----+-----+-----+-----+-----+-----+         |
                                        |                                        |
                                  [ai_client.ts]                     [Plan-Execute-Verify]
                                  callAIWithSchema()                  max 3 retries
                                  enter/exitAdvisory                       |
                                  Zod schema parse                  [proposal_validator.ts]
                                        |                            assertNoNumericAmounts
                                  [claude_adapter.ts]                assertAccountCodesExist
                                  callClaude()                       assertValidGAAPCitation
                                  timeout, mock mode                 assertProposalTypeValid
                                  cost estimation                          |
                                        |                           [HITL Staging]
                                  [ai_call_log_repository.ts]        human must approve
                                  INSERT ai_call_log
                                  latency, tokens, cost, ok/error

        +--------- Additional AI Services (outside orchestrator) ---------+
        |                                                                  |
   variance_chat_service.ts     agentic_onboarding.ts     revenue_recognition_service.ts
   justification_service.ts     policy_inference_agentic   ai_account_analyzer_service.ts
   ai_classification_service.ts export_service.ts          (all use enter/exitAdvisoryContext)
   (all call assertNoNumericAmountsInAgentOutput)

                            [Knowledge Base]
                    +----------+----------+-----------+
                    |          |          |           |
              Tier 1 Global  Tier 2 Firm  Tier 3 Session
              FASB/IFRS/Tax  CoA/Policies  Uploads
                    |
              +-----+-----+
              |           |
        pgvector       BM25 keyword
        semantic       (in-memory fallback)
        search

                    [XBRL Taxonomy]
                    xbrl_taxonomy_elements table
                    pg_trgm trigram search
                    embedding column (optional)
```

---

## 1. AI BOUNDARY -- Grade: A

### Mechanism
The system uses `AsyncLocalStorage` (Node.js async_hooks) to track advisory context per async execution chain. This is the gold standard for per-request state in Node.js -- it prevents false positives across concurrent requests.

**Three layers of defense:**

1. **Runtime boundary** (`src/lib/ai_boundary.ts`): `enterAdvisoryContext()` increments a depth counter; `exitAdvisoryContext()` decrements. `assertNoAiMutationContext()` throws if depth > 0.

2. **Type barrier** (`src/ai/advisory_interface.ts`): All AI outputs are branded as `Readonly<>` types (`AdvisorySuggestion`, `ClassifierAdvisory`, `AdvisorAdvisory`, `JustifierAdvisory`, `ShadowAuditorAdvisory`). TypeScript prevents mutation-capable fields at compile time.

3. **Mutation-point assertions**: `assertNoAiMutationContext()` is called at:
   - `src/bridge/protocol_bridge.ts:258` -- `executeBridgeCommand()`
   - `src/services/close_session_service.ts:263` -- `certifyCloseSession()`
   - `src/services/close_session_service.ts:685` -- advance session
   - `src/services/close_session_service.ts:730` -- lock session

**Scope enforcement**: Every HTTP request is wrapped in `runInBoundaryScope()` via Express middleware at `src/server.ts:89`. Background jobs also use it (`src/services/job_handlers.ts:58`).

**AI writes only to**: `ai_call_log`, `ai_coa_suggestions`, `ai_cf_suggestions`, `tenant_justifications`, `tenant_shadow_audit_findings` -- all advisory/logging tables, never `journal_entries`, `period_trial_balance`, `statement_packages`, or `general_ledger`.

### Gaps
- The `enterAdvisoryContext()` silently falls through if no store exists (line 35-36). This means if a background job invokes AI without `runInBoundaryScope()`, the boundary is ineffective. The mutation assertion (`assertNoAiMutationContext`) also passes silently when `store` is undefined (no crash, but no protection). However, `job_handlers.ts` does wrap in `runInBoundaryScope`, so this is a theoretical gap, not a practical one.

### Verdict
Three independent layers (runtime, type, mutation-assertion), per-request scoping, ALL mutation paths guarded. This is production-grade.

---

## 2. PROMPT QUALITY -- Grade: A-

### Justifier Prompt (`src/ai/prompts/justifier.prompt.ts`)
- Clear system/user separation: YES
- HARD RULES section: YES (no inventing facts, no computing amounts, missing info handling)
- Few-shot example: YES (1 complete IRAC JSON example)
- Output format specification: YES (exact JSON shape with version)
- Error/edge case instructions: YES ("If information is missing, say so")

### Shadow Auditor Prompt (`src/ai/prompts/shadow_auditor.prompt.ts`)
- System/user separation: YES
- RULES section: YES
- Few-shot examples: YES (3 examples -- ok, warn, block severity)
- Output format: YES (exact JSON shape)
- Edge cases: YES (uncertainty -> warn + lower confidence)

### Classifier Prompt (`src/ai/prompts/classifier.prompt.ts`)
- System/user separation: YES
- ALLOWED/FORBIDDEN sections: YES (explicit deny list)
- Few-shot examples: YES (3 examples -- normal, contra, ambiguous)
- Output format: YES (JSON schema)
- Edge cases: YES ("If unsure, lower confidence and add missing_inputs")
- XBRL context integration: YES (built from `xbrl_context.ts`)
- Account intelligence flags: YES (prior period mappings)

### Advisor Prompt (`src/ai/prompts/advisor.prompt.ts`)
- System/user separation: YES
- ALLOWED/FORBIDDEN: YES
- Few-shot example: YES (1 reconciliation variance proposal)
- Amount provenance rules: YES (SOURCE_LINE_AMOUNT requires sourceRef)
- Schema: YES

### Resolution Agent (inline in `src/ai/resolution_agent.ts`)
- System prompt: YES, with specific rules
- Prior error feedback: YES (failed attempts fed back to AI)
- No few-shot example: MISSING

### Gaps
- Resolution agent has no few-shot example in its system prompt (lines 100-112). Minor gap since the Plan-Execute-Verify loop compensates.
- No explicit token-limit-aware truncation in prompts. Large input data could overflow context window silently (though `maxTokens: 2048` on output is set in the adapter).

---

## 3. OUTPUT VALIDATION -- Grade: A-

### Zod Schema Validation (via `ai_client.ts`)
Every orchestrator pillar goes through `callAIWithSchema()` which:
1. Parses raw text as JSON
2. Validates against Zod schema (`schema.parse(json)`)
3. Returns `ok: false` if parsing fails

**Schemas are strict:**
- `ClassifierOutputSchema`: Enumerates valid `object_type` values, regex on `fs_placement`
- `ShadowAuditorOutputSchema`: `z.enum(['ok','warn','block'])`, confidence 0-1
- `AdvisorOutputSchema`: Amount provenance enforcement via `.refine()` -- if amount present, provenance required; if `SOURCE_LINE_AMOUNT`, sourceRef required
- `JustifierOutputSchema`: Standard IRAC fields

### assertNoNumericAmountsInAgentOutput Coverage

**Two separate implementations:**

1. **`src/llm/guardrails.ts`** -- Checks for numeric values in keys named `debit`, `credit`, `amount`, `balance`, `total`, etc. Used by all services that call LLMs directly.

2. **`src/ai/guardrails/proposal_validator.ts`** -- Regex-based: catches `$1,234`, comma-separated large numbers, spelled-out currency, foreign currency symbols, accounting-format parentheticals. Used by the Resolution Agent.

**Services with guardrail applied:**
| Service | File | Applied? |
|---------|------|----------|
| ai_classification_service | `src/services/ai_classification_service.ts:190-194` | YES |
| shadow_auditor_service | `src/services/shadow_auditor_service.ts` | NO (missing -- see below) |
| justification_service | `src/services/justification_service.ts:134` | YES |
| variance_chat_service | `src/services/variance_chat_service.ts:193,222` | YES |
| agentic_onboarding | `src/services/agentic_onboarding.ts:79,147` | YES |
| policy_inference_agentic | `src/services/policy_inference_agentic.ts:63` | YES |
| revenue_recognition_service | `src/services/revenue_recognition_service.ts:204,444,510` | YES |
| export_service | `src/services/export_service.ts:164` | YES |
| ai_account_analyzer_service | `src/services/ai_account_analyzer_service.ts:143` | YES |
| Resolution Agent (proposal_validator) | `src/ai/guardrails/proposal_validator.ts:203` | YES |

### Number Provenance Validator (variance_chat_service only)
`src/lib/number_provenance_validator.ts` -- A dedicated layer for variance chat that verifies every number in the AI response traces back to the investigation data. Handles `$1.2M` abbreviations, sign flips, sums of top-N accounts. This is excellent and unique to the variance chat pillar.

### Gaps

**CRITICAL: `shadow_auditor_service.ts` does NOT call `assertNoNumericAmountsInAgentOutput` on the AI result.** The orchestrator (`ai_orchestrator.ts:runShadowAudit`) returns the parsed Zod output, which is then merged with deterministic findings in `shadow_auditor_service.ts:164-169` and stored directly. The AI findings are stored as-is without the guardrail.

- File: `src/services/shadow_auditor_service.ts`
- Missing at: line 164-169, before constructing `aiItems`

**The orchestrator (`ai_orchestrator.ts`) itself does NOT call `assertNoNumericAmountsInAgentOutput` on any pillar output.** It relies on downstream services to apply this guardrail. This is a design choice but means any new consumer of the orchestrator could skip the check.

---

## 4. ADVISORY CONTEXT -- Grade: A

### Coverage

Every AI-calling service wraps its LLM calls in `enterAdvisoryContext()`/`exitAdvisoryContext()` with try/finally:

| Service | enter/exit | runInBoundaryScope |
|---------|-----------|-------------------|
| ai_client.ts (orchestrator) | YES (L35-40) | No (caller's scope) |
| llm/provider.ts | YES (L66,102 / L155,221) | No (caller's scope) |
| justification_service.ts | YES (L124,153) | No |
| variance_chat_service.ts | YES (L113,149) | No |
| export_service.ts | YES (L155,186) | No |
| agentic_onboarding.ts | YES (L62,102 / L130,170) | YES (L61,129) |
| policy_inference_agentic.ts | YES (L52,67) | YES (L51) |
| revenue_recognition_service.ts | YES (L190,221 / L431,449 / L488,515) | YES (L189,430,487) |
| ai_account_analyzer_service.ts | YES (L124,172) | YES (L123) |

### Gaps
None. Every AI-calling service is wrapped. The Express middleware ensures every HTTP request has a boundary scope. Background jobs also use `runInBoundaryScope`.

---

## 5. KNOWLEDGE BASE -- Grade: B+

### Architecture
Three-tier hierarchy:
- **Tier 1 (Global)**: FASB/IFRS/Tax standards. Hardcoded Tax IRC chunks (3 entries: IRC 162, 263, 461). FASB/IFRS handbook is QUARANTINED (commented out, `rag_handbook` not in MVP).
- **Tier 2 (Firm)**: Chart of Accounts, historical policies, invoice treatments. In-memory storage.
- **Tier 3 (Session)**: Uploaded files. In-memory storage.

### Search Methods
1. **pgvector semantic search** (`src/knowledge_base/vector_store/pg_vector_store.ts`): Cosine similarity on `knowledge_embeddings` table. Embedding via OpenAI `text-embedding-3-small` (1536 dim) or local `all-MiniLM-L6-v2` (384 dim).
2. **BM25 keyword scoring** (`src/knowledge_base/hybrid_search.ts`): TF-IDF-inspired BM25 with standard k1=1.2, b=0.75.
3. **Hybrid blend**: alpha=0.6 semantic + 0.4 BM25 for global tier; pure BM25 for firm/session.
4. **XBRL taxonomy search** (`src/services/xbrl_search_service.ts`): pg_trgm trigram similarity on `xbrl_taxonomy_elements`. Used by classifier to suggest XBRL elements.

### How AI Accesses GAAP Knowledge
The orchestrator (`ai_orchestrator.ts`) calls:
- `queryKbForJustifier()` -- pgvector primary, `queryGlobal` keyword fallback, merges both
- `queryKbForShadowAuditor()` -- `searchFinancialMemory()` (BM25 on in-memory)
- `queryKbForClassifier()` -- `searchFinancialMemory()` (firm tier, BM25)

Results are injected as `standards_snippets` into the prompts.

### XBRL Integration
The classifier prompt receives XBRL search results per account via `buildXBRLContext()` and `buildXBRLContextCompact()`, showing top matches with similarity scores and documentation snippets.

### Gaps
- **FASB/IFRS handbook is QUARANTINED** -- `handbookToMemoryEntries()` returns `[]`. The system relies entirely on pgvector seed data (`gaap_seed_data.ts`) and the hardcoded standards snippets (`standards_snippets*.ts`). If the vector store is not seeded, prompts get only 7 generic snippets.
- Tier 2 (Firm) and Tier 3 (Session) are in-memory only -- no persistence across restarts. `disallowMemoryStoreInProduction()` prevents this in production, but it means Tier 2/3 are effectively disabled in production unless DB-backed alternatives exist elsewhere.
- Only 3 Tax IRC entries hardcoded. Tax coverage is minimal.
- No cache invalidation strategy for `cachedGlobal` in `tier1_global.ts`.

---

## 6. FAIL BEHAVIOR -- Grade: A

### Fail-Open Design (Consistent)
Every AI pillar follows the same pattern -- AI failure returns a degraded but non-blocking result:

| Pillar | On AI Failure | Blocks Process? |
|--------|--------------|-----------------|
| Justifier | Returns placeholder memo: "AI justification could not be generated" | NO |
| Shadow Auditor | Returns `severity: 'warn'` with `AI_FAILED` finding code | NO |
| Classifier | Returns empty `results: []` | NO |
| Advisor | Returns empty `proposals: []` | NO |
| Resolution Agent | Retries 3x, then returns `ok: false` | NO |

### Retry Logic
- **Resolution Agent** (`src/ai/resolution_agent.ts`): Plan-Execute-Verify loop with `MAX_RETRIES = 3`. Prior errors fed back to AI in re-plan phase.
- **Variance Chat** (`src/services/variance_chat_service.ts`): One retry with provenance warning. Falls back to deterministic template on second failure.
- **Claude Adapter** (`src/ai/adapters/claude_adapter.ts`): Timeout via `Promise.race()` with configurable `AI_TIMEOUT_MS` (default 15s, 30s for chat).
- **All LLM calls via `callLLMWithFallback`**: Built-in fallback mechanism (agentic_onboarding, policy_inference, revenue_recognition, ai_account_analyzer).

### Deterministic Fallbacks
- `agentic_onboarding.ts`: Falls back to rule-based `classifyAccount()` (deterministic account type classifier)
- `revenue_recognition_service.ts`: Falls back to `linearSchedule()` (deterministic straight-line recognition)
- `variance_chat_service.ts`: Falls back to `buildTemplateFallback()` (deterministic narrative from data)
- `policy_inference_agentic.ts`: Falls back to empty proposals `[]`

### Gaps
- No circuit breaker pattern. If the AI provider is down, every request will wait for timeout (15s) before falling back. This could cause latency spikes under load.

---

## 7. OBSERVABILITY -- Grade: B+

### What Is Logged (`ai_call_log_repository.ts`)
Every AI call via `callAIWithSchema()` logs to the `ai_call_log` table:

| Field | Logged? |
|-------|---------|
| tenant_id | YES |
| pillar | YES (justifier, shadow_auditor, classifier, advisor, resolution_agent, investigation_chat) |
| prompt_version | YES |
| model | YES |
| request_json | YES (sanitized, no secrets) |
| response_raw | YES (full raw text) |
| response_json | YES (parsed JSON) |
| ok | YES (boolean) |
| error | YES (error message) |
| latency_ms | YES |
| input_tokens | YES |
| output_tokens | YES |
| estimated_cost_usd | YES |

Cost estimation uses Claude Sonnet 4 pricing: $3/M input, $15/M output.

### Gaps
- **No dashboard or API to query AI performance.** The `ai_call_log` table exists but there are no endpoints to aggregate latency, cost, error rates, or model drift metrics.
- **Confidence is not logged at the call level.** The parsed output may contain confidence, but the `ai_call_log` schema does not have a dedicated `confidence` column.
- **Services that bypass the orchestrator** (variance_chat, justification_service RAG path, export_service, agentic_onboarding, policy_inference, revenue_recognition, ai_account_analyzer) call `callClaude` or `callLLMWithFallback` directly and may not all log through `insertCallLog`. Variance chat does log (lines 126-140). The others using `callLLMWithFallback` do NOT log to `ai_call_log`.
- Missing: services using `callLLMWithFallback` -- agentic_onboarding, policy_inference_agentic, revenue_recognition_service (LLM paths), ai_account_analyzer_service -- have NO call logging to `ai_call_log`.

---

## 8. MULTI-PILLAR ARCHITECTURE -- Grade: A-

### Pillars (9 Distinct AI Agents)

| # | Pillar | File | Purpose |
|---|--------|------|---------|
| 1 | **Justifier** | `ai_orchestrator.ts:runJustifier` | IRAC memo generation for journal entries, adjustments, exports |
| 2 | **Shadow Auditor** | `ai_orchestrator.ts:runShadowAudit` | Pre-post checks on JEs -- flag policy/compliance issues |
| 3 | **Classifier** | `ai_orchestrator.ts:runClassifier` | Account classification -- object_type, fs_placement, XBRL mapping |
| 4 | **Advisor** | `ai_orchestrator.ts:runAdvisor` | Propose reclass, accrual/deferral candidates, mapping fixes |
| 5 | **Resolution Agent** | `resolution_agent.ts:runResolutionAgent` | Plan-Execute-Verify loop for financial events (variances, recon issues) |
| 6 | **Investigation Chat** | `variance_chat_service.ts` | Conversational variance narration with number provenance |
| 7 | **Agentic Onboarding** | `agentic_onboarding.ts` | CoA mapping suggestions, first-close guide |
| 8 | **Policy Inference** | `policy_inference_agentic.ts` | Suggest accounting policy changes based on statements + issues |
| 9 | **AI Account Analyzer** | `ai_account_analyzer_service.ts` | Pass 2 analysis for ambiguous GL accounts (verdict, suspicious entries) |

Additional AI-adjacent services:
- **Revenue Recognition** (`revenue_recognition_service.ts`): AI-suggested allocation and recognition schedules
- **Export Service** (`export_service.ts`): AI-drafted narrative sections for PDF reports
- **SLM Classification** (`ai_classification_service.ts`): Calls external Python SLM microservice for COA/CF classification (separate from the Classifier pillar)

### Independence vs. Coordination
- Pillars 1-4 share the `ai_orchestrator.ts` orchestrator, use the same `callAIWithSchema` client, and share the knowledge base.
- Pillar 5 (Resolution Agent) has its own Plan-Execute-Verify loop but uses the same `callAIWithSchema` client and knowledge base.
- Pillars 6-9 operate independently, using `callClaude` or `callLLMWithFallback` directly.
- **No cross-pillar context sharing.** Each pillar operates on its own input data. The shadow auditor does not see classifier results; the advisor does not see justifier output.
- **HITL is the coordination point.** The Resolution Agent submits proposals to HITL staging, which requires human approval before any mutation occurs.

### Gaps
- No orchestrator that coordinates multiple pillars in a single workflow (e.g., "classify, then advise, then justify"). Each pillar is invoked independently by the calling service.
- The SLM microservice (Python) and the Classifier pillar (Claude) are parallel paths for the same task (account classification) with no unified decision logic.

---

## Summary Grade Card

| Area | Grade | Key Strength | Key Gap |
|------|-------|-------------|---------|
| 1. AI Boundary | **A** | AsyncLocalStorage + type barrier + mutation assertions | enterAdvisoryContext silently no-ops without store |
| 2. Prompt Quality | **A-** | Few-shot examples, ALLOWED/FORBIDDEN lists, JSON schema | Resolution agent missing few-shot |
| 3. Output Validation | **A-** | Zod schemas + numeric guardrail + number provenance | shadow_auditor_service.ts MISSING guardrail call |
| 4. Advisory Context | **A** | 100% coverage across all AI services | None |
| 5. Knowledge Base | **B+** | pgvector + BM25 hybrid, XBRL taxonomy, 3-tier design | FASB/IFRS handbook quarantined, only 3 Tax entries |
| 6. Fail Behavior | **A** | Consistent fail-open, deterministic fallbacks, retries | No circuit breaker |
| 7. Observability | **B+** | Comprehensive call log (latency, tokens, cost) | No dashboard API, services via callLLMWithFallback not logged |
| 8. Multi-Pillar Architecture | **A-** | 9 distinct pillars, clear separation of concerns | No cross-pillar orchestration, parallel SLM/Claude paths |

---

## Critical Findings (Action Required)

### P0: Missing Guardrail on Shadow Auditor Service
- **File**: `src/services/shadow_auditor_service.ts`
- **Line**: 164-169
- **Issue**: AI findings from `runShadowAudit()` are stored without `assertNoNumericAmountsInAgentOutput()`. The Zod schema validates structure but does not prevent the AI from inventing dollar amounts in `message` fields.
- **Fix**: Add `assertNoNumericAmountsInAgentOutput()` call on `aiResult.findings` before constructing `aiItems`.

### P1: Non-Orchestrator Services Missing Call Logging
- **Files**: `agentic_onboarding.ts`, `policy_inference_agentic.ts`, `revenue_recognition_service.ts` (LLM paths), `ai_account_analyzer_service.ts`
- **Issue**: These services use `callLLMWithFallback()` which does not log to `ai_call_log`. Token usage, latency, and cost are not tracked.
- **Fix**: Add `insertCallLog` calls or route through `callAIWithSchema`.

### P2: Knowledge Base FASB/IFRS Content Gap
- **File**: `src/knowledge_base/tiers/tier1_global.ts`
- **Issue**: `handbookToMemoryEntries()` returns `[]`. The system depends entirely on pgvector seed data. If not seeded, prompts get only 7 generic snippets from `standards_snippets.ts`.
- **Fix**: Ensure pgvector is seeded with `gaap_seed_data.ts` in production, or un-quarantine the handbook integration.
