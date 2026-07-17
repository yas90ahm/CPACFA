# Current status

Checked on 2026-07-17 from the `repo-cleanup` branch.

## What passes

- clean root dependency install from the regenerated lockfile
- TypeScript check: `npx tsc --noEmit`
- backend build: `npm run build`
- root Jest suite: 44 tests passed
- frontend production build: `cd frontend && npm run build`
- current-document local link check
- high-confidence current-tree secret scan

The Jest run still warns about `ts-jest` module settings and JSON imports. The frontend build warns about its webpack cache and stale browser data.

## What changed to make that true

Three prompt builders referenced by live services were missing. They were restored with the same boundaries already used by the callers: no invented amounts, supplied citations only and deterministic numbers outside the model.

The staged ERP sync was different. Its service modules, repositories and migrations were all absent. Building a new accounting write path during a repository cleanup would be reckless. The incomplete routes were removed, and staged requests now return `501`. Direct sync remains available only when the caller sends `staged: false`.

Two frontend shared files already existed on the `claude/review-sabit-status-61YTN` branch but had not reached the default branch. They were restored here, which allows the frontend to build.

## Still open

- run the database-backed suites against a disposable PostgreSQL database
- move the frontend from end-of-life Next.js 14 to a supported release
- resolve the remaining dependency audit findings; the clean root install reports two moderate findings, while the frontend reports five findings including one critical
- decide whether staged ERP sync should be rebuilt with a reviewed schema or removed from the product plan
- align Jest, `ts-jest` and TypeScript versions
- choose a license if this repository is meant for reuse
- rotate the Anthropic credential that appeared in Git history, if that has not already been done

The historical reviews in `docs/archive/audits/` are evidence of work at particular points in time. They are not a substitute for these checks.
