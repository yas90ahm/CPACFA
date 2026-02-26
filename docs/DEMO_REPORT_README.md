# CloudMetrics Inc. End-to-End Demo Report

This demo simulates a complete monthly financial close for **CloudMetrics Inc.** (fictional mid-market SaaS, ARR ~$8M, 45 employees).

## Quick Start

```bash
# Generate the report (runs validation and embeds data)
npm run demo:report

# Open the report
# Windows: start docs/CLOUDMETRICS_DEMO_REPORT.html
# macOS: open docs/CLOUDMETRICS_DEMO_REPORT.html
```

## Contents

1. **Trial Balance Ingestion** — Sample CSV with ~47 accounts, $47k Miscellaneous Expense (plug detection)
2. **Close Session State Machine** — All transitions Draft → Certified + invalid transition rejections
3. **Evidence Anchoring** — 3 sample evidence files with SHA-256 hashes and JE linkage
4. **Snapshot & Certification** — Deterministic snapshot, hash, Ed25519 signature
5. **Export Gating** — Valid certified export, tamper block (403), draft watermark
6. **AI Boundaries** — Staging table writes, direct period_trial_balance rejection, approval flow
7. **Audit Chain Verification** — Full hash chain walk

## Files

- `samples/cloudmetrics_trial_balance_demo.csv` — Trial balance input
- `scripts/demo_report_runner.ts` — Validation + hash generation (standalone)
- `scripts/generate_demo_report.ts` — Embeds runner output into HTML
- `docs/CLOUDMETRICS_DEMO_REPORT.html` — Final report (open in browser)

## Running Against Live System

To produce a real certified PDF with a live server and database:

1. Start the server: `npm run dev`
2. Run the happy-path example: `npm run example:happy-path`
3. Use the ingest API with `samples/cloudmetrics_trial_balance_demo.csv`
4. Create a close session, advance to certified, and export via `/api/export/pdf` with `exportMode: 'certified'`

The demo report documents expected behaviors and data structures; the live system enforces them.
