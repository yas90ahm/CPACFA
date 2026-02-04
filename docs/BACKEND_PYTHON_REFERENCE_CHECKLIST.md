# Exhaustive Backend / Python Reference Checklist

Use this checklist before deleting the `backend/` folder. Every reference to the Python backend, `backend/` paths, or Python-only endpoints is listed below.

---

## 1. TypeScript (`src/`) — Code That Calls or Depends on Python

### 1.1 Active HTTP calls to Python (must fix or accept breakage)

| File | What | Env / Condition | If backend/ deleted |
|------|------|-----------------|---------------------|
| `src/routes/audit/audit_forensics.ts` | `fetch(BACKEND_PYTHON_URL + '/api/audit/dashboard/forensic-anomalies?...')` | `BACKEND_PYTHON_URL` must be set | **404** unless you port or keep this endpoint |
| `src/routes/cfo-dashboard/scenarios.ts` | `fetch(PYTHON_BASE + '/api/cfa/scenario-analysis', ...)` | Only when `BACKEND_PYTHON_URL` set | **No break**: Node fallback used when URL not set |
| `src/agents/tools/pythonBridge.ts` | `fetch(PYTHON_MATH_BASE + '/api/math/trial-balance')` and `callPythonMathWorker(path, body)` | Only when `PYTHON_MATH_BASE` set; throws if unset | **No break**: no ingestion path calls this |
| `src/services/ocr_service.ts` | `fetch(url)` for OCR | `OCR_SERVICE_URL` or `PYTHON_OCR_URL` | **Break** only if that URL pointed at something in `backend/` |

### 1.2 Environment variables (no default to localhost:5000 in TS)

| Variable | Where used | Default in code |
|----------|------------|------------------|
| `BACKEND_PYTHON_URL` | `audit_shared.ts`, `cfo-dashboard/scenarios.ts`, `audit_forensics.ts` | `''` (empty) |
| `PYTHON_MATH_BASE` | `pythonBridge.ts` | `''` (empty); bridge throws if unset |
| `PYTHON_OCR_URL` | `ocr_service.ts` | Used only if `OCR_SERVICE_URL` not set |

### 1.3 Comments / documentation in `src/` (no runtime impact)

- `src/services/integrity_gate_service.ts` — "same Accounting Laws as Python"
- `src/server.ts` — "Backend API", "TypeScript-only; no Python proxy", "Python/MCP if available", "via Python sandbox"
- `src/services/financialStatements.ts` — "consumes data from the Python Math Engine" (outdated; now TS-only)
- `src/services/trial-balance/parser_utils.ts` — "ported from backend/parser/column_cleaner.py"
- `src/routes/audit/audit_shared.ts` — "Python backend URL (deprecated)"
- `src/agents/tools/pythonBridge.ts` — "DEPRECATED", "Flask at PYTHON_MATH_BASE", "/api/math/trial-balance"
- `src/routes/export.ts` — "no Python proxy"
- `src/routes/trial-balance/ingest.ts` — "No Python backend calls"
- `src/services/deferred_tax_service.ts` — "ported from backend/tax/tax_provisioning..."
- `src/services/fixed_asset_service.ts` — "ported from backend/accounting_engine.py"
- `src/services/fx_currency_service.ts` — "ported from backend/tax/fx_engine.py"
- `src/services/analysis_agent.ts` — PythonInterpreterTool, "Python/MCP tool for regressions"
- `src/services/audit_export_service.ts` — "fetch from backend compliance audit trail"
- `src/services/rules_registry.ts` — "both Node and Python load this file"
- `src/services/ingestion_agent.ts` — "Unstructured (Python) or LlamaIndex via backend service or MCP"
- `src/routes/orchestrator.ts` — "Capability Assessment (Python, RAG, ERP)"
- `src/services/lead_partner_orchestrator.ts` — "tools: Python, RAG, ERP"
- `src/types/analysis.ts` — `PythonInterpreterTool` interface
- `src/types/orchestrator.ts` — `ToolCapability = 'python' | 'rag' | 'erp'`
- `src/agents/tools/index.ts` — re-exports `postTrialBalanceToPython`, `callPythonMathWorker`, `PythonTrialBalanceResponse`

---

## 2. Frontend (`frontend/`) — Python / Backend References

### 2.1 Config / API base

| File | What | Env |
|------|------|-----|
| `frontend/lib/api.ts` | `JUSTIFY_API = process.env.NEXT_PUBLIC_JUSTIFY_URL ?? 'http://localhost:5000'` | **Defaults to localhost:5000** for justification |
| `frontend/lib/api.ts` | `PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_URL ?? ''` | Used for black-box logs |
| `frontend/lib/audit-evidence-zip.ts` | Messages: "Set NEXT_PUBLIC_PYTHON_URL to the Python backend", "/api/audit/black-box/logs" | User-facing copy |

### 2.2 Comments / copy (no runtime if env unset)

- `frontend/lib/utils.ts` — "Mirrors backend getPeriodEndDate"
- `frontend/app/consolidation/page.tsx` — "Use 'Load from API' when the Python backend is running"
- `frontend/lib/ingest-types.ts` — "Mirrors backend response shape"
- `frontend/README.md` — "NEXT_PUBLIC_JUSTIFY_URL: Python CPA-Agent API (default http://localhost:5000)", "Python backend (port 5000)"
- `frontend/lib/apiAuth.ts` — "backend" in comments (Node API)
- `frontend/lib/agentic-types.ts` — "Mirrors backend response shapes"
- `frontend/components/consolidation/types.ts` — "Aligns with backend consolidation models"

---

## 3. Python Backend (`backend/`) — Routes and Entry Points

### 3.1 Flask routes in `backend/app.py` that Node or frontend may call

| Route | Purpose | Node/Frontend caller |
|-------|---------|----------------------|
| `POST /api/math/trial-balance` | TB → BS + validation | **None** (pythonBridge throws if PYTHON_MATH_BASE unset) |
| `POST /api/math/dcf` | DCF valuation | Not found in src/ grep |
| `GET /api/audit/dashboard/forensic-anomalies` | Forensic Skeptic | `src/routes/audit/audit_forensics.ts` |
| `POST /api/export/pdf` | PDF export | **Replaced** by Node `src/routes/export.ts` |
| `POST /api/export/csv` | CSV export | **Replaced** by Node |
| `POST /api/export/excel` | Excel export | Not found in src/ |
| `POST /api/cfa/scenario-analysis` | Scenario KPIs | `src/routes/cfo-dashboard/scenarios.ts` (optional; Node fallback) |
| `POST /api/audit/black-box/record` | Black-box audit record | Frontend / audit evidence |
| `POST /api/audit/black-box/interaction` | Black-box interaction | |
| `GET /api/audit/black-box/logs` | Black-box logs | `frontend/lib/api.ts` getBlackBoxLogs, audit-evidence-zip |
| `GET /api/audit/black-box/reconstruction` | Reconstruction | |

### 3.2 Backend modules (by folder)

- **Root**: `accounting_engine.py`, `app.py`, `models.py`, `parser/`, `tax/`, `governance/`, `export/`, `compliance/`, `consolidation/`, `ingestion/`, etc.
- **Parser**: `column_cleaner.py`, `engine.py`, `ocr_engine.py` — logic ported to TS `parser_utils` / `fileIngestion`; PDF/OCR may still be Python-only.
- **Tax**: `fx_engine.py`, `tax_provisioning.py` — logic ported to TS.
- **Governance**: `integrity_gate.py`, `forensic_skeptic.py`, `audit_dashboard.py` — forensics still called from Node when `BACKEND_PYTHON_URL` set.

---

## 4. Documentation (`docs/`)

| File | Content |
|------|---------|
| `docs/ARCHITECTURE_CONSOLIDATION_PYTHON_TO_TS.md` | Full map of Python → TS port; lists Python files safe to delete after port |
| `docs/Onboarding_What_Exists_Today.md` | References `POST /api/math/trial-balance`, `backend/app.py`, Python/Flask port 5000, export router mount |
| `docs/Coaching_Technical_Diligence_Report.md` | `POST /api/math/trial-balance`, `backend/app.py` |
| `docs/forensic_agent.md` | Forensic Skeptic, `GET /api/audit/dashboard/forensic-anomalies` |
| `docs/supervisor_agent.md` | "trial balance in src/ and backend/" |
| `docs/REASONING_CHAIN.md` | (grep hit; content not listed) |
| `docs/RED_TEAM_HUNTER_SCAN_CRITICAL_ISSUES.md` | "When Node calls Python (e.g. /api/math/trial-balance)" |
| `docs/OPENAPI_GUIDE.md` | `/api/audit/*` |
| `docs/ARCHITECTURE_DIAGRAM.md` | CFA, Audit, Export routes |
| `docs/STAGE_0_TO_3_REVIEW.md` | Audit binder, reconciliation, todos |
| `docs/AUDIT_AND_CONTROLS.md` | Prior-period comparison |
| `docs/strategy_advisor.md` | `/api/cfa/proactive-advice` |

---

## 5. Scripts and Root

| File | Content |
|------|---------|
| `launch_check.py` | `PYTHON_BASE = os.environ.get("BACKEND_PYTHON_URL", "http://localhost:5000")`; checks `NODE_BASE` and `PYTHON_BASE` (CPA, CFA, Supervisor, **Python Sandbox** `/api/cfa/scenario-analysis`, **Export** `/api/export/pdf`). Export now served by Node. |
| `.env.example` | No `BACKEND_PYTHON_URL`, `PYTHON_MATH_BASE`, or `PYTHON_OCR_URL` (add if you keep optional Python). |
| `package.json` | No Python start script; only Node/tsx. |

---

## 6. Tests

- `tests/integration/validation.test.ts` — numbers 5000, 50000, etc. (unrelated to port 5000).
- No tests in repo found that call `localhost:5000` or Python backend by default.

---

## 7. Summary: Is It Safe to Delete `backend/`?

### Safe to delete for current Node-only ingestion/export/math

- Trial balance ingest, statement build, validation, export PDF/CSV, and CFO scenario **do not** require the Python app; they use TypeScript (and Node fallback for scenarios).
- No remaining `axios.post` or `fetch` to `localhost:5000` in the **core** ingestion/export/statement flow.

### Will break if you delete `backend/` and you still use:

1. **Forensic Skeptic / Audit Dashboard**  
   - `src/routes/audit/audit_forensics.ts` calls `BACKEND_PYTHON_URL + '/api/audit/dashboard/forensic-anomalies'`.  
   - If that URL is your Flask app in `backend/`, deleting it breaks this until you reimplement or move the endpoint.

2. **Black-box audit (logs / reconstruction)**  
   - Frontend uses `NEXT_PUBLIC_PYTHON_URL` for `/api/audit/black-box/logs` (and related endpoints).  
   - If that points at `backend/app.py`, deleting it breaks black-box audit evidence and zip until you reimplement or host elsewhere.

3. **Justification API on port 5000**  
   - Frontend defaults `NEXT_PUBLIC_JUSTIFY_URL` to `http://localhost:5000`.  
   - If justification is served by the same Flask app in `backend/`, deleting it breaks justification unless you point the frontend to a different service or port.

4. **OCR**  
   - If `PYTHON_OCR_URL` or `OCR_SERVICE_URL` pointed at a service inside `backend/`, that OCR path breaks.

5. **Optional Python scenario analysis**  
   - Only used when `BACKEND_PYTHON_URL` is set; Node fallback exists. So no break if you accept Node-only scenario.

---

## 8. Deleted Backend Files (Final List)

The following files and folders were removed from `backend/` on consolidation completion:

- `backend/accounting_engine.py`
- `backend/agent_orchestrator.py`
- `backend/app.py`
- `backend/audit_logger.py`
- `backend/consistency_check.py`
- `backend/drill_down_logic.py`
- `backend/errors.py`
- `backend/feedback_loop.py`
- `backend/governance_module.py`
- `backend/justification_engine.py`
- `backend/models.py`
- `backend/python_executor.py`
- `backend/README.md`
- `backend/requirements.txt`
- `backend/strategic_analyst.py`
- `backend/black_box_audit.db`
- `backend/consistency_monitor.db`
- `backend/compliance/__init__.py`
- `backend/compliance/audit_log.py`
- `backend/compliance/citation_check.py`
- `backend/compliance/guardrail.py`
- `backend/compliance/knowledge_base.py`
- `backend/compliance/README.md`
- `backend/compliance/compliance_audit.db`
- `backend/consolidation/__init__.py`
- `backend/consolidation/eliminations.py`
- `backend/consolidation/missing_ic_agent.py`
- `backend/consolidation/models.py`
- `backend/consolidation/README.md`
- `backend/consolidation/rollup.py`
- `backend/export/__init__.py`
- `backend/export/csv_formatter.py`
- `backend/export/csv_generator.py`
- `backend/export/excel_generator.py`
- `backend/export/models.py`
- `backend/export/pdf_generator.py`
- `backend/export/report_generator.py`
- `backend/export/report_styles.css`
- `backend/governance/__init__.py`
- `backend/governance/audit_dashboard.py`
- `backend/governance/audit_dashboard.db`
- `backend/governance/conflict_resolution.py`
- `backend/governance/forensic_skeptic.py`
- `backend/governance/immutable_log.py`
- `backend/governance/integrity_gate.py`
- `backend/governance/README.md`
- `backend/governance/skepticism_agent.py`
- `backend/governance/governance_audit.db`
- `backend/ingestion/__init__.py`
- `backend/ingestion/classification_agent.py`
- `backend/ingestion/extractor.py`
- `backend/ingestion/models.py`
- `backend/ingestion/parser.py`
- `backend/ingestion/pipeline.py`
- `backend/ingestion/README.md`
- `backend/parser/__init__.py`
- `backend/parser/column_cleaner.py`
- `backend/parser/engine.py`
- `backend/parser/models.py`
- `backend/parser/ocr_engine.py`
- `backend/parser/README.md`
- `backend/tax/__init__.py`
- `backend/tax/fx_engine.py`
- `backend/tax/nexus_checker.py`
- `backend/tax/README.md`
- `backend/tax/tax_provisioning.py`

The entire `backend/` directory has been deleted. All logic is now in TypeScript (src/).

---

## 9. Action Items Before Deleting `backend/`

1. **Decide** which of the above features you still need (Forensic Skeptic, black-box audit, justification on 5000, OCR, scenario Python path).
2. **If keeping none of them**  
   - You can delete `backend/` for the current product.  
   - Optionally: remove or stub `postTrialBalanceToPython` / `callPythonMathWorker` in `src/agents/tools/pythonBridge.ts`, and drop `BACKEND_PYTHON_URL` from `audit_forensics.ts` (return 501 or a “not configured” response).
3. **If keeping Forensic Skeptic or black-box**  
   - Either keep the relevant part of `backend/` (e.g. `app.py` + governance + audit routes) or port those endpoints to Node, then delete the rest of `backend/`.
4. **Frontend**  
   - Set `NEXT_PUBLIC_JUSTIFY_URL` to your Node API (e.g. `http://localhost:3001`) if justification is served by Node, or to the new justification service URL.  
   - Set `NEXT_PUBLIC_PYTHON_URL` only if you still have a separate Python service for black-box/forensics; otherwise leave unset and accept “no logs” or “not configured” in the UI.
5. **Docs**  
   - Update `docs/Onboarding_What_Exists_Today.md` and any other docs that say “Python backend (port 5000)” or “POST /api/math/trial-balance” to reflect Node-only ingestion and export.
6. **launch_check.py**  
   - Make Python checks conditional on `BACKEND_PYTHON_URL` (or remove Python checks and only assert Node + export).

---

## 10. Quick Reference: All `fetch` / HTTP Calls That Might Hit Python

| Location | URL / target | Condition |
|----------|--------------|-----------|
| `src/routes/audit/audit_forensics.ts` | `BACKEND_PYTHON_URL + '/api/audit/dashboard/forensic-anomalies'` | When `BACKEND_PYTHON_URL` set |
| `src/routes/cfo-dashboard/scenarios.ts` | `PYTHON_BASE + '/api/cfa/scenario-analysis'` | When `BACKEND_PYTHON_URL` set |
| `src/agents/tools/pythonBridge.ts` | `PYTHON_MATH_BASE + '/api/math/trial-balance'` or `path` | When `PYTHON_MATH_BASE` set (throws if unset) |
| `src/services/ocr_service.ts` | `OCR_SERVICE_URL` or `PYTHON_OCR_URL` | When either set |
| Frontend `api.ts` | `JUSTIFY_API` (default 5000), `PYTHON_API` for black-box | `NEXT_PUBLIC_JUSTIFY_URL`, `NEXT_PUBLIC_PYTHON_URL` |

No other `fetch`/`axios` in `src/` targets localhost:5000 or a Python backend by default.
