# FinOS — To-Do & Setup Checklist

## API Keys & Environment Variables

### Required (for full agent features)

| Variable | Where | Purpose |
|----------|--------|---------|
| **ANTHROPIC_API_KEY** | Node API (port 3001) | Supervisor Agent, Orchestrator, Auditor (Skeptic), Justification chat, PDF export reasoning. **Required** for chat, ReAct reasoning, and agent workflows. Get from [Anthropic Console](https://console.anthropic.com/). |

### Optional (enhanced features)

| Variable | Where | Purpose |
|----------|--------|---------|
| **OPENAI_API_KEY** | Frontend (Next.js) | Voice transcription (Whisper) in CFO Dashboard. Without it, voice input returns 503. Get from [OpenAI API Keys](https://platform.openai.com/api-keys). |
| **OPENAI_API_KEY** | Node API (`src/`) | Optional embeddings for semantic memory (better similarity). Falls back to local embeddings if unset. |
| **PINECONE_API_KEY** | Node API (`src/memory`) | Optional cloud vector DB for financial memory. Unset = local in-memory store. |
| **BACKEND_PYTHON_URL** | Node API + Frontend | Python Flask backend URL (default `http://localhost:5000`). Set if Python backend runs elsewhere. |
| **NEXT_PUBLIC_API_URL** | Frontend | Node API base URL (default `http://localhost:3001`). Set for production or different port. |
| **NEXT_PUBLIC_JUSTIFY_URL** | Frontend | Justify/drill-down API (default `http://localhost:5000`). |
| **NEXT_PUBLIC_PYTHON_URL** | Frontend | Python backend for black-box logs / audit evidence (optional). |
| **AUDITOR_PORTAL_TOKEN** | Node API | Token for Auditor portal routes (default `auditor-readonly-2025`). Change in production. |

### Backend (Python) — optional overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| **USER_RULES_PATH** | `./user_rules` | Path to user rules for feedback loop. |
| **BLACK_BOX_DB_PATH** | backend dir | Path for black-box audit DB. |
| **GOVERNANCE_AUDIT_DB** | governance dir | Path for governance audit DB. |
| **COMPLIANCE_AUDIT_DB** | compliance dir | Path for compliance audit DB. |

---

## Where to set env vars

1. **Node API (port 3001)**  
   In project root: create `.env` and add `ANTHROPIC_API_KEY=sk-ant-...`.  
   If you use `npm run dev` from root for `src/server.ts`, ensure `.env` is in the same directory or that your process loads it (e.g. `dotenv` if added).

2. **Frontend (Next.js)**  
   In `frontend/`: create `.env.local` and add any `NEXT_PUBLIC_*` and server-only vars (e.g. `OPENAI_API_KEY` for Whisper).  
   Never commit `.env` or `.env.local` (add to `.gitignore`).

3. **Python backend**  
   Set in shell or a `.env` file loaded by your run script; optional overrides above.

---

## Run order (local)

1. **Python backend (Flask)** — port 5000  
   `cd backend` → `python app.py`

2. **Node API** — port 3001  
   From repo root: `npm run dev` (runs `tsx watch src/server.ts`).  
   Requires **ANTHROPIC_API_KEY** for Supervisor/chat/export.

3. **Frontend (Next.js)** — port 3000  
   `cd frontend` → `npm run dev`

---

## To-Do (implementation / product)

- [ ] Add `.env.example` in repo root and in `frontend/` listing all env vars (no secrets).
- [ ] Document in README: required vs optional env vars and how to get API keys.
- [ ] Consider `dotenv` (or similar) in Node API so `.env` in root is loaded automatically.
- [ ] PDF/OCR: finish PDF ingestion pipeline (currently mock in frontend).
- [ ] CFA modules: equity research, Black–Scholes, CAPM (planned).
- [ ] If using Pinecone: add `@pinecone-database/pinecone` and wire `PINECONE_API_KEY` in `src/memory`.
- [ ] Production: set strong `AUDITOR_PORTAL_TOKEN` and use HTTPS for all API URLs.
