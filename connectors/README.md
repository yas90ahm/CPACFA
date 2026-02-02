# FinOS ERP Connectors — Production MCP Server (NetSuite / SAP / QuickBooks)

MCP (Model Context Protocol) server for ERP integration with **Read** access to the General Ledger and **Write** access to **Draft (staging)** journal entries only. The AI can **never** post to the Live ledger without a human clicking **Approve** in the UI.

## 1. Bi-directional Sync — Draft state

- **Draft state**: The AI stages journal entries in the ERP (NetSuite/SAP/QuickBooks) in a **Draft** state for human review.
- Entries are written to **ERP staging tables** only (e.g. journal_staging, draft_entries), not to live GL.
- **Tools**: `erp_stage_draft_to_erp` (stage to ERP), `erp_list_staged_drafts` (list drafts from ERP), `erp_get_period_settings` (research periods).
- Human approval in the UI is required to post from staging to Live.

## 2. Permission Guard — Service account scoped permissions

- The AI agent uses a **Service Account** with scoped permissions:
  - **Read-only** for most tables: GL, periods, COA, subsidiaries, currencies, and staging (for sync status).
  - **Write-only** for **specific staging tables** only: `journal_staging`, `draft_entries`, `staging`.
- No write access to live GL or other production tables. Use `erp_get_service_account_permissions` to inspect allowed tables.

## 3. Error handling — Closed Period → alternative posting date

- If the ERP API returns a validation error (e.g. **Closed Period**), the bot:
  1. **Autonomously researches** current period settings via `get_period_settings` (read-only).
  2. **Suggests an alternative posting date** (e.g. start of next open period).
  3. Returns a **recovery** object with `suggested_alternative_posting_date`, `open_periods_summary`, and narrative for the user.
- Optional: set `ERP_SIMULATE_CLOSED_PERIOD_BEFORE=2025-01-15` to simulate Closed Period for dates ≤ that date (for testing).

## Capabilities

| Capability | Scope | Description |
|------------|--------|-------------|
| **Read GL** | `read_gl` | Read General Ledger (live) — trial balance style lines |
| **Write Draft** | `write_draft` | Create draft locally or stage to ERP (NetSuite/SAP/QuickBooks) |
| **Stage to ERP** | `write_draft` | Stage draft to ERP staging table (bi-directional sync) |
| **List Drafts / Staged** | `read_gl` | List draft entries (local or from ERP staging) |
| **Period settings** | `read_gl` | Research current and open periods (for error recovery) |
| **Service account permissions** | — | Read-only / write-staging-only summary |
| **Map to COA** | `read_gl` | Dynamic mapper: messy human description → Chart of Accounts |

There is **no** tool or scope for posting to the Live ledger. Posting to Live is done only by the UI/backend after human approval.

## Security — OAuth2 scope-based permissions

- **Scopes**: `read_gl`, `write_draft`. No `live_write` scope for the AI.
- **Token**: In production, the MCP client sends an OAuth2 access token; the server validates it and enforces scopes. See `connectors/oauth_scopes.py`.
- **Demo**: Without a token, scopes are read from env: `ERP_MCP_SCOPES=read_gl,write_draft` (default allows both).

## Dynamic COA mapper

`erp_bridge.map_description_to_coa(description)` maps messy human descriptions to your Chart of Accounts (code + name) using keyword/regex rules in `DEFAULT_COA_RULES`. Examples:

- "AWS invoice #123" → 5100 IT Infrastructure  
- "Office rent Jan" → 7200 Rent & Occupancy  
- "Customer payment" → 4000 Revenue  

Extend `DEFAULT_COA_RULES` in `erp_bridge.py` or plug in ML/external mapping in production.

## Running the MCP server

From the **project root** (so `connectors` is a package):

```bash
# Install MCP SDK
pip install "mcp[cli]"

# Run over stdio (for Cursor / Claude Desktop)
python -m connectors.mcp_erp_server
```

Or with env scopes:

```bash
ERP_MCP_SCOPES=read_gl,write_draft python -m connectors.mcp_erp_server
```

### Cursor / Claude Desktop

Add the server in MCP settings, e.g.:

- **Command**: `python`
- **Args**: `-m connectors.mcp_erp_server`
- **Cwd**: project root

## MCP tools

| Tool | Description |
|------|-------------|
| `erp_read_gl` | Read General Ledger as of a date; returns trial balance lines |
| `erp_create_draft_journal_entry` | Create a draft journal entry locally (description, amount; optional debit/credit). Uses COA mapper if accounts omitted. |
| `erp_stage_draft_to_erp` | Stage a draft to ERP (NetSuite/SAP/QuickBooks) for human review. On Closed Period error, returns suggested alternative posting date. |
| `erp_list_draft_entries` | List draft journal entries (local approval queue) |
| `erp_list_staged_drafts` | List draft entries staged in the ERP (from staging table) |
| `erp_get_period_settings` | Research current and open periods (for error recovery or planning) |
| `erp_get_service_account_permissions` | Return read-only and write-staging-only table summary |
| `erp_map_description_to_coa` | Map a human description to account code and name (no entry created) |

## Files

- **`erp_bridge.py`** — Read GL, create draft entries locally, dynamic COA mapper. No function to post to Live.
- **`erp_adapters.py`** — NetSuite/SAP/QuickBooks adapters: read_gl, get_period_settings, stage_draft_entry, list_staged_drafts. Simulated APIs; replace with real REST/SOAP in production.
- **`erp_sync.py`** — Bi-directional sync: stage_draft_to_erp, list_staged_drafts_from_erp, get_period_settings_from_erp. Permission guard + error handling.
- **`permission_guard.py`** — Service account scoped permissions (read-only tables, write-only staging tables).
- **`erp_error_handler.py`** — On Closed Period (or other validation error), research period settings and suggest alternative posting date.
- **`oauth_scopes.py`** — OAuth2 scope constants and token/scope parsing (demo + production-ready hook).
- **`mcp_erp_server.py`** — MCP server exposing tools with scope checks and ERP staging/period/recovery.
