"""
Integrity Gate — Hard Gate middleware that runs after any Agentic adjustment.

Performs deterministic checks (rules from shared/config/financial_rules.json):
1. Sum(Debits) == Sum(Credits) (trial balance)
2. Assets == Liabilities + Equity (balance sheet equation)

If the math fails, the service intercepts the response before it reaches the user
and returns an error to the Agent so the user never sees a Balance Sheet that doesn't balance.

Rounding tolerance is read from shared/config/financial_rules.json on each call
so changes to the JSON file are respected instantly by both Node and Python.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

# Error returned to the Agent when the gate fails; response must not reach the user.
INTEGRITY_GATE_CRITICAL_MESSAGE = (
    "CRITICAL: Your proposed adjustment unbalances the ledger. Re-calculating."
)

_DEFAULT_TOLERANCE_FALLBACK = Decimal("0.01")


def _get_rules_config_path() -> Path:
    env_path = os.environ.get("RULES_CONFIG_PATH")
    if env_path:
        return Path(env_path)
    # backend/governance/integrity_gate.py -> project root = parent of backend
    this_dir = Path(__file__).resolve().parent
    project_root = this_dir.parent.parent
    return project_root / "shared" / "config" / "financial_rules.json"


def _get_rounding_tolerance_from_config() -> Decimal:
    """Read roundingTolerance from shared/config/financial_rules.json. No cache — re-reads each time."""
    path = _get_rules_config_path()
    if not path.exists():
        return _DEFAULT_TOLERANCE_FALLBACK
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        tol = data.get("roundingTolerance")
        if tol is not None and isinstance(tol, (int, float)):
            return Decimal(str(tol))
    except (json.JSONDecodeError, OSError):
        pass
    return _DEFAULT_TOLERANCE_FALLBACK


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
    When tolerance is not provided, uses roundingTolerance from shared/config/financial_rules.json.
    """
    tol = (
        Decimal(str(tolerance))
        if tolerance is not None
        else _get_rounding_tolerance_from_config()
    )
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
