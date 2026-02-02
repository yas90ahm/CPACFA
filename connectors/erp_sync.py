"""
Bi-directional Sync — Draft state: stage journal entries to ERP (NetSuite/SAP/QuickBooks)
for human review. Permission guard and error handling (e.g. Closed Period → suggest alternative date).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Optional

from .erp_adapters import (
    ERPAdapter,
    ERPValidationError,
    StagedDraftEntry,
    PeriodSettings,
    get_adapter as _get_adapter_raw,
)
from .permission_guard import check_read, check_write
from .erp_error_handler import handle_erp_validation_error, ErrorRecoveryResult


@dataclass
class StageDraftResult:
    """Result of staging a draft entry to ERP."""
    success: bool
    staged_entry: Optional[StagedDraftEntry] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    recovery: Optional[ErrorRecoveryResult] = None  # if Closed Period, suggested alternative date


_adapter_cache: dict[str, ERPAdapter] = {}


def get_adapter(provider: str, simulate_closed_period_for_date: Optional[str] = None) -> ERPAdapter:
    """Return ERP adapter (singleton per provider so stage/list share state in-process). Optional: simulate closed period for dates <= env ERP_SIMULATE_CLOSED_PERIOD_BEFORE."""
    key = (provider or "netsuite").strip().lower()
    closed = simulate_closed_period_for_date or os.environ.get("ERP_SIMULATE_CLOSED_PERIOD_BEFORE")
    if key not in _adapter_cache:
        _adapter_cache[key] = _get_adapter_raw(key, simulate_closed_period_for_date=closed)
    return _adapter_cache[key]


def stage_draft_to_erp(
    date_str: str,
    description: str,
    debit_account: str,
    credit_account: str,
    amount: Decimal,
    provider: str = "netsuite",
    source: str = "mcp_agent",
    requested_date_for_error: Optional[str] = None,
) -> StageDraftResult:
    """
    Stage a journal entry in ERP staging table (Draft state) for human review.
    Permission guard: write only to staging table. On validation error (e.g. Closed Period),
    research period settings and suggest alternative posting date.
    """
    check_write("journal_staging")
    adapter = get_adapter(provider)
    try:
        entry = adapter.stage_draft_entry(
            date_str=date_str,
            description=description,
            debit_account=debit_account,
            credit_account=credit_account,
            amount=amount,
            source=source,
        )
        return StageDraftResult(success=True, staged_entry=entry)
    except ERPValidationError as e:
        recovery = handle_erp_validation_error(
            e,
            adapter=adapter,
            requested_date=requested_date_for_error or date_str,
        )
        return StageDraftResult(
            success=False,
            error_code=e.code,
            error_message=e.message,
            recovery=recovery,
        )
    except Exception as e:
        return StageDraftResult(
            success=False,
            error_code="ERP_ERROR",
            error_message=str(e),
        )


def list_staged_drafts_from_erp(
    provider: str = "netsuite",
    limit: int = 100,
) -> list[dict[str, Any]]:
    """List draft entries from ERP staging table (for human review). Permission: read staging."""
    check_read("journal_staging")
    adapter = get_adapter(provider)
    entries = adapter.list_staged_drafts(limit=limit)
    return [
        {
            "id": e.id,
            "erp_id": e.erp_id,
            "date": e.date,
            "description": e.description,
            "debit_account": e.debit_account,
            "credit_account": e.credit_account,
            "amount": str(e.amount),
            "state": e.state,
            "created_at": e.created_at,
            "source": e.source,
            "provider": e.provider,
        }
        for e in entries
    ]


def get_period_settings_from_erp(provider: str = "netsuite") -> dict[str, Any]:
    """Research current and open periods (for error recovery / alternative posting date). Permission: read periods."""
    check_read("periods")
    adapter = get_adapter(provider)
    settings = adapter.get_period_settings()
    return {
        "current_period_id": settings.current_period_id,
        "current_period_end": settings.current_period_end,
        "fiscal_year_end": settings.fiscal_year_end,
        "open_periods": [
            {
                "period_id": p.period_id,
                "start_date": p.start_date,
                "end_date": p.end_date,
                "is_open": p.is_open,
                "name": p.name,
            }
            for p in settings.open_periods
        ],
    }
