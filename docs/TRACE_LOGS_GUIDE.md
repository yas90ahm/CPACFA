# TRACE Logs Guide — Diagnostic HUD Line-by-Line Execution Trace

## Current status: no TRACE logs captured

The Node API terminal output that was checked **does not contain any TRACE 1–4 lines**. Only the normal startup lines (e.g. "FinOS Agent API listening on http://localhost:3001") are present.

That usually means one of:

1. **No diagnostic flow was run** after the TRACE code was added — TRACE logs only appear when a request hits the orchestrator/supervisor path (upload + "Full Audit & Statement Build" from the HUD).
2. **The flow stops before the orchestrator** — e.g. ingest returns 422 and the HUD never calls `/api/supervisor/chat`, so TRACE 1 (orchestrator) never runs.
3. **You were looking at a different terminal** — TRACE output goes only to the terminal where `npm run dev` (Node API) is running, not the frontend or Python terminal.

---

## Where each TRACE is in the code

| TRACE | File | Line (approx) | When it runs |
|-------|------|----------------|--------------|
| **TRACE 1** | `src/services/unified_orchestrator.ts` | ~176 | As soon as `runUnifiedSupervisor` runs (strategy chosen: `forensic` or `month_end_close`). |
| **TRACE 2** | `src/agents/tools/index.ts` | ~285 | Only if `runBuildFinancialStatements` **throws** (hard crash) instead of returning `{ success: false }`. |
| **TRACE 3** | `src/agents/Supervisor.ts` | ~369 | At the start of each ReAct loop iteration, before calling Anthropic. If you never see this, the agent path was never entered. |
| **TRACE 4** | `src/agents/Supervisor.ts` | ~308 | Every time `fireReasoningStep` is called (thought or tool step). If terminal shows TRACE 4 but HUD has no thoughts, the issue is persistence/DB or trace endpoint. |

---

## How to capture logs so you can “fetch” them

TRACE lines are `console.log` from the Node API — they go to **stdout** of the process. To have a file you can open or share:

### Option A: Redirect stdout to a file (PowerShell)

1. Open a terminal.
2. Run:
   ```powershell
   cd c:\Users\yasir\CPACFA
   npm run dev 2>&1 | Tee-Object -FilePath node-api.log
   ```
3. Trigger the diagnostic flow from the HUD (upload + Full Audit & Statement Build).
4. Stop the server (Ctrl+C). Open `c:\Users\yasir\CPACFA\node-api.log` — all TRACE lines (and other stdout) will be there.

### Option B: Run in background and tail the log

1. Start the API with output going to a file:
   ```powershell
   cd c:\Users\yasir\CPACFA
   npm run dev > node-api.log 2>&1
   ```
2. In another terminal, watch the log:
   ```powershell
   Get-Content c:\Users\yasir\CPACFA\node-api.log -Wait -Tail 50
   ```
3. Trigger the HUD flow; TRACE lines will appear in `node-api.log` and in the `Get-Content` window.

### Option C: Use the Cursor terminal that runs the Node API

1. Start the Node API from Cursor: **Terminal → New Terminal**, then `cd c:\Users\yasir\CPACFA` and `npm run dev`.
2. Trigger the diagnostic flow in the browser.
3. In that same terminal, scroll to see TRACE 1–4. You can copy the lines and paste them into a doc.

---

## How to interpret once you have logs

- **TRACE 1 = `month_end_close`** → Strategy fix didn’t apply; request is still using the deterministic pipeline. Fix inference or force `mode: 'chat'` for the HUD.
- **TRACE 2 appears** → The buildFinancialStatements tool (or something it calls) is throwing instead of returning a soft failure. Fix that path so it returns `{ success: false, ... }`.
- **No TRACE 3** → The Supervisor/agent loop never ran (e.g. pipeline path was used and threw first). Get to the forensic path so TRACE 3 runs.
- **TRACE 3 and TRACE 4, but no thoughts on HUD** → Agent is running and firing steps; the problem is after that (DB, `DATABASE_URL`, or the GET trace endpoint / `sessionId` not returned on 422).

---

## Quick checklist before testing

- [ ] Node API was restarted **after** the TRACE code was added.
- [ ] You’re watching the **Node API** terminal (port 3001), not the frontend (3000) or Python (5000).
- [ ] You triggered the **full** flow: upload a file on the diagnostics page, then let it call supervisor (or use whatever button sends “Full Audit & Statement Build”).
- [ ] If ingest returns 422 by itself, the HUD may not call supervisor — so TRACE 1/3/4 never run. In that case, either use a file that passes ingest and fails later, or add a TRACE at the start of the ingest route to confirm the request is reaching the server.
