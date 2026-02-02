# Global Tax & FX Translation Engine

1. **FX Logic (ASC 830)**: Functional vs. reporting currency; remeasurement (monetary at current rate, nonmonetary at historical); unrealized gains/losses on foreign-currency monetary items (recognized in net income per ASC 830-20-35).

2. **Tax Provisioning (ASC 740)**: Deferred tax assets/liabilities from temporary differences between book and tax basis; DTA/DTL at enacted tax rate; rollforward.

3. **Nexus Checker**: If the bot detects sales in a new jurisdiction (via invoice address), it alerts the user to potential Sales Tax (VAT/GST) nexus requirements.

---

## 1. FX Logic (ASC 830)

- **Functional currency**: Currency of the primary economic environment (input).
- **Reporting currency**: Currency in which financial statements are presented (input).
- **Remeasurement**: Foreign-currency positions are remeasured to functional currency:
  - **Monetary** (receivables, payables, cash): current exchange rate at balance sheet date → unrealized G/L in net income.
  - **Nonmonetary** (inventory, PPE at historical): historical rate → no G/L from rate change.
- **Translation**: Functional to reporting currency; translation adjustments to OCI (not net income).

**APIs**:
- **POST /api/tax/fx/remeasure** — Body: `functional_currency`, `current_rates` (e.g. `{ "EUR": "1.08" }`), `as_of_date`, `positions` (each: `currency`, `amount`, `is_monetary`, `balance_date`, optional `historical_rate`). Returns remeasured amounts and rate used per position.
- **POST /api/tax/fx/unrealized-gl** — Body: `positions`, `functional_currency`, `current_rates`, optional `prior_functional_amounts` (account_code → prior period functional amount). Returns total unrealized FX gain/loss for monetary items.

---

## 2. Tax Provisioning (ASC 740)

- **Temporary differences**: Book basis minus tax basis (e.g. depreciation timing, accruals, reserves).
- **Deductible temporary differences** (future deductible) → Deferred tax asset (DTA).
- **Taxable temporary differences** (future taxable) → Deferred tax liability (DTL).
- DTA/DTL = temporary difference × enacted tax rate.

**API**: **POST /api/tax/deferred** — Body: `tax_rate`, optional `report_date`, `beginning_dta`, `beginning_dtl`, `temporary_differences` (each: `description`, `book_basis`, `tax_basis`, `is_deductible_temp`, optional `reversal_period`). Returns rollforward: `ending_dta`, `ending_dtl`, `net_dta`, `details`.

---

## 3. Nexus Checker

- **Input**: Invoice address (e.g. "123 Main St, Seattle, WA 98101, USA") or list of addresses.
- **Logic**: Parse country/state; compare to known nexus list. If jurisdiction is not in known list → **new jurisdiction** → alert.
- **Alert**: "Potential new jurisdiction: US / WA. Sales in this jurisdiction may create Sales Tax (US), VAT, or GST nexus. Consider consulting tax advisor for registration and collection requirements."

**APIs**:
- **POST /api/tax/nexus/check** — Body: `invoice_address` (string) or `invoice_addresses` (array). Returns `jurisdiction_country`, `jurisdiction_state`, `is_new_jurisdiction`, `alert_message`, `recommendation`.
- **GET /api/tax/nexus/known** — List known nexus jurisdictions.
- **POST /api/tax/nexus/known** — Body: `country`, optional `state`. Add a jurisdiction to known nexus (no alert for sales there).

---

## Package layout

- **tax/fx_engine.py** — ASC 830 remeasurement, translation, unrealized G/L.
- **tax/tax_provisioning.py** — ASC 740 deferred taxes from temporary differences.
- **tax/nexus_checker.py** — Parse invoice address, compare to known nexus, alert on new jurisdiction.
