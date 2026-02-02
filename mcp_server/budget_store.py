"""
Simple budget store for check_budget tool.
Account/period budget limits; compare actual or proposed amount against limit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

# account_code -> period_key -> limit (decimal)
_budget_limits: dict[str, dict[str, Decimal]] = {}
# account_code -> period_key -> current amount (for comparison)
_budget_actuals: dict[str, dict[str, Decimal]] = {}


@dataclass
class BudgetCheckResult:
    account_code: str
    period: str
    limit: Decimal
    current_or_proposed: Decimal
    within_limit: bool
    remaining: Decimal
    message: str


def set_budget_limit(account_code: str, period: str, limit: str | Decimal) -> None:
    """Set a budget limit for an account/period (for demo or admin)."""
    acc = (account_code or "").strip()
    prd = (period or "").strip()
    if not acc:
        return
    if acc not in _budget_limits:
        _budget_limits[acc] = {}
    _budget_limits[acc][prd] = Decimal(str(limit))


def set_budget_actual(account_code: str, period: str, amount: str | Decimal) -> None:
    """Set current actual for an account/period (for comparison)."""
    acc = (account_code or "").strip()
    prd = (period or "").strip()
    if not acc:
        return
    if acc not in _budget_actuals:
        _budget_actuals[acc] = {}
    _budget_actuals[acc][prd] = Decimal(str(amount))


def check_budget(
    account_code: str,
    period: str,
    proposed_amount: str | Decimal,
    current_actual: Optional[str | Decimal] = None,
) -> BudgetCheckResult:
    """
    Check whether a proposed amount (or current actual) is within budget for account/period.
    If no limit is set, returns within_limit=True and remaining=proposed (informational).
    """
    acc = (account_code or "").strip()
    prd = (period or "").strip()
    proposed = Decimal(str(proposed_amount))
    current = Decimal(str(current_actual)) if current_actual is not None else (_budget_actuals.get(acc) or {}).get(prd, Decimal("0"))
    limit = (_budget_limits.get(acc) or {}).get(prd, Decimal("0"))
    if limit == 0:
        return BudgetCheckResult(
            account_code=acc,
            period=prd,
            limit=limit,
            current_or_proposed=proposed,
            within_limit=True,
            remaining=proposed,
            message="No budget limit set for this account/period; check is informational.",
        )
    # Compare proposed (or current) against limit
    total = current + proposed
    within = total <= limit
    remaining = limit - total
    return BudgetCheckResult(
        account_code=acc,
        period=prd,
        limit=limit,
        current_or_proposed=proposed,
        within_limit=within,
        remaining=remaining,
        message="Within budget." if within else f"Over budget by {abs(remaining)}.",
    )


def seed_demo_budgets() -> None:
    """Seed demo budget limits for testing check_budget."""
    set_budget_limit("5100", "2025-01", "50000")
    set_budget_limit("7100", "2025-01", "200000")
    set_budget_limit("7200", "2025-01", "24000")
