# FinOS Shared Financial Types

Core financial schemas in **Python (Pydantic)** and **TypeScript**, aligned for API and services.

## 1. LedgerEntry

- **Python** (`shared/types/python/schemas.py`): `LedgerEntry` with `id` (UUID), `timestamp`, `account_code`, `debit_amount`, `credit_amount`, `meta_justification`. All monetary fields are `Decimal`.
- **TypeScript** (`shared/types/ts/schemas.ts`): `LedgerEntry` with same fields; amounts as `DecimalString` (string) to avoid float.

## 2. FinancialStatement (nested, drill-down)

- **Balance Sheet**: `BalanceSheet` → `BalanceSheetSection[]` (assets, liabilities, equity) → `StatementLine[]` with optional `children` for drill-down.
- **P&L**: `ProfitAndLoss` → `ProfitAndLossSection[]` (revenue, expenses) → `StatementLine[]` with `children`.
- **Cash Flow**: `CashFlowStatement` → `CashFlowSection[]` (operating, investing, financing) → `StatementLine[]` with `children`.

Both Python and TypeScript use nested structures so UI/APIs can drill from section → line → sublines.

## 3. Strictness: Decimal for currency

- **Python**: All currency fields are `Decimal` (no floats).
- **TypeScript**: All currency fields are `DecimalString` (string). Use `parseDecimal` / `formatDecimal` for arithmetic and display.

## 4. Validation: Batch balance

- **Python**: `LedgerEntryBatch` has a Pydantic `@model_validator(mode="after")` that raises if `sum(entry.debit_amount) != sum(entry.credit_amount)`.
- **TypeScript**: Call `validateLedgerEntryBatch(entries)` or `createLedgerEntryBatch(entries)` before using a batch; they throw if debits ≠ credits.

## Usage

### Python (from repo root, PYTHONPATH includes repo root)

```python
from decimal import Decimal
from shared.types.python import LedgerEntry, LedgerEntryBatch

e1 = LedgerEntry(account_code="1000", debit_amount=Decimal("1000"), credit_amount=Decimal("0"), meta_justification="ASC 210")
e2 = LedgerEntry(account_code="4000", debit_amount=Decimal("0"), credit_amount=Decimal("1000"), meta_justification="ASC 606")
batch = LedgerEntryBatch(entries=[e1, e2])  # Valid: 1000 debits = 1000 credits
# LedgerEntryBatch(entries=[...])  # Invalid batch raises ValueError
```

### TypeScript

```ts
import { createLedgerEntryBatch, formatDecimal, type LedgerEntry } from './shared/types/ts';

const entries: LedgerEntry[] = [
  { id: crypto.randomUUID(), timestamp: new Date().toISOString(), account_code: '1000', debit_amount: '1000', credit_amount: '0', meta_justification: 'ASC 210' },
  { id: crypto.randomUUID(), timestamp: new Date().toISOString(), account_code: '4000', debit_amount: '0', credit_amount: '1000', meta_justification: 'ASC 606' },
];
const batch = createLedgerEntryBatch(entries);  // Throws if not balanced
```

## Layout

- `python/` — Pydantic models: `schemas.py`, `__init__.py`
- `ts/` — TypeScript types and validators: `schemas.ts`, `index.ts`
