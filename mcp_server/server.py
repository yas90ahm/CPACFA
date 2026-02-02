"""
FinOS MCP Server — ERP connectivity (NetSuite/SAP).

- Capabilities: get_trial_balance, list_unreconciled_transactions, create_draft_journal_entry.
- Safety: The agent cannot Post or Commit a transaction. It can only Stage entries for human approval.
- Traceability: Every tool call must include a Rationale parameter where the AI explains why it is calling that function.
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

# Allow importing from project root (connectors)
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

try:
    from mcp.server.mcpserver import MCPServer
    HAS_MCP = True
except ImportError:
    try:
        from mcp.server.fastmcp import FastMCP
        MCPServer = FastMCP  # type: ignore
        HAS_MCP = True
    except ImportError:
        HAS_MCP = False

from .rbac import (
    require_tool_permission,
    resolve_role_from_context,
    TOOL_GET_TRIAL_BALANCE,
    TOOL_LIST_UNRECONCILED_TRANSACTIONS,
    TOOL_CREATE_DRAFT_JOURNAL_ENTRY,
    TOOL_FETCH_LEDGER,
    TOOL_POST_JOURNAL_ENTRY,
    TOOL_CHECK_BUDGET,
)
from .tool_logger import (
    log_tool_call,
    extract_intent_and_plan_from_context,
    extract_rationale_from_context,
)
from .budget_store import check_budget as do_check_budget, seed_demo_budgets
from .draft_webhook import register_draft, get_webhook_contract

# Optional: use connectors for GL and draft
try:
    from connectors.erp_bridge import read_gl, create_draft_journal_entry, list_draft_entries
    HAS_CONNECTORS = True
except ImportError:
    HAS_CONNECTORS = False


def _get_role_intent_plan_rationale(
    role_param: Optional[str] = None,
    intent_param: Optional[str] = None,
    refined_plan_param: Optional[str] = None,
    rationale_param: Optional[str] = None,
    context: Any = None,
) -> tuple[str, Optional[str], Optional[str], Optional[str]]:
    """Resolve role, intent, refined_plan, rationale from params or context (traceability)."""
    intent_from_ctx, plan_from_ctx = extract_intent_and_plan_from_context(context)
    rationale_from_ctx = extract_rationale_from_context(context)
    role = (role_param or "").strip().lower()
    if not role:
        role = resolve_role_from_context(getattr(context, "meta", None) if context else None)
    if not role:
        role = (os.environ.get("MCP_USER_ROLE") or "viewer").strip().lower()
    intent = intent_param or intent_from_ctx
    refined_plan = refined_plan_param or plan_from_ctx
    rationale = (rationale_param or rationale_from_ctx or "").strip() or None
    return role, intent, refined_plan, rationale


def _get_role_intent_plan(
    role_param: Optional[str] = None,
    intent_param: Optional[str] = None,
    refined_plan_param: Optional[str] = None,
    context: Any = None,
) -> tuple[str, Optional[str], Optional[str]]:
    """Backward compat: resolve role, intent, refined_plan (no rationale)."""
    r, i, p, _ = _get_role_intent_plan_rationale(
        role_param, intent_param, refined_plan_param, None, context
    )
    return r, i, p


def _read_gl(as_of: Optional[str] = None, limit: int = 100) -> dict[str, Any]:
    if HAS_CONNECTORS:
        d = date.fromisoformat(as_of[:10]) if as_of else date.today()
        return read_gl(as_of=d, limit=limit)
    # Minimal fallback when connectors not available
    return {
        "as_of": (as_of or date.today().isoformat()),
        "lines": [],
        "total_debits": "0",
        "total_credits": "0",
        "balances": True,
    }


def _create_draft(
    description: str,
    amount: str | float,
    date_str: Optional[str] = None,
    debit_account: Optional[str] = None,
    credit_account: Optional[str] = None,
    source: str = "mcp_server",
) -> dict[str, Any]:
    if HAS_CONNECTORS:
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
        payload = {
            "id": draft.id,
            "date": draft.date,
            "description": draft.description,
            "debit_account": draft.debit_account,
            "credit_account": draft.credit_account,
            "amount": str(draft.amount),
            "created_at": draft.created_at,
            "source": draft.source,
        }
        register_draft(draft.id, payload)
        return {
            "id": draft.id,
            "date": draft.date,
            "description": draft.description,
            "debit_account": draft.debit_account,
            "credit_account": draft.credit_account,
            "amount": str(draft.amount),
            "created_at": draft.created_at,
            "status": "draft",
            "message": "Draft created. Requires human signature via webhook before finalizing to live ledger.",
            "webhook_contract": get_webhook_contract(),
        }
    # Fallback: return stub
    return {
        "id": "stub-no-connectors",
        "status": "draft",
        "message": "Draft created (stub). Connectors not loaded; human approval via webhook required before finalize.",
        "webhook_contract": get_webhook_contract(),
    }


def _list_unreconciled(limit: int = 100) -> dict[str, Any]:
    """List unreconciled transactions (draft/staged entries not yet posted; or bank/GL unreconciled)."""
    if HAS_CONNECTORS:
        entries = list_draft_entries(limit=limit)
        return {
            "unreconciled_type": "draft_journal_entries",
            "count": len(entries),
            "transactions": entries,
            "message": "Draft entries staged for human approval. No Post or Commit — agent can only Stage.",
        }
    return {
        "unreconciled_type": "draft_journal_entries",
        "count": 0,
        "transactions": [],
        "message": "Connectors not loaded; no unreconciled transactions returned.",
    }


if HAS_MCP:
    mcp = MCPServer(
        "FinOS ERP MCP (NetSuite/SAP)",
        instructions=(
            "ERP connectivity: get_trial_balance, list_unreconciled_transactions, create_draft_journal_entry. "
            "SAFETY: The agent cannot Post or Commit a transaction. It can only Stage entries for human approval. "
            "Every tool call MUST include a 'rationale' parameter where the AI explains why it is calling that function. "
            "All tool calls are subject to RBAC and logged with Rationale, Intent, and Refined Plan."
        ),
    )

    # --- ERP tools (NetSuite/SAP) with required Rationale ---

    @mcp.tool()
    def get_trial_balance(
        as_of: Optional[str] = None,
        limit: int = 100,
        rationale: Optional[str] = None,
        role: Optional[str] = None,
        intent: Optional[str] = None,
        refined_plan: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Get trial balance from the ERP (NetSuite/SAP) as of a date. Read-only.
        RATIONALE (required): Explain why you are calling this function (e.g. 'User asked for GL as of month-end').
        Requires role: viewer, accountant, or controller.
        """
        r, i, p, rational = _get_role_intent_plan_rationale(role, intent, refined_plan, rationale, None)
        require_tool_permission(r, TOOL_GET_TRIAL_BALANCE)
        args = {"as_of": as_of, "limit": limit}
        try:
            result = _read_gl(as_of=as_of, limit=limit)
            log_tool_call(
                TOOL_GET_TRIAL_BALANCE,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=True,
                result_summary=f"{len(result.get('lines', []))} lines",
            )
            return result
        except Exception as e:
            log_tool_call(
                TOOL_GET_TRIAL_BALANCE,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=False,
                error_message=str(e),
            )
            raise

    @mcp.tool()
    def list_unreconciled_transactions(
        limit: int = 100,
        rationale: Optional[str] = None,
        role: Optional[str] = None,
        intent: Optional[str] = None,
        refined_plan: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        List unreconciled transactions (draft/staged entries or bank/GL items not yet reconciled).
        RATIONALE (required): Explain why you are calling this function (e.g. 'Identify items pending approval').
        Requires role: viewer, accountant, or controller. Agent cannot Post or Commit — only Stage.
        """
        r, i, p, rational = _get_role_intent_plan_rationale(role, intent, refined_plan, rationale, None)
        require_tool_permission(r, TOOL_LIST_UNRECONCILED_TRANSACTIONS)
        args = {"limit": limit}
        try:
            result = _list_unreconciled(limit=limit)
            log_tool_call(
                TOOL_LIST_UNRECONCILED_TRANSACTIONS,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=True,
                result_summary=f"count={result.get('count', 0)}",
            )
            return result
        except Exception as e:
            log_tool_call(
                TOOL_LIST_UNRECONCILED_TRANSACTIONS,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=False,
                error_message=str(e),
            )
            raise

    @mcp.tool()
    def create_draft_journal_entry(
        description: str,
        amount: str | float,
        date_str: Optional[str] = None,
        debit_account: Optional[str] = None,
        credit_account: Optional[str] = None,
        rationale: Optional[str] = None,
        role: Optional[str] = None,
        intent: Optional[str] = None,
        refined_plan: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Stage a journal entry as DRAFT only. The agent cannot Post or Commit — only Stage for human approval.
        Human must approve via webhook (finalize-draft) before the entry is posted to the live ledger.
        RATIONALE (required): Explain why you are calling this function (e.g. 'User requested accrual for invoice X').
        Requires role: accountant or controller.
        """
        r, i, p, rational = _get_role_intent_plan_rationale(role, intent, refined_plan, rationale, None)
        require_tool_permission(r, TOOL_CREATE_DRAFT_JOURNAL_ENTRY)
        args = {
            "description": description,
            "amount": amount,
            "date_str": date_str,
            "debit_account": debit_account,
            "credit_account": credit_account,
        }
        try:
            result = _create_draft(
                description=description,
                amount=amount,
                date_str=date_str,
                debit_account=debit_account,
                credit_account=credit_account,
                source="mcp_server",
            )
            log_tool_call(
                TOOL_CREATE_DRAFT_JOURNAL_ENTRY,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=True,
                result_summary=f"draft_id={result.get('id')}",
            )
            return result
        except Exception as e:
            log_tool_call(
                TOOL_CREATE_DRAFT_JOURNAL_ENTRY,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=False,
                error_message=str(e),
            )
            raise

    # --- Legacy tools (aliases; same behavior, Rationale optional via intent/refined_plan) ---

    @mcp.tool()
    def fetch_ledger(
        as_of: Optional[str] = None,
        limit: int = 100,
        rationale: Optional[str] = None,
        role: Optional[str] = None,
        intent: Optional[str] = None,
        refined_plan: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        [Legacy alias for get_trial_balance] Fetch the General Ledger (trial balance style) as of a date. Read-only.
        Pass rationale for traceability (why you are calling this function).
        """
        r, i, p, rational = _get_role_intent_plan_rationale(role, intent, refined_plan, rationale, None)
        require_tool_permission(r, TOOL_FETCH_LEDGER)
        args = {"as_of": as_of, "limit": limit}
        try:
            result = _read_gl(as_of=as_of, limit=limit)
            log_tool_call(
                TOOL_FETCH_LEDGER,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=True,
                result_summary=f"{len(result.get('lines', []))} lines",
            )
            return result
        except Exception as e:
            log_tool_call(
                TOOL_FETCH_LEDGER,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=False,
                error_message=str(e),
            )
            raise

    @mcp.tool()
    def post_journal_entry(
        description: str,
        amount: str | float,
        date_str: Optional[str] = None,
        debit_account: Optional[str] = None,
        credit_account: Optional[str] = None,
        rationale: Optional[str] = None,
        role: Optional[str] = None,
        intent: Optional[str] = None,
        refined_plan: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        [Legacy alias for create_draft_journal_entry] Stage a journal entry as DRAFT only. No Post or Commit — only Stage.
        Human must approve via webhook before finalize. Pass rationale for traceability.
        """
        r, i, p, rational = _get_role_intent_plan_rationale(role, intent, refined_plan, rationale, None)
        require_tool_permission(r, TOOL_POST_JOURNAL_ENTRY)
        args = {
            "description": description,
            "amount": amount,
            "date_str": date_str,
            "debit_account": debit_account,
            "credit_account": credit_account,
        }
        try:
            result = _create_draft(
                description=description,
                amount=amount,
                date_str=date_str,
                debit_account=debit_account,
                credit_account=credit_account,
                source="mcp_server",
            )
            log_tool_call(
                TOOL_POST_JOURNAL_ENTRY,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=True,
                result_summary=f"draft_id={result.get('id')}",
            )
            return result
        except Exception as e:
            log_tool_call(
                TOOL_POST_JOURNAL_ENTRY,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=False,
                error_message=str(e),
            )
            raise

    @mcp.tool()
    def check_budget(
        account_code: str,
        period: str,
        proposed_amount: str | float,
        rationale: Optional[str] = None,
        role: Optional[str] = None,
        intent: Optional[str] = None,
        refined_plan: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Check whether a proposed amount is within budget for the given account and period.
        Pass rationale for traceability (why you are calling this function).
        """
        r, i, p, rational = _get_role_intent_plan_rationale(role, intent, refined_plan, rationale, None)
        require_tool_permission(r, TOOL_CHECK_BUDGET)
        args = {"account_code": account_code, "period": period, "proposed_amount": proposed_amount}
        try:
            res = do_check_budget(
                account_code=account_code,
                period=period,
                proposed_amount=proposed_amount,
            )
            out = {
                "account_code": res.account_code,
                "period": res.period,
                "limit": str(res.limit),
                "current_or_proposed": str(res.current_or_proposed),
                "within_limit": res.within_limit,
                "remaining": str(res.remaining),
                "message": res.message,
            }
            log_tool_call(
                TOOL_CHECK_BUDGET,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=True,
                result_summary=res.message,
            )
            return out
        except Exception as e:
            log_tool_call(
                TOOL_CHECK_BUDGET,
                role=r,
                user_id=user_id,
                intent=i,
                refined_plan=p,
                rationale=rational,
                arguments=args,
                result_ok=False,
                error_message=str(e),
            )
            raise

else:
    mcp = None


def main() -> None:
    if not HAS_MCP:
        raise RuntimeError("MCP SDK not installed. Run: pip install 'mcp[cli]'")
    seed_demo_budgets()
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
