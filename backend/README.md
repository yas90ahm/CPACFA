# FinOS CPA-Agent (Backend)

Python backend for the **CPA-Agent** that prepares formal financial statements, with FASB/IASB traceability.

## Components

| Module | Purpose |
|--------|--------|
| **accounting_engine.py** | General Ledger processing; Balance Sheet, P&L; Depreciation (SL, DDB); ASC 606 revenue; Statement of Cash Flows (Indirect); validation (Assets = Liabilities + Equity) |
| **justification_engine.py** | Justification Chat: answers "Why was this capitalized?" etc. with specific ASC citations (e.g. ASC 350-40) |
| **models.py** | Data models: GL accounts, entries, Trial Balance, Balance Sheet, P&L, Cash Flow, Depreciation, ASC 606 contracts |
| **app.py** | REST API: `/api/justify`, `/api/gl/process`, `/api/depreciation/schedule`, `/api/validate/balance-sheet` |

## Features

1. **General Ledger**  
   - Post entries; build Trial Balance and Balance Sheet.  
   - **Validation**: Assets = Liabilities + Equity at all times (ASC 210-10-45).

2. **Depreciation**  
   - **Straight-line (SL)** and **Double-declining balance (DDB)** schedules (ASC 360-10-35).

3. **Revenue Recognition**  
   - **ASC 606 5-step model**: identify contract, performance obligations, transaction price, allocate, recognize revenue when satisfied.

4. **Statement of Cash Flows**  
   - **Indirect method** (ASC 230-10-45): net income → adjustments (depreciation, working capital) → operating; investing; financing.

5. **Justification Engine**  
   - Chat: "Why was this capitalized?" → response citing **ASC 350-40** (internal-use software) or **ASC 360-10** (PP&E).  
   - Also handles: revenue recognition (ASC 606), balance sheet equation (ASC 210), cash flows (ASC 230), depreciation (ASC 360).

## API (Flask)

Run from `backend/`:

```bash
pip install -r requirements.txt
python app.py
```

- **POST /api/justify**  
  Body: `{ "question": "Why was this capitalized?" }`  
  Returns: `citation`, `explanation`, `codification_ref` (e.g. ASC 350-40).

- **POST /api/gl/process**  
  Body: `coa` (list of accounts with code, name, account_type), `entries` (date, description, debit_account, credit_account, amount), optional `as_of`.  
  Returns: trial_balance, balance_sheet, validation (Assets = Liabilities + Equity).

- **POST /api/depreciation/schedule**  
  Body: `method` (SL | DDB), `cost`, `salvage_value`, `useful_life_years`, `placed_in_service`, optional `asset_id`, `asset_description`.  
  Returns: depreciation schedule lines with codification ref.

- **POST /api/validate/balance-sheet**  
  Body: `assets`, `liabilities`, `equity`.  
  Returns: whether the equation balances.

- **GET /health**  
  Health check.

## Usage (Python)

```python
from decimal import Decimal
from datetime import date
from accounting_engine import CPAAgent, ChartOfAccounts, GLAccount, GLEntry, DepreciationMethod
from models import AccountType

coa = ChartOfAccounts(accounts={
    "1000": GLAccount("1000", "Cash", AccountType.ASSET),
    "4000": GLAccount("4000", "Revenue", AccountType.REVENUE),
})
agent = CPAAgent(coa)
agent.post_entry(GLEntry(date.today(), "Sale", "1000", "4000", Decimal("1000")))
tb = agent.trial_balance(date.today())
bs = agent.balance_sheet(date.today())  # Raises ValidationError if A != L + E
agent.validate_as_of(date.today())

# Depreciation
from accounting_engine import build_depreciation_schedule
sched = build_depreciation_schedule(
    DepreciationMethod.STRAIGHT_LINE,
    Decimal("10000"), Decimal("1000"), 5, date(2024, 1, 1),
    asset_id="EQ1", asset_description="Equipment",
)

# Justification
from justification_engine import justify
r = justify("Why was this capitalized?")
print(r.citation)       # FASB ASC 350-40
print(r.explanation)    # Under ASC 350-40, internal-use software costs were capitalized because...
```

## Codification References

- **ASC 210-10-45**: Balance Sheet (Assets = Liabilities + Equity).
- **ASC 220-10-45**: Comprehensive Income (P&L).
- **ASC 230-10-45**: Statement of Cash Flows (Indirect Method).
- **ASC 350-40**: Internal-Use Software—Capitalization.
- **ASC 360-10-35**: Depreciation (PP&E).
- **ASC 606-10-25**: Revenue from Contracts with Customers (5-step model).
