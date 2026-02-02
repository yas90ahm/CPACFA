"""
Local Extraction engine — output models for Trial Balance and Transaction List.
Consumed by CPA Agent and downstream pipelines.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional


@dataclass
class TrialBalanceLine:
    """Single trial balance line (clean output for CPA Agent)."""
    account_code: str
    account_name: str
    debit: Decimal
    credit: Decimal
    account_type: Optional[str] = None  # ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE


@dataclass
class TransactionRow:
    """Single transaction (clean output for CPA Agent)."""
    date: Optional[str] = None  # ISO YYYY-MM-DD
    description: str = ""
    amount: Optional[Decimal] = None
    vendor: Optional[str] = None
    debit: Optional[Decimal] = None
    credit: Optional[Decimal] = None
    account_name: Optional[str] = None
    raw: Optional[dict[str, Any]] = None


@dataclass
class ExtractionResult:
    """Clean extraction output: Trial Balance and/or Transaction List for CPA Agent."""
    trial_balance: list[TrialBalanceLine] = field(default_factory=list)
    transaction_list: list[TransactionRow] = field(default_factory=list)
    raw_cleaned_rows: list[dict[str, Any]] = field(default_factory=list)
    source_file: str = ""
    errors: list[str] = field(default_factory=list)
    detected_format: str = ""  # "trial_balance" | "transaction_list" | "mixed"
