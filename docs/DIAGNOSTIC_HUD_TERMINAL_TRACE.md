# Diagnostic HUD — Terminal Trace & Log Recording

This document captures a sample **terminal trace** from the Diagnostic HUD flow (adversarial ledger upload → Ingest → Supervisor) and explains **where these traces come from** and **whether they are recorded in logs**.

---

## Sample Terminal Trace (Lines 70–114)

When you upload the adversarial ledger and the HUD calls Ingest then Supervisor, the Node API terminal shows output like the following. This is **stdout** from the backend process (e.g. `tsx watch src/server.ts`).

```
POST /api/trial-balance/ingest received, file: Adversial test ledger.CSV
CRITICAL TRACE: Supervisor API reached by HUD
POST /api/supervisor/chat received, message: Full Audit & Statement Build | raw_rows: 15
STRATEGY TRACE: incoming message: Full Audit & Statement Build | strategy (forced for debug): forensic
TRACE 1: Orchestrator received request with strategy: forensic
--- SUPERVISOR ACTIVATED ---
TRACE 3: Sending the following data to Claude: {"role":"user","content":"Current Ledger (first 40 rows — analyze for traps e.g. Ferrari, Lease, Plug):\nAccount Name | Debit | Credit | Description\nCash Operating | 14,500.5 | 0 | —\nAccounts Receivable | 5,200 | 0 | —\nOffice Equipment | 12,000 | 0 | —\nExotic Auto Lease | 2,500 | 0 | —\nAccounts Payable | 0 | 3,200 | —\nTenant Security Deposit | 0 | 1,500 | —\nLong-Term Office Lease | 0 | 45,000 | —\nCommon Stock | 0 | 1,000 | —\nRetained Earnings | 0 | 12,500 | —\nRevenue - Consulting | 0 | ...
TRACE 4: fireReasoningStep thought The user has provided a trial balance with 15 accounts and asked for a "Full Audit & Statement Build
TRACE 4: fireReasoningStep thought Executing tool(s): forensicRescan.
TRACE 4: fireReasoningStep tool undefined
TRACE 3: Sending the following data to Claude: ...
TRACE 4: fireReasoningStep thought The forensicRescan confirmed a massive imbalance of 33,959.5 (credits exceed debits). This is illega
TRACE 4: fireReasoningStep thought Executing tool(s): step1CPA.
TRACE 4: fireReasoningStep tool undefined
TRACE 3: Sending the following data to Claude: ...
TRACE 4: fireReasoningStep thought Both forensicRescan and step1CPA reject the unbalanced trial balance. I need to identify the specifi
TRACE 4: fireReasoningStep thought Executing tool(s): classifyAccount, classifyAccount, classifyAccount, classifyAccount.
TRACE 4: fireReasoningStep tool undefined
TRACE 4: fireReasoningStep tool undefined
TRACE 4: fireReasoningStep tool undefined
TRACE 4: fireReasoningStep tool undefined
TRACE 3: Sending the following data to Claude: ...
TRACE 4: fireReasoningStep thought Interesting findings:

1. **"Exotic Auto Lease" (2,500 debit)** - Classified as EXPENSE, but recorde
```

---

## Where Each Trace Comes From

| Trace line / pattern | Source file | What it is |
|----------------------|------------|------------|
| `POST /api/trial-balance/ingest received, file: ...` | `src/routes/trial-balance/ingest.ts` | Ingest route handler log. |
| `CRITICAL TRACE: Supervisor API reached by HUD` | `src/routes/supervisor.ts` | Confirms the Supervisor `/chat` handler was hit (HUD → API). |
| `POST /api/supervisor/chat received, message: ... \| raw_rows: N` | `src/routes/supervisor.ts` | Supervisor route logs message and raw_rows count. |
| `STRATEGY TRACE: incoming message: ... \| strategy (forced for debug): forensic` | `src/services/unified_orchestrator.ts` | Orchestrator logs chosen strategy (e.g. forensic when `forceForensic: true`). |
| `TRACE 1: Orchestrator received request with strategy: ...` | `src/services/unified_orchestrator.ts` | Orchestrator entry log. |
| `--- SUPERVISOR ACTIVATED ---` | `src/agents/Supervisor.ts` (or orchestration) | Supervisor activation marker. |
| `TRACE 3: Sending the following data to Claude: ...` | `src/agents/Supervisor.ts` | Log of the user message (ledger table + prompt) sent to Claude. |
| `TRACE 4: fireReasoningStep thought ...` / `TRACE 4: fireReasoningStep tool ...` | `src/agents/Supervisor.ts` | Each reasoning step (thought or tool call) before it is persisted or sent. |

All of the above are **console.log** (stdout). They are **not** written to a file by the application unless you redirect the process output (e.g. `npm run dev > server.log 2>&1`).

---

## Are These Recorded in a Log?

### Terminal (stdout) only

- **CRITICAL TRACE**, **STRATEGY TRACE**, **TRACE 1**, **TRACE 3**, **TRACE 4**, and the ingest/supervisor route logs are **only** printed to the Node process stdout (the terminal where you run `npm run dev`).
- The app does **not** write these strings to a log file by default. To keep them, you must:
  - Capture terminal output (e.g. copy/paste or terminal scrollback), or
  - Redirect stdout/stderr when starting the server, e.g.  
    `npm run dev > server.log 2>&1` (or use a process manager that logs stdout).

### Database (reasoning_logs) — when session + tenant exist

- **Reasoning steps** (the same “thought” and “tool” items you see in **TRACE 4**) **are** persisted when:
  - The request has a valid **tenant context** (tenantId + pool) and a **sessionId** is created for the Supervisor run.
  - The orchestrator passes `onReasoningStep` into the Supervisor; the Supervisor’s `fireReasoningStep` then calls it.
- In that case, each step is appended to **`tenant_supervisor_sessions.reasoning_logs`** (Postgres) via `appendReasoningLogWithClient` in `src/services/persistence_service.ts`.
- So: the **content** behind TRACE 4 (thought/tool entries) is stored in the DB when tenant + session exist; the **TRACE 4** line itself is still only on stdout.

### Diagnostic HUD (no tenant DB)

- The Diagnostic HUD uses a test tenant (e.g. `test-tenant-uuid`) and may not have a real DB-backed tenant/pool. If no session is created or no tenant context is attached, `onReasoningStep` is **undefined** and reasoning steps are **not** written to the database.
- So for that flow, the **only** record of the “Thought Stream” is the **terminal trace** (TRACE 3 / TRACE 4 and the rest of the console output).

---

## How to Retrieve the Persisted Trace (when in DB)

When a run has a **sessionId** and **tenant context**:

- **API:** `GET /api/supervisor/session/:sessionId/trace`
- **Response:** `{ reasoningLogs: [...], stagingItems: [...] }`
- **Auth:** Request must carry tenant context (e.g. Bearer token or auth bypass for that route) so the server can load the session for that tenant.

The **reasoningLogs** array is the same sequence of steps you see as TRACE 4 in the terminal (thought/tool, with optional timestamps). The frontend “Thought Stream” can be driven from this API (e.g. Diagnostic HUD or any client that has the sessionId).

---

## Summary

| What | Terminal (stdout) | Log file | Database |
|------|-------------------|----------|----------|
| Ingest / Supervisor route logs, CRITICAL TRACE, STRATEGY TRACE, TRACE 1/3/4 | Yes | Only if you redirect stdout | No |
| Reasoning steps (thought/tool) | Yes (as TRACE 4) | Only if you redirect stdout | Yes, in `reasoning_logs` when tenant + session exist |
| Full trace for a session | N/A | N/A | Yes, via `GET /api/supervisor/session/:sessionId/trace` when session exists |

So: the **terminal trace** you captured (lines 70–114) is the **primary record** for the Diagnostic HUD run unless you redirect stdout to a file. The **same reasoning steps** are also stored in the DB and exposed via the session trace API when the run has a real tenant and session.
