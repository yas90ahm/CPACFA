# Local Extraction Engine

**Input:** PDF, CSV, Excel from the frontend.  
**Logic:** Layout-aware OCR (unstructured) for PDF; pandas/openpyxl for CSV/Excel.  
**Data cleaning:** Standardize column names (Vendor, Price, Date, AccountName, Debit, Credit).  
**Output:** Clean Trial Balance or Transaction List JSON for the CPA Agent.

## Usage

- **API:** `POST /api/parser/extract` with multipart `file` (PDF, CSV, or Excel).
- **Python:** `from parser import extract; result = extract(content=bytes, filename="file.pdf", mime_type="application/pdf")`.

## Response

- `trial_balance`: list of `{ account_code, account_name, debit, credit }` when document looks like a trial balance.
- `transaction_list`: list of `{ date, description, amount, vendor, debit, credit }` for transaction/bank-style data.
- `raw_cleaned_rows`: standardized column names (Date, Vendor, Price, etc.).
- `detected_format`: `"trial_balance"` | `"transaction_list"` | `"mixed"`.

## Dependencies

- **PDF:** `unstructured[pdf]` (layout-aware extraction).
- **Excel:** `openpyxl` or `pandas`.
- **CSV:** stdlib `csv`.

Run the Flask app from the **backend** directory so the `parser` package resolves to this module.
