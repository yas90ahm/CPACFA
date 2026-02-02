# FinOS MCP Server — ERP Connectivity (NetSuite/SAP)

Model Context Protocol (MCP) server for **ERP connectivity** (NetSuite/SAP) with **RBAC**, **stage-only** writes (no Post/Commit), and **traceability** via a required **Rationale** parameter on every tool call.

## 1. Capabilities — ERP Tools

| Tool | Description | Read/Write |
|------|-------------|------------|
| **get_trial_balance** | Get trial balance from the ERP (NetSuite/SAP) as of a date. Read-only. | Read |
| **list_unreconciled_transactions** | List unreconciled transactions (draft/staged entries or bank/GL items not yet reconciled). | Read |
| **create_draft_journal_entry** | **Stage** a journal entry as draft only. Agent cannot Post or Commit — only Stage for human approval. | Write (Stage only) |
| **check_budget** | Check whether a proposed amount is within budget for account/period. | Read |

Legacy aliases: `fetch_ledger` (→ get_trial_balance), `post_journal_entry` (→ create_draft_journal_entry).

## 2. Safety — No Post or Commit

- **The agent cannot Post or Commit a transaction.** It can only **Stage** entries for human approval.
- All write operations create a **Draft** only. No direct write to live ERP.
- Drafts require a **human signature via webhook** (`POST /webhook/finalize-draft`) before being finalized to the live ledger.
- There are **no tools** for posting or committing to the live ledger; only staging drafts.

## 3. Traceability — Rationale Parameter

**Every tool call must include a `rationale` parameter** where the AI explains *why* it is calling that specific function.

- **rationale** (required for ERP tools): Short explanation, e.g. "User asked for GL as of month-end" or "Identify items pending approval" or "User requested accrual for invoice X".
- **intent**, **refined_plan**, **user_id**, **role**: Optional; also logged for audit.
- Logs include: timestamp, tool_name, role, user_id, **rationale**, intent, refined_plan, arguments, result_ok, result_summary, error_message.
- Set `MCP_TOOL_LOG_PATH` to a `.jsonl` path for persistent log.

## 4. RBAC

| Role | get_trial_balance | list_unreconciled_transactions | create_draft_journal_entry | check_budget |
|------|-------------------|---------------------------------|----------------------------|--------------|
| **viewer** | ✓ | ✓ | ✗ | ✓ |
| **accountant** | ✓ | ✓ | ✓ | ✓ |
| **controller** | ✓ | ✓ | ✓ | ✓ |

Role is resolved from tool parameter `role`, request context `meta.role`, or env `MCP_USER_ROLE` (default: `viewer`).

## 5. Draft + Webhook

- Drafts created by `create_draft_journal_entry` are registered for webhook approval.
- **Webhook contract**: `POST /webhook/finalize-draft` with body `{ "draft_id", "signed_by", "signature_token?" }`.
- The server marks the draft as approved; the ERP/backend performs the actual post to live when it sees `status=approved`.

Run the webhook server (optional):

```bash
export MCP_WEBHOOK_PORT=5050
python -m mcp_server.webhook_server
```

## Running the MCP Server

From project root (so `connectors` can be imported):

```bash
pip install -e .
pip install "mcp[cli]"
# Optional: install connectors deps
pip install -r connectors/requirements.txt

python -m mcp_server.server
```

With env overrides:

```bash
export MCP_USER_ROLE=accountant
export MCP_TOOL_LOG_PATH=/var/log/mcp_tools.jsonl
python -m mcp_server.server
```

## Files

- **server.py** — MCP server; ERP tools (get_trial_balance, list_unreconciled_transactions, create_draft_journal_entry), RBAC, rationale logging, stage-only draft creation.
- **rbac.py** — Role definitions and permission matrix for ERP tools.
- **tool_logger.py** — Tool-call logging (rationale, intent, refined_plan, result).
- **draft_webhook.py** — Draft registration and finalization-by-webhook contract.
- **budget_store.py** — Budget limits for check_budget.
- **webhook_server.py** — Optional HTTP server for /webhook/finalize-draft.
