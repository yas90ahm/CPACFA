# Financial Document Ingestion Pipeline

Processing pipeline for financial documents: parse PDF/Excel → extract transactions → classify to Chart of Accounts → flag low-confidence for human review.

## 1. Integration (Parsing)

- **unstructured**: Primary parser for PDF and Excel. Install with `pip install "unstructured[pdf]"` or `unstructured[all-docs]` for full support.
- **openpyxl**: Fallback for Excel (`.xlsx`) if unstructured is not used; no extra system deps.

See `parser.py`: `parse_document(file_path=..., content=..., filename=...)` returns a list of dicts (Excel: one dict per row; PDF: text/element chunks).

## 2. Extraction Logic

`extractor.py` identifies from parsed rows:

- **Transaction Date** — column variants: date, transaction_date, trans_date, value_date, etc.
- **Description** — description, desc, narrative, memo, details, particulars.
- **Amount** — amount, debit, credit, value, sum.
- **Counterparty** — counterparty, payee, payer, name, party, beneficiary.

Output: list of `ExtractedTransaction` (transaction_date, description, amount, counterparty, raw_row).

## 3. Classification Agent

`classification_agent.py`: sub-agent that maps a raw description (e.g. "AWS Invoice #123") to a Chart of Accounts code (e.g. 5100 - IT Infrastructure).

- Rule-based keyword/regex patterns (configurable).
- Returns `ClassificationResult`: account_code, account_name, confidence (0.0–1.0), needs_review (True if confidence < threshold).

Default rules include: IT/cloud (5100), payroll (7100), rent (7200), utilities (7300), legal/professional (7500), travel (7700), marketing (7800), revenue (4000), etc.

## 4. Human-in-the-Loop

- Confidence threshold default: **90%** (`confidence_threshold=0.9`).
- If `classification.confidence < 0.9`, `needs_review` is True and the item is included in `PipelineResult.needs_review`.
- The API response includes a `needs_review` list so the UI can flag these for the user.

## API

- **POST /api/ingestion/process**  
  - Body: multipart form with `file` (PDF or Excel).  
  - Response: `extracted`, `classified`, `needs_review` (items with confidence < 90%), `errors`.

## Usage

```python
from ingestion.pipeline import process_document

result = process_document(content=pdf_bytes, filename="statement.pdf", confidence_threshold=0.9)
for ct in result.needs_review:
    print("Review:", ct.extracted.description, "→", ct.classification.account_code, ct.classification.confidence)
```

## Layout

- `parser.py` — PDF/Excel parsing (unstructured + openpyxl fallback).
- `extractor.py` — Transaction Date, Description, Amount, Counterparty extraction.
- `classification_agent.py` — Description → CoA code + confidence; rules and threshold.
- `pipeline.py` — Orchestrates parse → extract → classify → set needs_review.
- `models.py` — ExtractedTransaction, ClassificationResult, ClassifiedTransaction, PipelineResult.
