# Cleanup report

Prepared on 2026-07-17 for the `repo-cleanup` branch.

## What changed

The repository root had become a shelf for every audit, review and completion report. The files were useful as history, but their location made them look current and made the real project hard to find.

This pass made 101 history-preserving moves:

- 95 audit, review, completion and planning files moved from the root to `docs/archive/audits/`
- `CFO_JOURNEY_PLAIN_ENGLISH.md`, `FEATURE_INVENTORY.md`, `SABIT_DESIGN_SYSTEM.md` and `SABIT_PRODUCT_DESIGN_SPEC.md` moved to `docs/product/`
- `DB_SETUP.md` moved to `docs/operations/DB_SETUP.md`
- `SECURITY_ATTACK_SURFACE_INVENTORY.md` moved to `docs/security/SECURITY_ATTACK_SURFACE_INVENTORY.md`

Each destination now has a short README explaining what belongs there. The archived reports are explicitly labelled as point-in-time records, not current proof.

## Deleted files

Thirty-six tracked files were removed:

- `.claude/settings.local.json`: machine-local assistant settings
- `.server.pid`: stale process identifier
- `GAAP Taxonomy/2025_GAAP_Taxonomy.xlsx`: byte-for-byte duplicate of the retained `data/2025_GAAP_Taxonomy.xlsx`
- `frontend/tsconfig.tsbuildinfo`: generated TypeScript cache
- `test-results.json` and `test-results-new.json`: generated test output
- all 30 PDFs under `data/evidence-test/`: generated tenant-labelled outputs from the evidence integration test

Named fixtures under `tests/` were retained. Migrations, environment templates, deployment files and lockfiles were retained.

## Documentation

- rewrote the root README in plain language
- added `PROJECT_STATUS.md` with verified checks and open risks
- grouped product, operations, security and historical documents
- checked all local Markdown links outside the historical archive; none are broken

## Code and configuration repairs

- restored three missing prompt-builder modules using the boundaries already present in their callers
- removed dead staged-ERP endpoints whose implementation and schema were absent
- made staged ERP requests fail clearly with `501`; direct sync now requires `staged: false`
- restored two missing frontend shared files from the existing `claude/review-sabit-status-61YTN` branch
- updated stale OAuth tests for the current salted encryption format and HMAC-signed state
- made the root Jest command work on Windows as well as Unix
- regenerated the inconsistent root lockfile
- moved the Node baseline and container images to Node 22
- stopped CI from hiding integration-test failures
- excluded runtime evidence from Git and container build contexts

## Validation

Passed:

- `npm ci --ignore-scripts`
- `npx tsc --noEmit`
- `npm run build`
- `npm test -- --runInBand` — 44 tests passed
- `cd frontend && npm ci --ignore-scripts`
- `cd frontend && npm run build`
- current-document local link check
- high-confidence current-tree secret scan

Warnings and limits:

- database-backed tests were not run because this checkout was not connected to a disposable PostgreSQL database
- the root dependency audit reports two moderate findings
- the frontend dependency audit reports five findings, including one critical; Next.js 14 is end of life
- Jest warns about `ts-jest` module configuration and JSON import attributes
- the frontend build warns about webpack cache snapshots and stale browser data

## Human review

- Rotate the Anthropic key that appeared in Git history, if it has not already been revoked. The current tree no longer contains the full value. History was not rewritten.
- Decide whether staged ERP sync should be rebuilt with a reviewed database design or removed from the roadmap.
- Choose a supported Next.js target and test the migration as its own change.
- Choose a license if other people should be allowed to reuse this code.
- Inspect the broken `.claude/worktrees/zealous-elbakyan` gitlink separately. It was left alone because its ownership and purpose are unclear.
