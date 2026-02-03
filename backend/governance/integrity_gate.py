"""
Integrity Gate — Hard Gate middleware that runs after any Agentic adjustment.

Performs deterministic checks:
1. Sum(Debits) == Sum(Credits) (trial balance)
2. Assets == Liabilities + Equity (balance sheet equation)

If the math fails, the service intercepts the response before it reaches the user
and returns an error to the Agent so the user never sees a Balance Sheet that doesn't balance.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Optional

DEFAULT_TOLERANCE = Decimal("0.01")

# Error returned to the Agent when the gate fails; response must not reach the user.
INTEGRITY_GATE_CRITICAL_MESSAGE = (
    "CRITICAL: Your proposed adjustment unbalances the ledger. Re-calculating."
)


@dataclass
class IntegrityGateResult:
    passed: bool
    error: Optional[str] = None
    trial_balance_balances: bool = True
    balance_sheet_balances: bool = True


def run_integrity_gate(
    total_debits: float | Decimal,
    total_credits: float | Decimal,
    total_assets: float | Decimal,
    total_liabilities: float | Decimal,
    total_equity: float | Decimal,
    tolerance: float | Decimal | None = None,
) -> IntegrityGateResult:
    """
    Run the Hard Gate: deterministic check that Sum(Debits) == Sum(Credits) and
    Assets == Liabilities + Equity. If either fails, return passed=False and the
    CRITICAL message so the response can be intercepted before reaching the user.
    """
    tol = Decimal(str(tolerance)) if tolerance is not None else DEFAULT_TOLERANCE
    d = Decimal(str(total_debits))
    c = Decimal(str(total_credits))
    a = Decimal(str(total_assets))
    l = Decimal(str(total_liabilities))
    e = Decimal(str(total_equity))

    trial_balance_gap = abs(d - c) > tol
    trial_balance_balances = not trial_balance_gap

    rhs = l + e
    balance_sheet_gap = abs(a - rhs) > tol
    balance_sheet_balances = not balance_sheet_gap

    passed = trial_balance_balances and balance_sheet_balances

    return IntegrityGateResult(
        passed=passed,
        error=None if passed else INTEGRITY_GATE_CRITICAL_MESSAGE,
        trial_balance_balances=trial_balance_balances,
        balance_sheet_balances=balance_sheet_balances,
    )


def run_integrity_gate_from_entries(
    entries: list[dict[str, Any]],
    total_assets: float | Decimal,
    total_liabilities: float | Decimal,
    total_equity: float | Decimal,
    tolerance: float | Decimal | None = None,
) -> IntegrityGateResult:
    """
    Run the gate when trial balance is given as a list of entries with 'debit' and 'credit' keys.
    """
    total_debits = sum(Decimal(str(e.get("debit") or 0)) for e in entries)
    total_credits = sum(Decimal(str(e.get("credit") or 0)) for e in entries)
    return run_integrity_gate(
        total_debits=float(total_debits),
        total_credits=float(total_credits),
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        total_equity=total_equity,
        tolerance=tolerance,
    )
