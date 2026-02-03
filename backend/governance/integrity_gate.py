"""
Integrity Gate — Hard Gate middleware that runs after any Agentic adjustment.

Accounting Laws are defined in shared/config/financial_rules.json (equations + materiality).
Both Node (integrity_gate_service.ts) and Python load the same JSON so gates share the exact
same rules. Tolerance and materiality are read on each call; no cache.
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
_DEFAULT_MATERIALITY_FALLBACK = Decimal("0.01")


def _get_rules_config_path() -> Path:
    env_path = os.environ.get("RULES_CONFIG_PATH")
    if env_path:
        return Path(env_path)
    # backend/governance/integrity_gate.py -> project root = parent of backend
    this_dir = Path(__file__).resolve().parent
    project_root = this_dir.parent.parent
    return project_root / "shared" / "config" / "financial_rules.json"


def _load_financial_rules() -> dict[str, Any]:
    """Load shared/config/financial_rules.json. Same Accounting Laws as Node integrity_gate_service."""
    path = _get_rules_config_path()
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _get_tolerance_from_rules(rules: dict[str, Any], tolerance_key: str = "roundingTolerance") -> Decimal:
    """Resolve tolerance from rules (e.g. equations.*.toleranceKey -> roundingTolerance)."""
    if tolerance_key == "roundingTolerance":
        val = rules.get("roundingTolerance")
    else:
        val = rules.get(tolerance_key)
    if val is not None and isinstance(val, (int, float)):
        return Decimal(str(val))
    return _DEFAULT_TOLERANCE_FALLBACK


def _get_materiality_from_rules(rules: dict[str, Any]) -> Decimal:
    """Default materiality threshold from financial_rules.json (materiality.defaultThreshold)."""
    m = rules.get("materiality")
    if isinstance(m, dict):
        val = m.get("defaultThreshold")
        if val is not None and isinstance(val, (int, float)):
            return Decimal(str(val))
    return _DEFAULT_MATERIALITY_FALLBACK


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
    Run the Hard Gate using Accounting Laws from shared/config/financial_rules.json.
    Equations (debits_equal_credits, assets_equal_liabilities_plus_equity) define which checks run;
    toleranceKey (e.g. roundingTolerance) and materiality come from the same JSON as Node.
    """
    rules = _load_financial_rules()
    equations = rules.get("equations") or {}
    tol: Decimal
    if tolerance is not None:
        tol = Decimal(str(tolerance))
    else:
        # Use tolerance from equation config (same as Node)
        tb_eq = equations.get("debits_equal_credits") or {}
        tol_key = tb_eq.get("toleranceKey") or "roundingTolerance"
        tol = _get_tolerance_from_rules(rules, tol_key)

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
