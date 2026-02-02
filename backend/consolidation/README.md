# Multi-Entity Consolidation Engine

Roll-up trial balances from multiple subsidiaries (possibly in different currencies) into a single consolidated balance sheet. Uses ASC 830 for foreign currency translation and ASC 810 for consolidation.

## Features

- **Roll-up service**: Takes trial balances from up to N subsidiaries and produces one consolidated balance sheet in reporting currency.
- **ASC 830 translation**: Functional-to-reporting currency via `fx_rates_to_reporting` (or `translation_rates`). Non-USD amounts are translated at the provided rates.
- **Intercompany eliminations**: Pairs of receivable (entity A) / payable (entity B) accounts are netted. Elimination entries are produced for disclosure.
- **Minority interest**: Non-controlling interest (NCI) is computed as subsidiary equity × minority % and shown in equity (ASC 810-10-45).
- **Missing-IC agent**: If intercompany receivables and payables do not net to zero, the agent autonomously searches both ledgers (when `ledger_inputs` are provided) to find unmatched entries and suggests the missing transaction.

## API

- **POST /api/consolidation/rollup**

  Body: `reporting_currency`, `report_date`, `subsidiaries`, `fx_rates_to_reporting`, `intercompany_pairs`, `minority_ownerships`, optional `ledger_inputs`.

  Returns: Consolidated balance sheet, eliminations applied, minority interest, and (if IC doesn’t net) `missing_ic_recommendation` with variance and suggested entry.

## Usage

1. Build `ConsolidationInput` with subsidiary trial balances, FX rates, IC pairs, and optional minority ownerships and ledger inputs.
2. Call `roll_up_to_consolidated_balance_sheet(input_data)`.
3. Use `ConsolidationResult.consolidated_balance_sheet`, `eliminations_applied`, `minority_interest`, and `missing_ic_recommendation` as needed.

## Files

- `models.py` — SubsidiaryTrialBalance, InterCompanyPair, ConsolidationInput, ConsolidationResult, etc.
- `rollup.py` — Translation, aggregation, eliminations, minority interest.
- `eliminations.py` — Intercompany netting and elimination entries.
- `missing_ic_agent.py` — Search for missing intercompany transaction when balances don’t net.
