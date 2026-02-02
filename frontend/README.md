# FinOS Dashboard — Frontend

High-fidelity dashboard built with **Next.js 14**, **Tailwind CSS**, and **Shadcn/UI**-style components.

## Features

- **File Upload**: Drag-and-drop zone for multi-file uploads (audit evidence, bank statements). Supports CSV, XLSX, PDF (accepts `.csv,.xlsx,.xls` by default; backend trial balance ingest is CSV/XLSX).
- **Agent Workspace**: Split-screen view. Left: prepared Financial Statement (table). Right: Agent Chat for justifications (e.g. "Why was this capitalized?" → ASC 350-40 citation).
- **Financial Visualization**: Recharts — Debt-to-Equity trend (bar) and Revenue growth trend (line).
- **SOC2 Audit Log (Mock)**: Every interaction with the bot is logged with timestamp, user ID, and the "Reasoning Path" the AI took. Collapsible panel at bottom.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Runs at [http://localhost:3000](http://localhost:3000).

## Environment

- `NEXT_PUBLIC_API_URL`: Node API base (default `http://localhost:3001`) — trial balance ingest, CFA endpoints.
- `NEXT_PUBLIC_JUSTIFY_URL`: Python CPA-Agent API (default `http://localhost:5000`) — justification chat.

Ensure the Node API (port 3001) and, for justifications, the Python backend (port 5000) are running. For cross-origin requests, configure CORS on both backends to allow `http://localhost:3000`.

## Project Structure

- `app/` — Next.js App Router (layout, page, globals.css).
- `components/` — UI (Shadcn-style) and feature components:
  - `file-upload-zone.tsx` — drag-and-drop multi-file upload.
  - `agent-workspace.tsx` — statement table + Agent Chat.
  - `financial-charts.tsx` — Recharts (Debt-to-Equity, Revenue growth).
  - `audit-log-panel.tsx` — SOC2 mock audit log viewer.
- `lib/` — `utils.ts`, `api.ts` (backend calls), `audit-log.ts` (mock SOC2 logging).
