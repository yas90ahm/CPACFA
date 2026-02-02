"""
Production-ready ERP Adapters — NetSuite / SAP / QuickBooks.
Bi-directional sync: Draft state staged to ERP staging tables; read GL and period settings.
Simulated API responses; replace with real REST/SOAP in production.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional


# --- Errors (for error handler to detect e.g. Closed Period) ---

class ERPValidationError(Exception):
    """ERP API returned a validation error (e.g. Closed Period, invalid account)."""
    def __init__(self, code: str, message: str, details: Optional[dict[str, Any]] = None):
        self.code = code  # e.g. "CLOSED_PERIOD", "INVALID_ACCOUNT"
        self.message = message
        self.details = details or {}
        super().__init__(message)


# --- Period settings (for research + alternative posting date) ---

@dataclass
class PeriodInfo:
    """Single period (e.g. month) open/closed for posting."""
    period_id: str
    start_date: str
    end_date: str
    is_open: bool
    name: Optional[str] = None


@dataclass
class PeriodSettings:
    """Current and open periods from ERP (for error recovery)."""
    current_period_id: Optional[str] = None
    current_period_end: Optional[str] = None
    open_periods: list[PeriodInfo] = field(default_factory=list)
    fiscal_year_end: Optional[str] = None


# --- Draft entry for staging ---

@dataclass
class StagedDraftEntry:
    """Draft journal entry as staged in ERP (staging table)."""
    id: str
    erp_id: Optional[str] = None  # ERP staging record id
    date: str = ""
    description: str = ""
    debit_account: str = ""
    credit_account: str = ""
    amount: Decimal = Decimal("0")
    state: str = "DRAFT"  # DRAFT | PENDING_APPROVAL
    created_at: str = ""
    source: str = "mcp_agent"
    provider: str = "netsuite"  # netsuite | sap | quickbooks


# --- Abstract adapter ---

class ERPAdapter(ABC):
    """Abstract ERP adapter: read GL, period settings, stage draft, list staged drafts."""

    @property
    @abstractmethod
    def provider(self) -> str:
        """e.g. netsuite, sap, quickbooks."""
        pass

    @abstractmethod
    def read_gl(self, as_of: date, limit: int) -> dict[str, Any]:
        """Read General Ledger (live). Read-only."""
        pass

    @abstractmethod
    def get_period_settings(self) -> PeriodSettings:
        """Research current and open periods (for error recovery: suggest alternative posting date)."""
        pass

    @abstractmethod
    def stage_draft_entry(
        self,
        date_str: str,
        description: str,
        debit_account: str,
        credit_account: str,
        amount: Decimal,
        source: str = "mcp_agent",
    ) -> StagedDraftEntry:
        """Stage a journal entry in ERP staging table (Draft state). May raise ERPValidationError."""
        pass

    @abstractmethod
    def list_staged_drafts(self, limit: int) -> list[StagedDraftEntry]:
        """List draft entries from ERP staging table (for human review)."""
        pass


# --- NetSuite (simulated) ---

class NetSuiteAdapter(ERPAdapter):
    """NetSuite adapter. Replace with real NetSuite REST/SuiteTalk in production."""

    def __init__(self, simulate_closed_period_for_date: Optional[str] = None):
        # For testing: if posting date falls in this period, simulate CLOSED_PERIOD error
        self.simulate_closed_period_for_date = simulate_closed_period_for_date
        self._staged: list[StagedDraftEntry] = []

    @property
    def provider(self) -> str:
        return "netsuite"

    def read_gl(self, as_of: date, limit: int = 500) -> dict[str, Any]:
        return {
            "as_of": as_of.isoformat(),
            "lines": [],
            "total_debits": "0",
            "total_credits": "0",
            "balances": True,
        }

    def get_period_settings(self) -> PeriodSettings:
        today = date.today()
        # Simulate: current period = this month; next month open
        from calendar import monthrange
        _, last_day = monthrange(today.year, today.month)
        current_end = date(today.year, today.month, last_day)
        next_month = date(today.year, today.month + 1, 1) if today.month < 12 else date(today.year + 1, 1, 1)
        _, next_last = monthrange(next_month.year, next_month.month)
        next_end = date(next_month.year, next_month.month, next_last)
        return PeriodSettings(
            current_period_id=f"{today.year}-{today.month:02d}",
            current_period_end=current_end.isoformat(),
            open_periods=[
                PeriodInfo(f"{today.year}-{today.month:02d}", date(today.year, today.month, 1).isoformat(), current_end.isoformat(), True, f"Period {today.month}"),
                PeriodInfo(f"{next_month.year}-{next_month.month:02d}", next_month.isoformat(), next_end.isoformat(), True, f"Period {next_month.month}"),
            ],
            fiscal_year_end=f"{today.year}-12-31",
        )

    def stage_draft_entry(
        self,
        date_str: str,
        description: str,
        debit_account: str,
        credit_account: str,
        amount: Decimal,
        source: str = "mcp_agent",
    ) -> StagedDraftEntry:
        if self.simulate_closed_period_for_date and date_str <= self.simulate_closed_period_for_date:
            raise ERPValidationError(
                "CLOSED_PERIOD",
                "Period is closed for posting. Posting to this period is not allowed.",
                {"requested_date": date_str, "erp_code": "USER_ERROR"},
            )
        import uuid
        sid = str(uuid.uuid4())
        entry = StagedDraftEntry(
            id=sid,
            erp_id=f"NS-STAGED-{sid[:8]}",
            date=date_str,
            description=description,
            debit_account=debit_account,
            credit_account=credit_account,
            amount=amount,
            state="DRAFT",
            created_at=datetime.now(timezone.utc).isoformat(),
            source=source,
            provider=self.provider,
        )
        self._staged.append(entry)
        return entry

    def list_staged_drafts(self, limit: int = 100) -> list[StagedDraftEntry]:
        return list(reversed(self._staged[-limit:]))


# --- SAP (simulated) ---

class SAPAdapter(ERPAdapter):
    """SAP adapter. Replace with real SAP BAPI/OData in production."""

    def __init__(self, simulate_closed_period_for_date: Optional[str] = None):
        self.simulate_closed_period_for_date = simulate_closed_period_for_date
        self._staged: list[StagedDraftEntry] = []

    @property
    def provider(self) -> str:
        return "sap"

    def read_gl(self, as_of: date, limit: int = 500) -> dict[str, Any]:
        return {
            "as_of": as_of.isoformat(),
            "lines": [],
            "total_debits": "0",
            "total_credits": "0",
            "balances": True,
        }

    def get_period_settings(self) -> PeriodSettings:
        today = date.today()
        from calendar import monthrange
        _, last_day = monthrange(today.year, today.month)
        current_end = date(today.year, today.month, last_day)
        next_month = date(today.year, today.month + 1, 1) if today.month < 12 else date(today.year + 1, 1, 1)
        _, next_last = monthrange(next_month.year, next_month.month)
        next_end = date(next_month.year, next_month.month, next_last)
        return PeriodSettings(
            current_period_id=f"{today.year}{today.month:02d}",
            current_period_end=current_end.isoformat(),
            open_periods=[
                PeriodInfo(f"{today.year}{today.month:02d}", date(today.year, today.month, 1).isoformat(), current_end.isoformat(), True),
                PeriodInfo(f"{next_month.year}{next_month.month:02d}", next_month.isoformat(), next_end.isoformat(), True),
            ],
            fiscal_year_end=f"{today.year}-12-31",
        )

    def stage_draft_entry(
        self,
        date_str: str,
        description: str,
        debit_account: str,
        credit_account: str,
        amount: Decimal,
        source: str = "mcp_agent",
    ) -> StagedDraftEntry:
        if self.simulate_closed_period_for_date and date_str <= self.simulate_closed_period_for_date:
            raise ERPValidationError(
                "CLOSED_PERIOD",
                "Fiscal period is closed for posting (SAP).",
                {"requested_date": date_str},
            )
        import uuid
        sid = str(uuid.uuid4())
        entry = StagedDraftEntry(
            id=sid,
            erp_id=f"SAP-STAGED-{sid[:8]}",
            date=date_str,
            description=description,
            debit_account=debit_account,
            credit_account=credit_account,
            amount=amount,
            state="DRAFT",
            created_at=datetime.now(timezone.utc).isoformat(),
            source=source,
            provider=self.provider,
        )
        self._staged.append(entry)
        return entry

    def list_staged_drafts(self, limit: int = 100) -> list[StagedDraftEntry]:
        return list(reversed(self._staged[-limit:]))


# --- QuickBooks (simulated) ---

class QuickBooksAdapter(ERPAdapter):
    """QuickBooks Online adapter. Replace with real QBO API in production."""

    def __init__(self, simulate_closed_period_for_date: Optional[str] = None):
        self.simulate_closed_period_for_date = simulate_closed_period_for_date
        self._staged: list[StagedDraftEntry] = []

    @property
    def provider(self) -> str:
        return "quickbooks"

    def read_gl(self, as_of: date, limit: int = 500) -> dict[str, Any]:
        return {
            "as_of": as_of.isoformat(),
            "lines": [],
            "total_debits": "0",
            "total_credits": "0",
            "balances": True,
        }

    def get_period_settings(self) -> PeriodSettings:
        today = date.today()
        from calendar import monthrange
        _, last_day = monthrange(today.year, today.month)
        current_end = date(today.year, today.month, last_day)
        next_month = date(today.year, today.month + 1, 1) if today.month < 12 else date(today.year + 1, 1, 1)
        _, next_last = monthrange(next_month.year, next_month.month)
        next_end = date(next_month.year, next_month.month, next_last)
        return PeriodSettings(
            current_period_id=f"{today.year}-{today.month:02d}",
            current_period_end=current_end.isoformat(),
            open_periods=[
                PeriodInfo(f"{today.year}-{today.month:02d}", date(today.year, today.month, 1).isoformat(), current_end.isoformat(), True),
                PeriodInfo(f"{next_month.year}-{next_month.month:02d}", next_month.isoformat(), next_end.isoformat(), True),
            ],
            fiscal_year_end=f"{today.year}-12-31",
        )

    def stage_draft_entry(
        self,
        date_str: str,
        description: str,
        debit_account: str,
        credit_account: str,
        amount: Decimal,
        source: str = "mcp_agent",
    ) -> StagedDraftEntry:
        if self.simulate_closed_period_for_date and date_str <= self.simulate_closed_period_for_date:
            raise ERPValidationError(
                "CLOSED_PERIOD",
                "The books are closed for this period. You cannot add or edit transactions in closed periods.",
                {"requested_date": date_str},
            )
        import uuid
        sid = str(uuid.uuid4())
        entry = StagedDraftEntry(
            id=sid,
            erp_id=f"QBO-STAGED-{sid[:8]}",
            date=date_str,
            description=description,
            debit_account=debit_account,
            credit_account=credit_account,
            amount=amount,
            state="DRAFT",
            created_at=datetime.now(timezone.utc).isoformat(),
            source=source,
            provider=self.provider,
        )
        self._staged.append(entry)
        return entry

    def list_staged_drafts(self, limit: int = 100) -> list[StagedDraftEntry]:
        return list(reversed(self._staged[-limit:]))


def get_adapter(provider: str, simulate_closed_period_for_date: Optional[str] = None) -> ERPAdapter:
    """Factory: return adapter for netsuite | sap | quickbooks."""
    p = (provider or "netsuite").strip().lower()
    if p == "sap":
        return SAPAdapter(simulate_closed_period_for_date=simulate_closed_period_for_date)
    if p == "quickbooks" or p == "qbo":
        return QuickBooksAdapter(simulate_closed_period_for_date=simulate_closed_period_for_date)
    return NetSuiteAdapter(simulate_closed_period_for_date=simulate_closed_period_for_date)
