"""
Role-Based Access Control (RBAC) for MCP server.
The bot's ability to call tools is limited by the user's enterprise permissions (role).
"""

from __future__ import annotations

from typing import FrozenSet, Optional

# Enterprise roles (user's permission level)
ROLE_VIEWER = "viewer"           # Read-only: get_trial_balance, list_unreconciled_transactions, check_budget
ROLE_ACCOUNTANT = "accountant"  # + create_draft_journal_entry (stage only — no post/commit)
ROLE_CONTROLLER = "controller"  # All tools + future admin

ALL_ROLES = frozenset({ROLE_VIEWER, ROLE_ACCOUNTANT, ROLE_CONTROLLER})

# ERP tools (NetSuite/SAP connectivity)
TOOL_GET_TRIAL_BALANCE = "get_trial_balance"
TOOL_LIST_UNRECONCILED_TRANSACTIONS = "list_unreconciled_transactions"
TOOL_CREATE_DRAFT_JOURNAL_ENTRY = "create_draft_journal_entry"
# Legacy / alias names (same permissions)
TOOL_FETCH_LEDGER = "fetch_ledger"
TOOL_POST_JOURNAL_ENTRY = "post_journal_entry"
TOOL_CHECK_BUDGET = "check_budget"

ALL_TOOLS = frozenset({
    TOOL_GET_TRIAL_BALANCE,
    TOOL_LIST_UNRECONCILED_TRANSACTIONS,
    TOOL_CREATE_DRAFT_JOURNAL_ENTRY,
    TOOL_FETCH_LEDGER,
    TOOL_POST_JOURNAL_ENTRY,
    TOOL_CHECK_BUDGET,
})

# Role -> set of tools that role is allowed to call
ROLE_PERMISSIONS: dict[str, FrozenSet[str]] = {
    ROLE_VIEWER: frozenset({
        TOOL_GET_TRIAL_BALANCE,
        TOOL_LIST_UNRECONCILED_TRANSACTIONS,
        TOOL_FETCH_LEDGER,
        TOOL_CHECK_BUDGET,
    }),
    ROLE_ACCOUNTANT: frozenset({
        TOOL_GET_TRIAL_BALANCE,
        TOOL_LIST_UNRECONCILED_TRANSACTIONS,
        TOOL_CREATE_DRAFT_JOURNAL_ENTRY,
        TOOL_FETCH_LEDGER,
        TOOL_POST_JOURNAL_ENTRY,
        TOOL_CHECK_BUDGET,
    }),
    ROLE_CONTROLLER: ALL_TOOLS,
}


def get_role_permissions(role: str) -> FrozenSet[str]:
    """Return the set of tools allowed for the given role."""
    r = (role or "").strip().lower()
    return ROLE_PERMISSIONS.get(r, frozenset())


def can_call_tool(role: Optional[str], tool_name: str) -> bool:
    """Return True if the user's role is allowed to call the given tool."""
    if not role:
        return False
    allowed = get_role_permissions(role)
    return tool_name in allowed


def require_tool_permission(role: Optional[str], tool_name: str) -> None:
    """Raise PermissionError if the user's role cannot call the given tool."""
    if not can_call_tool(role, tool_name):
        allowed = get_role_permissions(role or "") if role else frozenset()
        raise PermissionError(
            f"RBAC: Role '{role or '(none)'}' is not allowed to call tool '{tool_name}'. "
            f"Allowed tools for this role: {sorted(allowed)}."
        )


def resolve_role_from_context(context: Optional[dict]) -> str:
    """
    Resolve the user's enterprise role from request context.
    Context may contain: meta.role, meta.user_id, headers, or env fallback for demo.
    """
    import os
    if context:
        meta = (context.get("meta") or context) if isinstance(context, dict) else {}
        if isinstance(meta, dict):
            role = meta.get("role") or meta.get("user_role")
            if role and str(role).strip().lower() in ALL_ROLES:
                return str(role).strip().lower()
    # Demo fallback: env or default viewer (least privilege)
    return (os.environ.get("MCP_USER_ROLE") or "viewer").strip().lower()
