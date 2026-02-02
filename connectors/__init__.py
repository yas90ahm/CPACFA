"""
FinOS Connectors — ERP bridge and MCP server for GL read / draft journal write.
- AI has Read access to General Ledger and Write access to Draft Journal Entries only.
- Posting to Live ledger requires human Approve in UI; no MCP tool for live post.
"""
from __future__ import annotations

from .erp_bridge import (
    read_gl,
    create_draft_journal_entry,
    list_draft_entries,
    map_description_to_coa,
    get_draft_entry,
    DEFAULT_COA_RULES,
)
from .oauth_scopes import SCOPE_READ_GL, SCOPE_WRITE_DRAFT, ALL_SCOPES, parse_scopes_from_token

__all__ = [
    "read_gl",
    "create_draft_journal_entry",
    "list_draft_entries",
    "map_description_to_coa",
    "get_draft_entry",
    "DEFAULT_COA_RULES",
    "SCOPE_READ_GL",
    "SCOPE_WRITE_DRAFT",
    "ALL_SCOPES",
    "parse_scopes_from_token",
]
