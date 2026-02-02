# Accounting Policy Monitor (consistency_check)

The **Accounting Policy Monitor** verifies that accounting treatment for similar items is consistent across periods (Year-over-Year) and that the Chart of Accounts (COA) mapping has not drifted or been corrupted.

---

## 1. Task

- **YoY consistency:** Verify that the accounting treatment for similar items is consistent across different periods.
- **Example:** If the bot capitalized R&D costs in Q1, it cannot suddenly expense them in Q2 without a **'Change in Accounting Principle'** justification (e.g. ASC 250-10-45).
- **COA compliance:** Ensure the Chart of Accounts mapping has not drifted or become corrupted by messy user data (duplicate codes, invalid types, orphan mappings, description→account drift).

---

## 2. Usage

### Record treatments

When the system applies a treatment (e.g. R&D → capitalize in 2024-Q1), record it:

- **POST /api/compliance/treatment**  
  Body: `{ "item_key": "R&D", "period": "2024-Q1", "treatment_kind": "capitalize", "account_code": "1500", "citation": "ASC 350-40" }`  
  Or `{ "treatments": [ ... ] }` for bulk.

### Record Change in Accounting Principle

If treatment is intentionally changed (e.g. switch from capitalize to expense with justification):

- **POST /api/compliance/policy-change-justification**  
  Body: `{ "effective_date": "2024-04-01", "policy_area": "R&D capitalization", "change_description": "Switched to expensing R&D per ASC 730", "citation": "ASC 250-10-45", "reasoning": "..." }`

### Run consistency check

- **POST /api/compliance/consistency-check**  
  Body: `current_treatments`, `period_current`, `period_prior?`, `coa?`, `description_to_account?`, `prior_description_to_account?`, `recorded_justifications?`.  
  Returns: `passed`, `coa_valid`, `summary`, `flags` (treatment_change, coa_duplicate, coa_invalid_type, coa_orphan, coa_drift).

### Validate COA only

- **POST /api/compliance/validate-coa**  
  Body: `coa` (list or dict), `description_to_account?`, `prior_description_to_account?`.  
  Returns: `valid`, `flags`.

### Query

- **GET /api/compliance/treatments?period=2024-Q1** — treatments for a period.  
- **GET /api/compliance/policy-change-justifications?period_start=&period_end=&policy_area=** — list justifications.

---

## 3. Implementation

- **Backend:** `backend/consistency_check.py`  
  - `TreatmentRecord`, `PolicyChangeJustification`, `ConsistencyFlag`, `ConsistencyReport`  
  - SQLite store: `treatment_history`, `policy_change_justifications`  
  - `run_consistency_check()`, `validate_coa()`, `record_treatment()`, `record_policy_change_justification()`, getters  
- **API:** `backend/app.py` — routes under `/api/compliance/` (consistency-check, treatment, policy-change-justification, treatments, policy-change-justifications, validate-coa).
