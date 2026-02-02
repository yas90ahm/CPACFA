"""
FinOS Global Tax & FX Translation engine.
- FX Logic: ASC 830 (functional vs. reporting currency, unrealized gains/losses).
- Tax Provisioning: Deferred tax assets/liabilities from temporary differences (book vs. tax basis).
- Nexus Checker: Alert on sales in new jurisdiction (Sales Tax / VAT / GST nexus).
"""
from __future__ import annotations

from .fx_engine import (
    remeasure_to_functional,
    translate_to_reporting,
    compute_unrealized_fx_gain_loss,
    FXPosition,
    FXResult,
)
from .tax_provisioning import (
    compute_deferred_taxes,
    DeferredTaxRollforward,
    TemporaryDifference,
)
from .nexus_checker import (
    check_nexus,
    NexusCheckResult,
    add_known_nexus,
)

__all__ = [
    "remeasure_to_functional",
    "translate_to_reporting",
    "compute_unrealized_fx_gain_loss",
    "FXPosition",
    "FXResult",
    "compute_deferred_taxes",
    "DeferredTaxRollforward",
    "TemporaryDifference",
    "check_nexus",
    "NexusCheckResult",
    "add_known_nexus",
]
