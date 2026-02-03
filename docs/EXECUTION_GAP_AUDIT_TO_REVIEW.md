# To Review — Execution Gap Audit (Lead Systems Architect)

**Status:** To Review  
**Date:** 2025-01-31  
**Scope:** Agent-layer vs Service-layer; Deterministic vs Agentic; Grounding, Handover, Dual-Supervisor, State Persistence, Verification.

---

# Execution Gap Audit — Lead Systems Architect

## 1. The Grounding Bug

**Confirmed:** `src/agents/Supervisor.ts` uses `${DATA_GROUNDING_RULE}` in `SYSTEM_PROMPT` (line 33) but **does not import** `DATA_GROUNDING_RULE`. There is no `import { DATA_GROUNDING_RULE } from '../llm/guardrails.js';`.

- At runtime, `DATA_GROUNDING_RULE` is **undefined**, so the prompt gets the literal string `"undefined"`.
- **Effect:** The Agentic Supervisor (used by `/api/supervisor/chat-verified`) is not constrained by the data-grounding rule. Deterministic services still validate with Zod and only use provided data, but the **agent** is not instructed to “base your response only on the data provided… do not invent facts, amounts, accounts.” So the agent can:
  - Invent trial balance entries when the user message only describes data.
  - Fabricate amounts or accounts in tool calls (e.g. `buildFinancialStatements` with made-up `entries`).
  - Bypass the same data constraints that deterministic flows enforce via validation and structured inputs.

---

## 2. Deterministic vs. Agentic Handover

**buildFinancialStatements**

- **Deterministic:** Tool implementation uses `buildFinancialStatementsSchema.parse(input)` and `parseTrialBalance(parsed.entries)` — a typed, validated Source of Truth **inside** the tool.
- **Agentic:** The agent is given a **string** in the user message:  
  `"[Trial balance entries available: ${input.entries.length} rows. Use buildFinancialStatements with these entries...]"`  
  The **actual entries are not** passed as a server-injected object. The LLM must “remember” and fill the tool call with `entries: [...]`. So:
  - The agent is **reading** a string (and possibly inventing or truncating entries).
  - There is **no shared typed interface** that forces the agent to receive a **validated** trial balance; validation happens only **after** the agent’s tool input.
- **Missing:** A single **Source of Truth** (e.g. shared Zod schema + server-injected `entries` in context) so the tool is always called with deterministic, validated data instead of LLM-generated JSON.

**Accruals**

- **Deterministic:** `buildAccrualSuggestions(input)` uses `AccrualSuggestionInput`: `periodEnd`, `openArAmount`, `openApAmount`, `payrollAccrualAmount`.
- **Agentic:** `suggestAccrualsAgentic(input)` builds a **string** prompt from those fields plus `input.context` and sends it to the LLM. There is **no trial balance** in the API or type:
  - `accrualSuggestionsSchema` has `periodEnd`, `openAR` (array), `openAP` (array), `payrollData` — **no trial balance**.
  - `AccrualSuggestionInput` has `context?: string` — free text only.
- So the agentic path is **reading a string** (context + a few numbers). There is **no typed interface** (e.g. shared Zod schema for “validated trial balance for accruals”) between deterministic close data and the agentic suggestion call. The LLM can suggest amounts/accounts not grounded in the actual TB.

**Summary:** In both buildFinancialStatements and accruals, the Agentic side is not forced to use a validated Source of Truth object; it relies on strings and LLM-produced JSON. A shared Zod schema and middleware that inject deterministic data into every agentic tool call would close this gap.

---

## 3. Dual-Supervisor Conflict (Year-End Close)

| Concern | agents/Supervisor.ts | services/supervisor_agent.ts |
|--------|----------------------|------------------------------|
| **Used by** | POST `/api/supervisor/chat-verified` | POST `/api/supervisor/chat` |
| **Tools** | classifyAccount, buildFinancialStatements, computeRatios, forensicRescan, semantic memory, reconcileCPAwithCFA | list_datasets, query_dataset, resolve_query_intent, summarize_query_result, **step1CPA**, **step2CFA**, **step3Supervisor**, getPortfolioFinalizationPolicy |
| **Input** | `entries` from `body.raw_rows` (mapped once at route) | `pipelineInput` (raw_rows or statements) from body |
| **Year-end close** | Not used by close routes. Used for “ask a question + optional raw_rows” with Skeptic. | Not used by close routes directly. Used for ad-hoc chat; step1/2/3 are **tools** the LLM may call. |

**Where Year-End Close is actually handled**

- **Deterministic (hard-coded):**
  - Trial balance ingest: `routes/trialBalance.ts` → `parseTrialBalance` / `buildFinancialStatements` / `runPlanExecuteVerifyAgentic` → `markUploadCompleted` → `runResultPipeline` → **step1CPA, step2CFA, step3Supervisor** in `result_generator.ts` (no ReAct).
  - Close checklist, adjustments, accruals, lock, etc.: `routes/close.ts` + various services (month_end_close_service, close_adjustments_service, accrual_deferral_service, etc.).

- **Agentic (ReAct):**
  - **agents/Supervisor.ts:** ReAct loop with full toolbox; used only by `/chat-verified` for Q&A with optional raw_rows.
  - **services/supervisor_agent.ts:** ReAct loop with step1CPA/step2CFA/step3Supervisor as **tools**; used only by `/chat` for conversational use.

**Duplication**

- **step1CPA / step2CFA / step3Supervisor** exist in two places:
  1. **Deterministic:** `result_generator.step1CPA`, `step2CFA`, `step3Supervisor` — called in sequence by `runResultPipeline` after ingest.
  2. **Agentic:** `supervisor_tools.executeTool('step1CPA'|'step2CFA'|'step3Supervisor')` — calls the **same** `result_generator` functions, but the **trigger** is the LLM choosing to call the tool.

So the **logic** is shared (result_generator), but there are **two entry points** (pipeline vs ReAct) and **two different tool sets and prompts** (buildFinancialStatements vs step1CPA, etc.). That is the dual-Supervisor conflict: two stacks, two entrypoints, no single state machine for “year-end close + chat.”

**Contradiction**

- **chat-verified** uses agents/Supervisor (buildFinancialStatements, computeRatios, reconcileCPAwithCFA, forensicRescan).
- **chat** uses supervisor_agent (step1CPA, step2CFA, step3Supervisor).
- Same “build statements then ratios then memo” idea is implemented with different tool names and flows; behavior can diverge (e.g. one path has Skeptic, the other has step3 conflict detection).

---

## 4. State Persistence Failure

**In-memory usage (not in routes, but used by flows they trigger):**

| Location | Store | Purpose |
|----------|--------|--------|
| `services/hitl_orchestrator.ts` | `stagingStore = new Map<string, StagingItem>()` | HITL staging items (pending/approved/rejected). |
| `services/result_generator.ts` | `uploadStatus`, `onCompletedCallbacks` | Upload status and pipeline trigger callbacks. |
| `knowledge_base/tiers/tier3_session.ts` | `sessionUploads = new Map<string, SessionUpload[]>()` | Session-scoped uploads for financial memory. |

**routes/supervisor.ts**

- No Map in the route file. It forwards `pipelineInput` / `raw_rows` from the request body to `runSupervisorChat` or `runSupervisorWithSkeptic`. Each request is stateless; there is no session store in the route.

**routes/trialBalance.ts**

- No Map in the route file. It uses Postgres (e.g. getUnadjustedOrRollup, getAdjustedTrialBalance, period_financial_data_state, close adjustments, etc.).

**Why state drifts**

- **Deterministic state** (period close, adjustments, trial balance, lock) lives in **Postgres** (tenant_close_*, period_close_*, trial balance tables, etc.).
- **Agentic/session state** lives **in memory**: HITL staging, upload status/callbacks, session uploads.
- On **restart or scale-out**:
  - HITL staging and session uploads are lost; DB still has “close in progress” or “adjustments posted.”
  - Callbacks registered in `result_generator` are lost.
- During **long-running** tasks (e.g. ingest → pipeline → HITL), the DB may show “completed” or “locked” while the in-memory staging list or session context is empty or stale. So deterministic (DB) and agentic/session (memory) state **drift** and you cannot safely “pause/resume” or reconcile HITL with close status.

---

## 5. Verification Logic — Hard Gate?

**Deterministic Plan-Execute-Verify (PEV):**

- Used in: `agentic_plan_execute_verify.runPlanExecuteVerifyAgentic` (ingest/statements), and inside `forensicRescan` via `runPlanExecuteVerifyAgentic`.
- Returns `verification.passed` and `verification.checks`; result is attached to the output (e.g. `reasoningChain`).

**Agentic Skeptic (auditor_agent):**

- `runSkepticReview(report)` reviews the Supervisor’s **text** report and tool results; outputs FINDING or NO_ISSUE. If there is a finding, `runDiscussion` produces a consensus and `finalReport`.

**Is there a Hard Gate?**

- **No.** There is no code path that:
  - Passes the **deterministic** PEV result (`verification.passed === false`) into the Skeptic, or
  - **Blocks** the Agentic response when PEV fails.
- Ingest still returns 200 with `reasoningChain.verification.passed === false`; the UI can show it, but the API does not refuse to return. The Skeptic does not see PEV outcome; it only sees the Supervisor’s report and tool calls. So the Agentic service **can** return a result even when Deterministic verification has failed — no hard gate ties the two together.

---

# Deliverables

## 1. Convergence Map — Single State Machine for Both Supervisors

Unify the two stacks into one state machine: one “Supervisor” that can run in **pipeline mode** (deterministic, after ingest) or **chat mode** (ReAct), with a single tool set and a single notion of state.

```
                    ┌─────────────────────────────────────────────────────────┐
                    │              UNIFIED SUPERVISOR STATE MACHINE            │
                    └─────────────────────────────────────────────────────────┘
                                              │
          ┌───────────────────────────────────┼───────────────────────────────────┐
          ▼                                   ▼                                   ▼
   ┌──────────────┐                   ┌──────────────┐                   ┌──────────────┐
   │   IDLE       │                   │  PIPELINE    │                   │  CHAT        │
   │              │  ingest/trigger   │  (Determin.) │  user message    │  (ReAct)     │
   │              │ ────────────────► │              │ ◄─────────────── │              │
   │              │                   │ step1→2→3   │                   │ same tools  │
   │              │                   │ in order   │                   │ step1CPA,    │
   │              │                   │              │                   │ step2CFA,    │
   │              │ ◄──────────────── │              │ ─────────────────►│ step3Supervisor
   │              │  pipeline done    │              │  tool results     │ + catalog    │
   │              │                   │              │                   │ + reconcile  │
   └──────────────┘                   └──────────────┘                   └──────────────┘
          │                                   │                                   │
          │                                   │  verification.passed?             │
          │                                   ▼                                   ▼
          │                            ┌──────────────┐                   ┌──────────────┐
          │                            │  VERIFY      │                   │  SKEPTIC    │
          │                            │  (PEV)       │                   │  (optional  │
          │                            │  Hard gate   │                   │   for chat) │
          │                            │  block if    │                   │             │
          │                            │  !passed     │                   │             │
          │                            └──────────────┘                   └──────────────┘
          │                                   │                                   │
          └───────────────────────────────────┴───────────────────────────────────┘
                                              │
                                    Single tool set (step1CPA = buildFinancialStatements
                                    under the hood); single context type (PipelineInput
                                    or validated TrialBalanceSourceOfTruth).
```

**Concrete convergence steps:**

1. **Single entrypoint:** One Supervisor module that accepts either `{ mode: 'pipeline', input: PipelineInput }` or `{ mode: 'chat', message: string, context?: SupervisorContext }`. Pipeline mode runs step1 → step2 → step3 without ReAct; chat mode runs ReAct with the **same** tools (step1CPA, step2CFA, step3Supervisor, plus catalog + reconcile).
2. **Retire agents/Supervisor.ts “full toolbox” for chat:** Use the same step1/2/3 tools as the pipeline so there is one tool set and one Source of Truth for “statements + ratios + memo.”
3. **Single Source of Truth:** All tools that need trial balance receive it from **context** (injected by middleware), not from the LLM’s tool arguments. The LLM can omit `raw_rows`; the runtime injects `context.validatedTrialBalance` when calling step1CPA/buildFinancialStatements.
4. **Hard gate:** After step1 (or buildFinancialStatements), if `reasoningChain.verification.passed === false`, do not proceed to step2/step3 and do not return a successful “final” result; return a structured error and optional suggestions instead.

---

## 2. Bridge Fix — DATA_GROUNDING_RULE Import + Middleware for Deterministic Data Injection

**2a. Fix the grounding bug in `src/agents/Supervisor.ts`**

Add at the top with other imports:

```ts
import { DATA_GROUNDING_RULE } from '../llm/guardrails.js';
```

No other change needed; `SYSTEM_PROMPT` already uses `${DATA_GROUNDING_RULE}`.

**2b. Middleware pattern: inject deterministic Source of Truth into every Agentic tool call**

Concept: the route (or a wrapper around the Supervisor) attaches a **validated** trial balance (and optionally period/tenant) to the request context. The tool executor **merges** this into tool inputs when the tool is “buildFinancialStatements” or “step1CPA” so the LLM cannot override with fabricated entries.

**Step 1 — Shared type and schema (e.g. in `src/types/supervisor_context.ts` or existing types):**

```ts
// Source of Truth: validated trial balance that the agent MUST use when present.
import { z } from 'zod';

export const TrialBalanceSourceOfTruthSchema = z.object({
  entries: z.array(z.object({
    accountName: z.string(),
    debit: z.number(),
    credit: z.number(),
    accountCode: z.string().optional(),
  })).min(1),
  periodLabel: z.string().optional(),
  tenantId: z.string().optional(),
});
export type TrialBalanceSourceOfTruth = z.infer<typeof TrialBalanceSourceOfTruthSchema>;
```

**Step 2 — Middleware that attaches validated TB to request (e.g. in `src/middleware/supervisor_context.ts`):**

```ts
import type { Request, Response, NextFunction } from 'express';
import { TrialBalanceSourceOfTruthSchema } from '../types/supervisor_context.js';

declare global {
  namespace Express {
    interface Request {
      supervisorContext?: {
        validatedTrialBalance?: TrialBalanceSourceOfTruth;
        tenantId?: string;
        pool?: import('pg').Pool;
      };
    }
  }
}

/**
 * Injects deterministic Source of Truth into request for Agentic tools.
 * Call this before routes that run the Supervisor so tools can use validated data.
 */
export function injectSupervisorContext(req: Request, _res: Response, next: NextFunction): void {
  const body = req.body as { raw_rows?: unknown[]; pipeline_input?: { type: string; rawRows?: unknown[] } };
  let validatedTrialBalance: TrialBalanceSourceOfTruth | undefined;

  if (body?.pipeline_input?.type === 'raw_rows' && Array.isArray(body.pipeline_input.rawRows) && body.pipeline_input.rawRows.length > 0) {
    const parsed = TrialBalanceSourceOfTruthSchema.safeParse({ entries: body.pipeline_input.rawRows });
    if (parsed.success) validatedTrialBalance = parsed.data;
  } else if (Array.isArray(body?.raw_rows) && body.raw_rows.length > 0) {
    const parsed = TrialBalanceSourceOfTruthSchema.safeParse({ entries: body.raw_rows });
    if (parsed.success) validatedTrialBalance = parsed.data;
  }

  req.supervisorContext = {
    ...(validatedTrialBalance && { validatedTrialBalance }),
    tenantId: (req as { tenantId?: string }).tenantId,
    pool: (req as { tenantPool?: import('pg').Pool }).tenantPool,
  };
  next();
}
```

**Step 3 — Tool executor: use validated TB when present (e.g. in `executeTool` for buildFinancialStatements / step1CPA):**

When executing `buildFinancialStatements` or `get_financial_statements` or `step1CPA`:

- If `context.validatedTrialBalance` (or `req.supervisorContext.validatedTrialBalance` passed into context) is set, call the tool with `entries: context.validatedTrialBalance.entries` and **ignore** any `entries` supplied by the LLM (or merge only if you want to allow “additional” entries in future).
- That way the Deterministic service **forces** the Agentic tool to use a validated Source of Truth instead of the model’s string-derived JSON.

Apply the same pattern for accruals: add an optional `validatedTrialBalanceSummary` (or similar) to the close context and pass it into `suggestAccrualsAgentic` so the LLM prompt is built from a typed object (e.g. TB totals or key line items) rather than only a free-text `context` string.

---

## 3. Persistence Strategy — SQL Schema for HITL and Session State (Pause/Resume)

Moving HITL staging and session state into Postgres allows commercial pause/resume and aligns agentic state with deterministic (DB) state.

```sql
-- =============================================================================
-- HITL staging and session state in Postgres (for Pause/Resume and multi-instance)
-- =============================================================================

-- HITL staging items (replace in-memory Map in hitl_orchestrator)
CREATE TABLE IF NOT EXISTS tenant_hitl_staging (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  proposed_action   TEXT NOT NULL,
  justification     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  type              TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('journal_entry','policy_change','adjustment','flag_override','other')),
  amount            NUMERIC(18,4) NULL,
  payload           JSONB NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ NULL,
  approved_by       TEXT NULL,
  rejected_at       TIMESTAMPTZ NULL,
  rejected_reason   TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_hitl_staging_tenant_status
  ON tenant_hitl_staging(tenant_id, status);

-- Session state for Supervisor/agentic chat (conversation + pipeline context)
CREATE TABLE IF NOT EXISTS tenant_supervisor_sessions (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  user_id           TEXT NULL,
  mode              TEXT NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat','pipeline')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','failed')),
  pipeline_input_snapshot JSONB NULL,   -- validated TB or statements snapshot for resume
  last_step         TEXT NULL,          -- e.g. step1CPA, step2CFA, step3Supervisor
  last_result_summary TEXT NULL,
  message_history   JSONB NULL,        -- messages[] for ReAct resume (truncate for size)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_supervisor_sessions_tenant_status
  ON tenant_supervisor_sessions(tenant_id, status);

-- Optional: session uploads (replace tier3_session Map) for persistence across restarts
CREATE TABLE IF NOT EXISTS tenant_session_uploads (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  filename          TEXT NOT NULL,
  content_type      TEXT NULL,
  summary_text      TEXT NULL,
  metadata          JSONB NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_session_uploads_session
  ON tenant_session_uploads(tenant_id, session_id);
```

**Usage:**

- **HITL:** `submitToStaging` inserts into `tenant_hitl_staging`; `getStagingItems` / `resolveStagingItem` read/update by `id` and `tenant_id`. On restart or another instance, pending items are still available.
- **Pause/Resume:** When starting a Supervisor run (chat or pipeline), create or reuse a row in `tenant_supervisor_sessions` with `status = 'active'` and store `pipeline_input_snapshot` (e.g. validated TB). On each step, update `last_step`, `last_result_summary`, and optionally `message_history`. To pause, set `status = 'paused'`. To resume, load the session by `id`, restore `pipeline_input_snapshot` and optionally `message_history`, and continue from `last_step`.
- **Session uploads:** Replace `sessionUploads.get(sessionId)` with a query on `tenant_session_uploads` by `tenant_id` and `session_id` so uploads survive restarts.

This gives you a single place (Postgres) for both deterministic close state and agentic/HITL/session state, and a clear path to Pause/Resume and multi-instance support.
