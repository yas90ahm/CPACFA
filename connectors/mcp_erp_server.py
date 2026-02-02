"""
FinOS MCP Server for ERP integration (NetSuite / SAP / QuickBooks).
- Bi-directional Sync: Draft state — AI stages journal entries in ERP staging for human review.
- Permission Guard: Service account scoped (read-only most tables, write-only staging tables).
- Error Handling: On validation error (e.g. Closed Period), research period settings and suggest alternative posting date.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional

# MCP server: use mcp package (pip install mcp[cli])
try:
    from mcp.server.mcpserver import MCPServer
    HAS_MCP = True
except ImportError:
    HAS_MCP = False

from .erp_bridge import (
    read_gl,
    create_draft_journal_entry,
    list_draft_entries,
    map_description_to_coa,
)
from .oauth_scopes import (
    SCOPE_READ_GL,
    SCOPE_WRITE_DRAFT,
    parse_scopes_from_token,
    require_scope,
    ALL_SCOPES,
)
from .erp_sync import (
    stage_draft_to_erp,
    list_staged_drafts_from_erp,
    get_period_settings_from_erp,
)
from .permission_guard import get_service_account_permissions


def _get_scopes_for_request(context: Any = None) -> frozenset[str]:
    """Resolve scopes from context (meta/token) or env ERP_MCP_SCOPES for demo."""
    if context is not None and hasattr(context, "request_context"):
        meta = getattr(context.request_context, "meta", None) or {}
        token = meta.get("token") or getattr(context.request_context, "token", None)
        if token:
            return parse_scopes_from_token(str(token))
        scopes = meta.get("scopes")
        if isinstance(scopes, (list, set)):
            return frozenset(s for s in scopes if s in ALL_SCOPES)
    # Demo: allow all scopes via env so server works without OAuth client
    env_scopes = os.environ.get("ERP_MCP_SCOPES", "read_gl,write_draft").strip()
    return parse_scopes_from_token(env_scopes) or frozenset({"read_gl", "write_draft"})


if HAS_MCP:
    mcp = MCPServer(
        "FinOS ERP (NetSuite/SAP/QuickBooks)",
        instructions=(
            "ERP integration: Read GL; stage Draft journal entries to ERP (NetSuite/SAP/QuickBooks) for human review. "
            "Service account has read-only for most tables and write-only for staging tables. "
            "If ERP returns a validation error (e.g. Closed Period), the server researches period settings and suggests an alternative posting date. "
            "Posting to Live ledger requires human Approve in the UI."
        ),
    )

    @mcp.tool()
    def erp_read_gl(as_of: Optional[str] = None, limit: int = 100) -> dict[str, Any]:
        """
        Read the General Ledger (live). Returns trial balance style lines as of the given date.
        Requires scope: read_gl.
        """
        scopes = _get_scopes_for_request()
        require_scope(scopes, SCOPE_READ_GL)
        d = date.fromisoformat(as_of[:10]) if as_of else date.today()
        result = read_gl(as_of=d, limit=limit)
        return {
            "as_of": result["as_of"],
            "lines": result["lines"],
            "total_debits": result["total_debits"],
            "total_credits": result["total_credits"],
            "balances": result["balances"],
        }

    @mcp.tool()
    def erp_create_draft_journal_entry(
        description: str,
        amount: str | float,
        date_str: Optional[str] = None,
        debit_account: Optional[str] = None,
        credit_account: Optional[str] = None,
        source: str = "mcp_agent",
    ) -> dict[str, Any]:
        """
        Create a DRAFT journal entry only. Never posts to the Live ledger.
        Human must click Approve in the UI to post to Live.
        If debit_account/credit_account are omitted, uses dynamic COA mapper on description.
        Requires scope: write_draft.
        """
        scopes = _get_scopes_for_request()
        require_scope(scopes, SCOPE_WRITE_DRAFT)
        amt = Decimal(str(amount))
        dt = date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        draft = create_draft_journal_entry(
            date_str=dt,
            description=description.strip(),
            amount=amt,
            debit_account=debit_account,
            credit_account=credit_account,
            raw_description=description.strip(),
            source=source,
        )
        return {
            "id": draft.id,
            "date": draft.date,
            "description": draft.description,
            "debit_account": draft.debit_account,
            "debit_account_name": draft.debit_account_name,
            "credit_account": draft.credit_account,
            "credit_account_name": draft.credit_account_name,
            "amount": str(draft.amount),
            "created_at": draft.created_at,
            "source": draft.source,
            "status": "draft",
            "message": "Draft created. Post to Live only after human Approve in UI.",
        }

    @mcp.tool()
    def erp_list_draft_entries(limit: int = 50) -> dict[str, Any]:
        """
        List draft journal entries (approval queue). Read-only.
        Requires scope: read_gl (or write_draft for consistency).
        """
        scopes = _get_scopes_for_request()
        require_scope(scopes, SCOPE_READ_GL)
        entries = list_draft_entries(limit=limit)
        return {"drafts": entries, "count": len(entries)}

    @mcp.tool()
    def erp_map_description_to_coa(description: str) -> dict[str, Any]:
        """
        Map a messy human description to Chart of Accounts (code + name) using the dynamic mapper.
        Does not create any entry; use erp_create_draft_journal_entry or erp_stage_draft_to_erp to create a draft.
        Requires scope: read_gl.
        """
        scopes = _get_scopes_for_request()
        require_scope(scopes, SCOPE_READ_GL)
        mapping = map_description_to_coa(description)
        return {
            "description": description,
            "account_code": mapping.account_code,
            "account_name": mapping.account_name,
            "confidence": mapping.confidence,
            "needs_review": mapping.needs_review,
        }

    @mcp.tool()
    def erp_stage_draft_to_erp(
        description: str,
        amount: str | float,
        date_str: Optional[str] = None,
        debit_account: Optional[str] = None,
        credit_account: Optional[str] = None,
        provider: str = "netsuite",
        source: str = "mcp_agent",
    ) -> dict[str, Any]:
        """
        Stage a journal entry in the ERP (NetSuite/SAP/QuickBooks) in DRAFT state for human review.
        Bi-directional sync: entry is written to ERP staging table only (never to live GL).
        Permission guard: write-only to staging tables. If ERP returns a validation error (e.g. Closed Period),
        the server researches current period settings and suggests an alternative posting date.
        Requires scope: write_draft.
        """
        scopes = _get_scopes_for_request()
        require_scope(scopes, SCOPE_WRITE_DRAFT)
        amt = Decimal(str(amount))
        dt = date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if not debit_account or not credit_account:
            mapping = map_description_to_coa(description)
            desc_lower = description.lower()
            if any(x in desc_lower for x in ["revenue", "sales", "income", "receipt", "customer payment"]):
                debit_account = debit_account or "1000"
                credit_account = credit_account or mapping.account_code
            else:
                debit_account = debit_account or mapping.account_code
                credit_account = credit_account or "1000"
        result = stage_draft_to_erp(
            date_str=dt,
            description=description.strip(),
            debit_account=debit_account,
            credit_account=credit_account,
            amount=amt,
            provider=provider.strip().lower() or "netsuite",
            source=source,
            requested_date_for_error=dt,
        )
        if result.success and result.staged_entry:
            e = result.staged_entry
            return {
                "success": True,
                "id": e.id,
                "erp_id": e.erp_id,
                "date": e.date,
                "description": e.description,
                "debit_account": e.debit_account,
                "credit_account": e.credit_account,
                "amount": str(e.amount),
                "state": e.state,
                "provider": e.provider,
                "message": "Draft staged in ERP for human review. Post to Live only after human Approve in UI.",
            }
        out = {
            "success": False,
            "error_code": result.error_code,
            "error_message": result.error_message,
        }
        if result.recovery:
            out["recovery"] = {
                "suggested_alternative_posting_date": result.recovery.suggested_alternative_posting_date,
                "current_period_id": result.recovery.current_period_id,
                "open_periods_summary": result.recovery.open_periods_summary,
                "narrative": result.recovery.narrative,
                "recovered": result.recovery.recovered,
            }
        return out

    @mcp.tool()
    def erp_get_period_settings(provider: str = "netsuite") -> dict[str, Any]:
        """
        Research current and open periods in the ERP (for error recovery or planning).
        Service account has read-only access to period settings.
        Requires scope: read_gl.
        """
        scopes = _get_scopes_for_request()
        require_scope(scopes, SCOPE_READ_GL)
        return get_period_settings_from_erp(provider=provider.strip().lower() or "netsuite")

    @mcp.tool()
    def erp_list_staged_drafts(provider: str = "netsuite", limit: int = 50) -> dict[str, Any]:
        """
        List draft journal entries staged in the ERP (NetSuite/SAP/QuickBooks) for human review.
        Read-only; staging table access only.
        Requires scope: read_gl.
        """
        scopes = _get_scopes_for_request()
        require_scope(scopes, SCOPE_READ_GL)
        entries = list_staged_drafts_from_erp(provider=provider.strip().lower() or "netsuite", limit=limit)
        return {"staged_drafts": entries, "count": len(entries)}

    @mcp.tool()
    def erp_get_service_account_permissions() -> dict[str, Any]:
        """
        Return the Service Account permission summary: read-only tables and write-only staging tables.
        Use to confirm the AI agent cannot write to live GL.
        """
        return get_service_account_permissions()
else:
    mcp = None


def main() -> None:
    if not HAS_MCP:
        raise RuntimeError("MCP SDK not installed. Run: pip install 'mcp[cli]'")
    # stdio for Cursor/Claude Desktop; use transport="streamable-http" for HTTP
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
