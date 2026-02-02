# Autonomous Governance and Audit Trail

1. **Immutable Logs**: Middleware records every LLM decision, the prompt used, and the specific financial data accessed into a secure, read-only database (append-only; no UPDATE/DELETE; optional hash chain for integrity).

2. **Anomaly Detection**: CFA-level Skepticism Agent runs every 24 hours to flag journal entries that deviate from historical patterns (Benford's Law analysis, unusual weekend entries, round-sum amounts).

3. **Conflict Resolution**: If the CPA agent and CFA agent disagree on a valuation, the bot pauses and generates a Decision Memo for the human controller, outlining the pros/cons of each approach.

---

## 1. Immutable Logs

- **Table**: `llm_decision_log` (SQLite). Columns: `id`, `timestamp_utc`, `prompt`, `financial_data_accessed` (JSON), `decision_summary`, `agent_type`, `request_id`, `previous_hash`, `row_hash`, `endpoint`.
- **Enforcement**: Triggers prevent UPDATE and DELETE; only INSERT is allowed. Row hashes form a chain for integrity verification.
- **Middleware**: After each orchestrator/LLM call, call `log_llm_decision(prompt, decision_summary, agent_type, financial_data_accessed, endpoint=...)`. The Flask app does this automatically for `/api/orchestrator/route`.
- **Read-only**: Use `read_llm_decision_log(limit, agent_type, since_iso)` for auditors. API: `GET /api/governance/audit-log`.
- **Verify chain**: `GET /api/governance/verify-chain` returns `{ "ok": true }` or the first broken row id.

**DB path**: Default `backend/governance/governance_audit.db`. Override with env `GOVERNANCE_AUDIT_DB` (directory path).

---

## 2. Skepticism Agent (Anomaly Detection)

- **Benford's Law**: First-digit distribution of journal entry amounts vs expected; high deviation score may suggest manipulation.
- **Weekend entries**: Entries dated Saturday/Sunday are flagged (unusual for typical closing).
- **Round-sum**: Amounts that are exact multiples of 1000, 10000, etc. are flagged (often associated with fabricated data).

**Run every 24 hours**: Call `POST /api/governance/skepticism-scan` with body `{ "entries": [ { "date", "description", "amount", "account_code", ... } ] }`. Optionally schedule via cron or a job runner (e.g. daily at 00:00).

**Response**: `scan_timestamp_utc`, `entries_scanned`, `benford_deviation_score`, `benford_flags`, `weekend_flags`, `round_sum_flags`, `summary`, `passed`.

---

## 3. Conflict Resolution (CPA vs CFA)

- **Detection**: When intent is CFA and (a) CFA reports negative ROE while CPA shows positive Net Income and Equity, or (b) CFA valuation note says "Negative ROE" / "loss-making" / "overvalued" while CPA book values indicate positive income and equity.
- **Behavior**: The bot **pauses** and returns a **Decision Memo** instead of the final answer. The API response includes `paused: true` and `decision_memo` with:
  - `conflict_reason`
  - `cpa_summary` / `cfa_summary`
  - `cpa_pros` / `cpa_cons` / `cfa_pros` / `cfa_cons`
  - `recommendation` for the human controller
- **Human controller**: Must review the Decision Memo and reconcile CPA and CFA views before proceeding.

---

## Entry point

- **Package**: `backend/governance/` (immutable_log, skepticism_agent, conflict_resolution).
- **Single file**: `backend/governance_module.py` re-exports the same functions for use as a single entry point.
