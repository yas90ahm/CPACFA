# Gemini needs to evaluate: What We Send Claude When a Ledger Is Ingested

This document summarizes the current flow from ledger ingestion to what Claude receives, identifies gaps, and lists recommendations for evaluation.

---

## 1. What We Send to Claude (Current Behavior)

When a ledger is ingested (e.g. via Diagnostic HUD or `/api/trial-balance/ingest`), the frontend (or client) then calls **POST /api/supervisor/chat** with a body such as:

- `message`: e.g. `"Full Audit & Statement Build"`
- `raw_rows`: array of trial balance entries from the ingest response

The supervisor route creates a session, stores the ledger as `pipelineInputSnapshot` in the DB, and calls the unified orchestrator, which invokes **runSupervisor** with that message and derived `entries`.

### First user message actually sent to Claude

The **only text** sent to Claude in the initial user message is:

- **If trial balance entries exist:**  
  `"{message}\n\n[Trial balance available in this session. Use buildFinancialStatements with sessionId and tenantId only (from context)—do not pass entries. Or use forensicRescan with entries if you need to re-validate.]"`  
  Example:  
  `"Full Audit & Statement Build\n\n[Trial balance available in this session. Use buildFinancialStatements with sessionId and tenantId only (from context)—do not pass entries. Or use forensicRescan with entries if you need to re-validate.]"`

- **If no entries:**  
  Just `input.message` (e.g. `"Full Audit & Statement Build"`).

**The raw ledger rows (account names, debits, credits, account codes) are not included in this prompt.** They are not in the message content sent to Claude.

### Where the ledger data actually lives

- **Session (DB):** The route creates a session and stores the ledger as `pipelineInputSnapshot` (e.g. `{ type: 'raw_rows', rawRows: body.raw_rows }`). So the ledger is in the session, not in the prompt.
- **Tool context:** The Supervisor receives `context.validatedEntries` (and `context.pipelineInput`) from the unified orchestrator. So `toolContext.validatedEntries` holds the same entries. Tools see the ledger via this context.
- **How Claude “sees” the ledger:**  
  - **buildFinancialStatements:** Loads data from the session snapshot (DB) using `sessionId` and `tenantId`; it does not receive the raw rows in the user message.  
  - **forensicRescan:** Can receive `entries` as tool input when Claude calls it; those entries would need to come from somewhere (e.g. a prior tool result or context). Claude is not given the raw rows in the initial prompt.

**Bottom line:** We send Claude a short user message plus a bracketed instruction. The ledger is provided indirectly via the session and tool context/tool calls, not as part of the prompt text.

---

## 2. Is This the Right Approach?

### What works well

- **Grounding:** Telling Claude to use `buildFinancialStatements` with `sessionId` and `tenantId` only keeps the source of truth in the DB and reduces the risk of the model inventing numbers.
- **Token usage:** Not dumping the full ledger into the system prompt avoids blowing context limits.
- **Single source of truth:** Statements are built from the session snapshot and tools, not from whatever the model might assume the ledger is.

So the idea of *not* pasting the full ledger into the first user message is reasonable.

### Where it can break

We tell Claude things like:

- “Trial balance available in this session…”
- “Analyze the trial balance, identify the ‘trapped’ entries (e.g., leases or missing offsets), and propose a correcting TrialBalanceAdjustment.”

But we **never give it the actual trial balance (accounts, debits, credits) in the prompt**. So:

- For **buildFinancialStatements:** This is fine — the tool loads from the session and returns BS/P&L (or an error). Claude doesn’t need the raw rows in the prompt for that.
- For **“analyze the trial balance” / self-heal:** Claude is being asked to reason about *which* entries might be wrong. To do that, it needs to **see** the entries at some point. If the only thing we ever send is “use buildFinancialStatements / forensicRescan” and maybe an error with `imbalanceAmount`, we’re asking it to do a job without the data.

So: **if we want Claude to actually analyze the ledger (e.g. find lease vs non-lease, trapped entries), we need to make sure it has the right prompt and the right data** — either in the prompt or via tool results.

---

## 3. Recommendations (for evaluation)

**Recommendation 1 – Put (relevant) data in the prompt when we ask for analysis**  
When we inject the self-healing instruction (e.g. after a math integrity error), we could also append a **summary** of the trial balance (e.g. top N lines + totals, or a compact table). Then the “analyze the trial balance” prompt actually refers to data Claude can see.

**Recommendation 2 – Expose the ledger via tools**  
Provide a tool that returns the trial balance (or the entries that buildFinancialStatements used) so Claude can call it, get the rows, then reason in a follow-up turn. The “right prompt” would then be something like: “Here is the trial balance [from the last tool result]. Analyze it and propose a correcting adjustment.”

**Recommendation 3 – Smarter tools, simpler prompt**  
e.g. `forensicRescan(sessionId)` loads the ledger from the session and re-analyzes inside the tool; the prompt just says “re-analyze the session.” Then the “right prompt” is about *what to do* (re-analyze, propose adjustment), and the *data* is handled inside the tool.

**Conclusion:** We need to ensure Claude has both the **right prompt** and the **right data**. The current design is reasonable for not dumping the ledger into the first user message, but for “analyze the trial balance and self-heal,” we should either (a) put ledger data (or a summary) into the prompt at the moment we ask for that analysis, or (b) give it to Claude via tool results and reference that in the prompt. Otherwise we’re asking it to do something it can’t do with what it has.

---

## 4. Code references

- **First user message to Claude:** `src/agents/Supervisor.ts` (e.g. `userContent`, `defaultFirstMessage`).
- **Session creation and pipeline snapshot:** `src/routes/supervisor.ts` (POST `/chat`), `src/services/unified_orchestrator.ts` (entries, context).
- **Tool context (validatedEntries):** `src/agents/Supervisor.ts` (`toolContext`), `src/services/unified_orchestrator.ts` (context passed to `runSupervisor`).
- **Self-healing observation text:** `src/agents/Supervisor.ts` (recovery observation and thought step when `buildFinancialStatements` returns a math integrity error).

---

*Label: **Gemini needs to evaluate** — prompt design, data availability, and self-healing behavior for ledger analysis.*
