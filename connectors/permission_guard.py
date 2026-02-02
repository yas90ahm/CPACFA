"""
Permission Guard — Service Account scoped permissions for ERP MCP.
- Read-only for most tables (GL, periods, COA, subsidiaries, etc.).
- Write-only for specific staging tables (journal_staging, draft_entries).
AI agent must use a Service Account with these scopes; no write to live GL.
"""
from __future__ import annotations

from typing import Optional, Set

# Tables the service account may READ (read-only for most ERP data)
READ_ONLY_TABLES: frozenset[str] = frozenset({
    "gl",
    "general_ledger",
    "periods",
    "period_settings",
    "coa",
    "chart_of_accounts",
    "subsidiaries",
    "currencies",
    "locations",
    "vendors",
    "customers",
    "journal_staging",  # can read staging for human review / sync status
    "draft_entries",
})

# Tables the service account may WRITE (staging only; never live GL)
WRITE_STAGING_TABLES: frozenset[str] = frozenset({
    "journal_staging",
    "draft_entries",
    "staging",
})

# Operations that map to table access
OPERATION_READ_GL = "read_gl"
OPERATION_READ_PERIODS = "read_periods"
OPERATION_READ_STAGING = "read_staging"
OPERATION_WRITE_STAGING = "write_staging"
OPERATION_WRITE_LIVE = "write_live"  # never allowed for AI


def check_read(table: str) -> None:
    """Raise PermissionError if service account is not allowed to read this table."""
    t = (table or "").strip().lower()
    if not t:
        raise PermissionError("Permission Guard: table name required for read check.")
    if t not in READ_ONLY_TABLES:
        raise PermissionError(
            f"Permission Guard: Service account does not have read access to table '{table}'. "
            f"Allowed read tables: {sorted(READ_ONLY_TABLES)}."
        )


def check_write(table: str) -> None:
    """Raise PermissionError if service account is not allowed to write to this table (e.g. live GL)."""
    t = (table or "").strip().lower()
    if not t:
        raise PermissionError("Permission Guard: table name required for write check.")
    if t in WRITE_STAGING_TABLES:
        return  # allowed: staging only
    raise PermissionError(
        f"Permission Guard: Service account cannot write to table '{table}'. "
        f"Only staging tables are writable: {sorted(WRITE_STAGING_TABLES)}. "
        "Live GL posting is not allowed for the AI agent."
    )


def can_read(table: str) -> bool:
    """Return True if service account can read this table."""
    return (table or "").strip().lower() in READ_ONLY_TABLES


def can_write(table: str) -> bool:
    """Return True if service account can write to this table (staging only)."""
    return (table or "").strip().lower() in WRITE_STAGING_TABLES


def get_service_account_permissions() -> dict[str, list[str]]:
    """Return a summary of service account permissions for MCP/audit."""
    return {
        "read_only_tables": sorted(READ_ONLY_TABLES),
        "write_staging_tables_only": sorted(WRITE_STAGING_TABLES),
        "write_live_allowed": False,
    }
