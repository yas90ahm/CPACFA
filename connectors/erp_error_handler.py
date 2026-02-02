"""
ERP Error Handler — On validation error (e.g. Closed Period), autonomously research
period settings and suggest an alternative posting date.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Type

from .erp_adapters import ERPAdapter, ERPValidationError, PeriodSettings


@dataclass
class ErrorRecoveryResult:
    """Result of handling an ERP validation error: suggested alternative and narrative."""
    original_error_code: str
    original_message: str
    suggested_alternative_posting_date: Optional[str] = None
    current_period_id: Optional[str] = None
    open_periods_summary: str = ""
    narrative: str = ""
    recovered: bool = False


def handle_erp_validation_error(
    error: Exception,
    adapter: Optional[ERPAdapter] = None,
    requested_date: Optional[str] = None,
) -> ErrorRecoveryResult:
    """
    If the ERP API returned a validation error (e.g. Closed Period), research current
    period settings and suggest an alternative posting date.
    """
    if not isinstance(error, ERPValidationError):
        return ErrorRecoveryResult(
            original_error_code="UNKNOWN",
            original_message=str(error),
            narrative="Error is not an ERP validation error; no period research performed.",
            recovered=False,
        )

    code = error.code
    message = error.message
    req_date = requested_date or (error.details.get("requested_date") if error.details else None)

    if code != "CLOSED_PERIOD" or adapter is None:
        return ErrorRecoveryResult(
            original_error_code=code,
            original_message=message,
            narrative=f"ERP validation error: {code}. {message}. No alternative date suggested (adapter not available or error type not CLOSED_PERIOD).",
            recovered=False,
        )

    # Research period settings
    try:
        settings = adapter.get_period_settings()
    except Exception as e:
        return ErrorRecoveryResult(
            original_error_code=code,
            original_message=message,
            narrative=f"ERP returned Closed Period. Attempted to research period settings but failed: {e}. Suggested action: ask user for an open posting period.",
            recovered=False,
        )

    # Suggest first open period start date as alternative
    open_periods = [p for p in settings.open_periods if p.is_open]
    if not open_periods:
        return ErrorRecoveryResult(
            original_error_code=code,
            original_message=message,
            current_period_id=settings.current_period_id,
            open_periods_summary="No open periods returned from ERP.",
            narrative="ERP returned Closed Period. Period research found no open periods. User must open a period in the ERP or choose a valid date.",
            recovered=False,
        )

    # Use first open period's start date as suggested alternative
    first_open = open_periods[0]
    suggested_date = first_open.start_date
    open_summary = "; ".join(
        f"{p.period_id} ({p.start_date}–{p.end_date})" for p in open_periods[:5]
    )

    return ErrorRecoveryResult(
        original_error_code=code,
        original_message=message,
        suggested_alternative_posting_date=suggested_date,
        current_period_id=settings.current_period_id,
        open_periods_summary=open_summary,
        narrative=(
            f"ERP returned Closed Period for the requested date. "
            f"Current period settings were researched. "
            f"Suggested alternative posting date: {suggested_date} (start of open period {first_open.period_id}). "
            f"Open periods: {open_summary}. "
            "The bot should suggest reposting with this date or confirm with the user before retrying."
        ),
        recovered=True,
    )
