# Tracing Issues — Conversation and Changes Since "Zombie Logic" Prompt

This document records the conversation and all code changes made from the **"Zombie Logic" investigation prompt** through the latest messages, including where to look for trace logs and which files reference `month_end_close`.

---

## 1. Original Prompt (Zombie Logic Investigation)

The user reported that the system was still defaulting to `month_end_close` and crashing despite repeated instructions to use the forensic strategy for "Full Audit" and HUD requests. The goal was to find the "Zombie Logic" hijacking the flow **without fixing logic yet**.

**Requested actions:**

1. **Print and Die Test** — In `src/services/unified_orchestrator.ts` (or wherever strategy is determined): at the very beginning of the function that determines strategy, add a `console.log` that prints the incoming message and the inferred strategy. If the message contains `'Audit'`, throw `new Error('STRATEGY TRACE: I am about to select ' + strategyVariable)` so the error appears in the terminal and proves the code path is hit.

2. **Hard-Code the Override (Debugging)** — Temporarily comment out the entire inference logic and force the function to return `'forensic'` regardless of input. If the app still crashes with `MathematicalIntegrityError` without entering the Supervisor loop, routing is happening elsewhere (e.g. `src/server.ts` or `src/routes/supervisor.ts`).

3. **Locate the Ghost Router** — Search the codebase for the string `month_end_close` and identify every file that references this strategy. Confirm whether the Diagnostic HUD route might be calling a different service than the one being edited.

4. **Verify Supervisor Entry** — In `src/agents/Supervisor.ts`, add `console.log('--- SUPERVISOR ACTIVATED ---')` at the very top of the `runSupervisor` function.

---

## 2. Changes Made (Chronological)

### 2.1 Unified Orchestrator — Print and Die + Hard-Code Forensic

**File:** `src/services/unified_orchestrator.ts`

- **Inference logic commented out** — The block that computed `mustUseForensic` and the ternary assigning `strategy` was commented out.
- **Strategy forced to `'forensic'`** — `const strategy: TaskStrategy = 'forensic';` was added so the deterministic pipeline (`month_end_close`) never runs for debugging.
- **STRATEGY TRACE log added** — `console.log('STRATEGY TRACE: incoming message:', message, '| strategy (forced for debug):', strategy);` runs at the start of strategy handling.
- **Print and Die throw added** — `if (message.includes('Audit')) { throw new Error('STRATEGY TRACE: I am about to select ' + strategy); }` was added so that when the message contains "Audit", the process throws and the error appears in the Node terminal (proving this file is hit).
- **TRACE 1 retained** — `console.log('TRACE 1: Orchestrator received request with strategy:', strategy);` remains after the strategy assignment.

**Later change:** The throw was **commented out** so the request could continue and the user could see `--- SUPERVISOR ACTIVATED ---` and subsequent traces without the process exiting. The comment explains: "DEBUG: throw removed so you can see --- SUPERVISOR ACTIVATED --- in terminal. Uncomment to force-fail and prove this path is hit."

### 2.2 Supervisor — SUPERVISOR ACTIVATED Log

**File:** `src/agents/Supervisor.ts`

- At the very top of the `runSupervisor` function body (first executable line):  
  `console.log('--- SUPERVISOR ACTIVATED ---');`  
  This confirms that the Supervisor Agent path was entered.

### 2.3 Route Logs — Ingest and Supervisor Chat

**Goal:** Make it obvious in the Node terminal when a request hits the API, so the user can tell whether the HUD is calling the supervisor at all.

**File:** `src/routes/trial-balance/ingest.ts`

- At the start of the POST `/ingest` handler (right after `try {`):  
  `console.log('POST /api/trial-balance/ingest received, file:', req.file?.originalname ?? 'none');`  
  So any file upload from the HUD produces a line in the Node terminal.

**File:** `src/routes/supervisor.ts`

- After parsing `message` in the POST `/chat` handler:  
  `console.log('POST /api/supervisor/chat received, message:', message.substring(0, 80), '| raw_rows:', Array.isArray(body?.raw_rows) ? body.raw_rows.length : 0);`  
  So when the HUD calls `/api/supervisor/chat`, a line appears in the Node terminal. If this never appears, the HUD is not calling the supervisor (e.g. ingest returned 422 and the HUD returned early).

### 2.4 Other Trace Points Already Present

- **TRACE 2** — `src/agents/tools/index.ts`: inside the `buildFinancialStatements` / `get_financial_statements` case, in the `catch` around `runBuildFinancialStatements`: `console.log('TRACE 2: Hard Crash in Tool Execution:', ...)`. Only appears if the tool throws instead of returning a soft failure.
- **TRACE 3** — `src/agents/Supervisor.ts`: before each `client.messages.create` call: `console.log('TRACE 3: Sending the following data to Claude:', ...)`. Confirms the agent is sending a request to the LLM.
- **TRACE 4** — `src/agents/Supervisor.ts`: at the start of `fireReasoningStep`: `console.log('TRACE 4: fireReasoningStep', ...)`. Confirms reasoning steps are being fired (thought/tool).

---

## 3. Conversation Flow After the Prompt

- **Where to see logs** — User was told that all trace logs go to the **Node API** process stdout (the terminal where `npm run dev` runs for the FinOS Agent on port 3001). Python and frontend terminals do not show these traces.
- **Node not responding / terminal not moving** — Investigation showed the Node API process had **ended** (terminal log showed `ended_at`; nothing was listening on port 3001). All three services were restarted so the user could test again.
- **Still nothing in terminal** — User reported only seeing the startup output (route list) and no new lines. To make request flow visible: (1) the intentional throw in the orchestrator was commented out so the process would not exit, and (2) the route-level logs above were added for ingest and supervisor/chat. User was told to restart the Node API and run the HUD flow again; they asked for a restart and all three services were restarted.

---

## 4. Every File Where `month_end_close` Is Mentioned

| File | How `month_end_close` is used |
|------|-------------------------------|
| **`src/services/unified_orchestrator.ts`** | **Strategy logic:** `TaskStrategy` type; `inferTaskStrategy()` can return `'month_end_close'`; `runUnifiedSupervisor()` assigns `strategy` (including `'month_end_close'`) and runs `runResultPipeline()` when `strategy === 'month_end_close'`; return type includes `strategy: 'month_end_close'`. This is the **only** place that decides or uses the pipeline strategy for the supervisor flow. |
| **`src/routes/supervisor.ts`** | Does **not** reference the string `month_end_close`. Only calls `runUnifiedSupervisor(...)` and branches on `'pipelineResult' in out`. |
| **`src/server.ts`** | Does **not** reference `month_end_close`. Only logs route list at startup. |
| **`docs/TRACE_LOGS_GUIDE.md`** | Documentation: TRACE 1 and when strategy is month_end_close. |
| **`docs/FAILURE_1.md`** | Documentation: describes the month_end_close hijack and deterministic pipeline crash. |
| **`docs/CTO_CHECK.md`** | Documentation: flow diagram mentioning month_end_close. |
| **`docs/EXECUTION_GAP_AUDIT_TO_REVIEW.md`** | Documentation: mentions month_end_close_service. |
| **`docs/ROADMAP_STATUS.md`** | Documentation: mentions month_end_close. |
| **`src/services/close_checklist_template_service.ts`** | Imports **`month_end_close_service`** (different module — close checklist), not the strategy string. |
| **`src/services/checklist_store_service.ts`** | Imports **`month_end_close_service`**. |
| **`src/routes/close/close_checklist.ts`** | Imports **`month_end_close_service`**. |
| **`src/routes/close/close_je_accruals.ts`** | Imports **`month_end_close_service`**. |

**Conclusion:** The **strategy value** `'month_end_close'` and the code path that runs the deterministic pipeline (and can crash before the Supervisor) exist **only** in **`src/services/unified_orchestrator.ts`**. The Diagnostic HUD’s `/api/supervisor/chat` request is handled only by `src/routes/supervisor.ts` → `runUnifiedSupervisor()`; there is no other "ghost" router for this flow.

---

## 5. Which TRACE Logs Appear When You Run the Test

Because the test is run locally, the exact terminal output depends on whether the HUD calls the supervisor. The following is what **should** appear in the **Node API terminal** (the one showing `FinOS Agent API listening on http://localhost:3001`) when you run the Diagnostic HUD flow:

1. **On file upload (always, if request reaches Node):**  
   `POST /api/trial-balance/ingest received, file: <filename>`

2. **Only if ingest succeeds and the HUD calls supervisor:**  
   - `POST /api/supervisor/chat received, message: Full Audit & Statement Build | raw_rows: <N>`  
   - `STRATEGY TRACE: incoming message: Full Audit & Statement Build | strategy (forced for debug): forensic`  
   - `TRACE 1: Orchestrator received request with strategy: forensic`  
   - `--- SUPERVISOR ACTIVATED ---`  
   - Then TRACE 3 and TRACE 4 as the ReAct loop runs.

3. **If you uncomment the throw** (message contains "Audit"):  
   The process throws `Error: STRATEGY TRACE: I am about to select forensic` and exits before Supervisor runs; you will **not** see `--- SUPERVISOR ACTIVATED ---`.

4. **If you never see** `POST /api/supervisor/chat received`:  
   The HUD is not calling `/api/supervisor/chat` (e.g. ingest returned 422 and the client returned early). So no STRATEGY TRACE or SUPERVISOR ACTIVATED will appear.

5. **TRACE 2** appears only if `runBuildFinancialStatements` **throws** (hard crash) instead of returning `{ success: false, ... }`.

---

## 6. Summary of Current Debug State

- **Strategy** is hard-coded to `'forensic'` in `runUnifiedSupervisor`; inference logic is commented out.
- **Print and Die throw** is commented out so the request can complete and all traces (including `--- SUPERVISOR ACTIVATED ---`) can be seen.
- **Route logs** on ingest and supervisor/chat make it clear when a request hits each endpoint.
- **SUPERVISOR ACTIVATED** and TRACE 1–4 remain in place for verifying the agent path.

To **restore normal behavior** (no debug traces, inference back in control): uncomment the inference block in `unified_orchestrator.ts`, remove the temporary `const strategy = 'forensic'`, and remove or comment out the STRATEGY TRACE log, the throw, and any route-level debug logs you no longer need.
