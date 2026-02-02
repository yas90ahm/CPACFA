"""
Multi-Entity Consolidation Engine.
- Roll-up trial balances from subsidiaries (multi-currency via ASC 830).
- Intercompany eliminations (receivables/payables); minority interest.
- Agent: find missing intercompany transaction when IC accounts don't net to zero.
"""
from .models import (
    SubsidiaryTrialBalance,
    SubsidiaryLedgerInput,
    GLEntryLike,
    InterCompanyPair,
    MinorityOwnership,
    ConsolidationInput,
    ConsolidationResult,
    EliminationEntry,
    MinorityInterestLine,
)
from .rollup import roll_up_to_consolidated_balance_sheet
from .eliminations import (
    compute_intercompany_eliminations,
    InterCompanyEliminationResult,
)
from .missing_ic_agent import find_missing_ic_transaction, MissingICRecommendation

__all__ = [
    "SubsidiaryTrialBalance",
    "SubsidiaryLedgerInput",
    "GLEntryLike",
    "InterCompanyPair",
    "MinorityOwnership",
    "ConsolidationInput",
    "ConsolidationResult",
    "EliminationEntry",
    "MinorityInterestLine",
    "roll_up_to_consolidated_balance_sheet",
    "compute_intercompany_eliminations",
    "InterCompanyEliminationResult",
    "find_missing_ic_transaction",
    "MissingICRecommendation",
]
