# Compliance Guardrail (RAG)

FinOS Compliance Guardrail enforces tax/FASB alignment for Tax Provision and related entries.

## Components

1. **Knowledge Base** (`knowledge_base.py`)  
   In-memory RAG store of 2025/2026 Tax Codes (e.g. IRC Section 162(m)) and FASB Updates (e.g. ASC 740). Replace with a real vector DB (Chroma, Pinecone) for production.

2. **Citation Check** (`citation_check.py`)  
   Runs on every Tax Provision calculation. Compares proposed entry to retrieved law; if logic contradicts stored law (e.g. deducting executive compensation in excess of $1M under 162(m)), returns violation.

3. **Logic**  
   If the check fails, execution stops and the API returns:
   - `allowed: false`
   - `warning_message`: `"Warning: Proposed entry may violate Section 162(m). Please review."`

4. **Audit Trail** (`audit_log.py`)  
   Every decision is logged in the **Chain of Thought** SQLite table (`compliance_audit.db`) with: `timestamp_utc`, `event_type`, `reasoning`, `citations`, `proposed_entry`, `outcome` (allowed/blocked), `warning_message`, optional `session_id`/`user_id`. Use for human auditors.

## API (Flask)

- **POST /api/compliance/tax-provision**  
  Body: `pretax_income`, `effective_tax_rate`; optional: `proposed_entry`, `session_id`, `user_id`.  
  Computes tax provision, runs Citation Check, logs to Chain of Thought. Returns `allowed`, `tax_provision_amount`, `warning_message` (if blocked), `citation_check`, `audit_log_id`, `reasoning`.

- **POST /api/compliance/citation-check**  
  Body: `proposed_entry` (object). Returns `passed`, `warning_message`, `citations_checked`, `reasoning`.

- **GET /api/compliance/audit-trail**  
  Query: `limit`, `event_type`, `outcome`. Returns `audit_trail` (list of Chain of Thought rows).

## Example: 162(m) block

```json
POST /api/compliance/tax-provision
{
  "pretax_income": "500000",
  "effective_tax_rate": "0.21",
  "proposed_entry": {
    "description": "Executive compensation deduction",
    "amount": "2000000"
  }
}
→ 200 OK
{
  "allowed": false,
  "tax_provision_amount": "105000.00",
  "warning_message": "Warning: Proposed entry may violate Section 162(m). Please review.",
  "citation_check": { "passed": false, "citations_checked": ["IRC Section 162(m)", ...], "reasoning": "..." },
  "audit_log_id": 2,
  "reasoning": "..."
}
```

## DB location

Default: `backend/compliance/compliance_audit.db`. Override with env `COMPLIANCE_AUDIT_DB` (directory path).
