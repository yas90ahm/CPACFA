# Data Privacy, Security & AI Isolation FAQ

**Purpose:** Answer the questions a senior ops, IT, or security person will ask. Short, substantive answers. All answers are based on current implementation or documented pilot constraints.

---

**1) What customer data do you ingest?**

Trial balance data (account, debit, credit, and related columns from CSV/XLSX or equivalent API payload), close session and checklist data, journal entries and adjustments, and optional prior-period or comparative data. Authentication and tenant context (e.g. tenant ID, role) are also processed. The system does not ingest data from the customer’s ERP or GL unless the customer explicitly sends it (e.g. via upload or an integration they configure).

---

**2) Where is customer data stored?**

In the application’s own database (e.g. Postgres), scoped by tenant. Staging items, period trial balance, journal entries, close sessions, audit ledger entries, shadow audit findings, AI call log (when AI is used), and similar data are stored in tenant-scoped tables. There is no cross-tenant access in the implemented logic. The deployment decides where the database runs (on-premises, VPC, or managed cloud); the application does not ship data to a third-party data store other than as noted below for AI.

---

**3) How do you prevent tampering / ensure integrity?**

- **Hash-chained audit ledger.** Material events are appended to an append-only ledger; each entry includes the previous entry’s hash and its own computed hash. Verification walks the chain and recomputes hashes; if any link is broken or altered, verification fails. The export gate runs this verification before allowing certified export; if the chain is invalid, certified export is blocked.

- **Export gate.** Certified export is only allowed when the close session is certified, the audit chain verifies, server-side materiality state is read from the database (not from the client), and the final integrity check (trial balance balance, balance sheet equation, optional plug detection) passes. There is no configured bypass for these checks in production.

- **Role checks and audit log.** Critical actions (period lock, certify, JE approve/post) are gated by role and recorded. The system does not trust client-supplied flags for materiality; it reads from server-side state.

---

**4) Who can approve changes / how is accountability enforced?**

Approval and other controlled actions are gated by role (preparer, reviewer, approver). The system checks the actor’s role before allowing the action (e.g. period lock, certify close, journal entry approval, journal entry post) and records the outcome in the audit log. Only users with the approver role can perform those actions. Staging items require a human approve/reject; the system records the outcome. Amounts used in resolve-ingest or adjustments must have a valid provenance (e.g. human_entered, engine_calculation, ledger_exact); the system rejects requests without it so that every material amount is attributable.

---

**5) Do you send customer data to external AI providers?**

When AI is **enabled** (i.e. when `AI_MOCK` is not set to `true` and the relevant API key is set), the application sends prompts to the configured LLM provider (Anthropic, OpenAI, or Mistral) via that provider’s public API. The prompts can include data derived from the customer’s tenant (e.g. journal entry lines, account names, amounts) for the purposes of the AI pillar (e.g. Shadow Auditor, classifier, justifier, advisor). So **yes**, in that configuration, some customer data is sent to the external provider’s API. When AI is **disabled** (e.g. `AI_MOCK=true`), no external AI provider is called; the system uses deterministic or mock responses only.

---

**6) If AI is used, what data is sent, and how is it minimized?**

The data sent is what is needed to run the specific pillar (e.g. for Shadow Auditor: journal entry context such as account names, amounts, and policy snippets; for classifier: ingestion rows). The application does not send the full tenant database; it sends the minimal context required for the prompt. Prompts and model are defined in code; there is no generic “send everything” path. Request and response are logged to the tenant-scoped `ai_call_log` (sanitized request JSON, response raw/JSON, ok/error) for audit. **Minimization today is by design (narrow prompts and context), not by a separate redaction layer.** For stricter control, the organization can disable AI (see below) or use a deployment where AI runs in an isolated environment (see Q7–Q8).

---

**7) Can AI run inside a VPC / private network so data never touches the public internet?**

**Not in the current implementation.** When AI is used, the code calls the provider’s SDK (Anthropic, OpenAI, or Mistral) with the provider’s public API endpoint and the API key from environment variables. That traffic goes to the provider’s public API and thus leaves the customer’s private network unless the customer’s network routes it through a proxy or the provider offers a dedicated/VPC endpoint that the deployment configures at the network level. The application itself does not implement a private or VPC endpoint; it uses the standard SDK entry points. **Planned (post-pilot):** Support for running AI in a customer-controlled or vendor-hosted private environment (e.g. vendor-hosted VPC or customer-hosted model) is a credible path but is not implemented today. For maximum isolation today, the organization should **disable AI** (e.g. set `AI_MOCK=true`) so that no data is sent to any external AI provider.

---

**8) What are the deployment options for AI isolation?**

- **A. Disable AI.** Set `AI_MOCK=true` (and optionally pillar-specific mocks such as `AI_MOCK_CLASSIFIER`, `AI_MOCK_ADVISOR`). No external AI provider is called. Shadow Auditor and other pillars use deterministic or mock responses. Balance, export gate, and integrity checks do not depend on AI and remain in effect. This is the only option in the current codebase that guarantees no customer data is sent to an external AI provider.

- **B. Vendor-hosted (current default when AI is on).** The application uses the configured provider (Anthropic, OpenAI, or Mistral) via that provider’s public API. Data in prompts is sent to the provider’s infrastructure. Compliance and data-residency concerns are addressed by the customer’s agreement with the provider and by the provider’s policies (e.g. no training on API data). The application does not use customer data for training (see Q9).

- **C. Customer-hosted or vendor-hosted private VPC.** Not implemented today. A future option could be to support a customer-hosted model or a vendor-hosted deployment in the customer’s VPC so that data does not leave the customer’s network. **Planned (post-pilot);** not available in the current release.

---

**9) Is customer data used for training?**

**No.** The application does not send customer data to any training pipeline. It sends data only in the context of inference (prompt/response) when AI is enabled. Contractual expectations: customers should require in their agreement with the LLM provider that API data is not used for training (many providers commit to this in their terms). The codebase does not implement or invoke any training on tenant or customer data.

---

**10) How do you handle secrets (JWT secret, DB credentials)?**

Secrets are supplied via environment variables (e.g. `JWT_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`). They are not hardcoded. The structured logger redacts values whose keys (case-insensitive) contain: secret, password, token, key, authorization, cookie. So log output does not include those values. Application code does not log raw secrets. It is the deployer’s responsibility to secure the environment (e.g. secret manager, restricted access to env).

---

**11) What logging exists and what is redacted?**

Structured JSON logging (stdout/stderr) with request correlation (request_id when in request context). Log meta (object passed to the log function) is redacted for keys containing: secret, password, token, key, authorization, cookie; their values appear as `[REDACTED]`. AI call log in the database stores request_json (intended to be sanitized by the caller), response_raw, response_json, and error; API keys are not stored. Database connection URLs are redacted in reset/bootstrap logging (password not printed). Full request/response bodies are not automatically redacted beyond the key-based redaction above; sensitive payloads should not be logged in meta or should be sanitized before logging.

---

**12) What is your incident response posture today (pilot) vs later (production)?**

**Pilot:** No formal incident response process or runbooks are delivered in the codebase. The pilot is run in parallel with no operational dependency; if the system fails, the existing close and reporting continue. Any incident response during the pilot is the responsibility of the organization (e.g. internal IT, support). **Production:** Formal incident response, runbooks, and escalation are typical production requirements. **Planned (post-pilot)** or organization-defined; not implemented as part of the application today.

---

**13) How do you support deletion / retention policies?**

Data is stored in the application database in tenant-scoped tables. The application does not implement automated retention or deletion policies (e.g. “delete after N days”). Deletion or archival of tenant data would be done by the organization (e.g. SQL or admin tools against the database, or a future administrative endpoint). For the pilot, if the pilot is stopped, the organization can archive or delete the pilot tenant’s data; there is no dependency on this system for production data. **Planned (post-pilot):** Administrative endpoints or scripts for tenant data deletion and retention policies could be added; not present today.

---

**14) How do you prevent destructive scripts from running in the wrong environment?**

A dedicated guard module is used for destructive or seeding operations (e.g. schema reset, bootstrap). Such operations are **allowed** only when: (a) `NODE_ENV === 'test'`, or (b) `ALLOW_DB_RESET === 'true'` and `NODE_ENV` is not staging or production. If `NODE_ENV` is staging or production, destructive ops are **refused** even if `ALLOW_DB_RESET` is set; the runtime guard logs a fatal message and exits the process. The guard also supports a check that refuses to run when the database URL looks like production (e.g. contains “prod”). Deployers must not set `ALLOW_DB_RESET=true` in staging or production and should use a database URL that does not point at production for non-production runs.

---

*All answers are consistent with current code and configuration. Where something is not implemented, it is stated (e.g. “Not implemented,” “Planned (post-pilot)”).*
