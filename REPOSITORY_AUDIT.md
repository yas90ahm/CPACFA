# Repository audit

Audit date: 17 July 2026  
Repository: `yas90ahm/CPACFA`  
Audited branch: `repo-cleanup`  
Default branch: `master`  
Audit scope: documentation and recommendations only. No files were deleted, moved, redacted or rewritten.

## 1. Repository summary

CPACFA contains Sabit, a broad financial-close prototype. It combines a TypeScript/Express/PostgreSQL backend, a Next.js frontend, deterministic accounting and certification logic, AI-assisted reading and explanation, evidence storage, ERP/MCP connectors and a Python classification service.

This is the repository that needs the most careful work. It has 4,542 tracked files, several application stacks, 204 database migrations, thousands of tracked evidence files and dozens of conflicting audit/status reports at the root. Its latest default-branch workflow failed during TypeScript checking. More urgently, a suspected live provider credential was found in a tracked review document. Exact incident details are deliberately omitted from this public audit; they were communicated privately to the owner.

## 2. Current structure

| Path | Purpose | Assessment |
| --- | --- | --- |
| `src/` | Express API, workers, database, accounting, AI, security and services | Main backend; retain |
| `frontend/` | Next.js 14 application | Main web interface; retain and upgrade |
| `slm/` | Python/FastAPI classification service | Separate service; relationship must be documented |
| `mcp_server/`, `connectors/` | MCP and ERP integration services | Retain if supported; packaging is incomplete |
| `migrations/` | 204 SQL migration files | Core database history; retain |
| `shared/` | Shared types or utilities | Retain |
| `tests/`, `Test/`, `test_data/`, `uat/`, `samples/`, `demo/` | Several test and fixture conventions | Fragmented; consolidate only after test ownership is clear |
| `data/evidence/`, `data/evidence-test/` | Thousands of runtime-style evidence files | Should not remain tracked as application state |
| `data/`, `GAAP Taxonomy/` | Taxonomy source and parsed data | Contains an exact duplicate 11.3 MB workbook |
| `docs/`, `specs/`, `analysis/`, `Rearchitecture/`, root reports | Design, audit, review and completion records | Excessive overlap and contradiction |
| `.github/`, Docker/Cloud Build files | CI, release, container and cloud delivery | Active but not a trustworthy release gate yet |

There are 88 Markdown files at the repository root; 78 root files have audit, report, review or state-style names. `data/evidence/` alone contains 3,140 tracked files.

## 3. Identified projects

The repository contains at least five deployable or independently runnable parts:

1. The Node/Express backend and worker.
2. The Next.js web application.
3. The Python SLM/classification service.
4. Python MCP and webhook servers.
5. ERP connector services and local/demo infrastructure.

Supporting domains include database migrations, deterministic financial logic, evidence storage, AI adapters, security controls, a large test program, GAAP taxonomy assets and Docker/Cloud Run deployment files.

## 4. Build and test status

| Check | Status | Evidence |
| --- | --- | --- |
| Latest GitHub Actions run | Fail | Audit-branch run `29603971758`, 17 July 2026 |
| Failure stage | TypeScript type check | Dependency installation passed; build, tests and Docker jobs were skipped |
| Exact compiler errors | Eight errors | Seven imports point to missing modules; `src/routes/accounting_integration.ts:335` also has an implicit `any` parameter |
| Integration-test enforcement | Broken | CI runs `npm run test:integration || echo "Integration tests completed"`, so failures do not fail the job |
| Root test scope | Partial | Root Jest configuration matches adapter tests rather than the full suite |
| Frontend validation | Missing from root CI | Root workflow does not install and build the separate frontend package |
| Committed result files | Failing/stale | `test-results.json` records 14 failed tests; `test-results-new.json` records 3 failed tests |
| Local rerun | Not performed | Full installation would require multiple services and databases; first fix secret handling and define an authoritative validation command |

Jest versions also drift: the root uses Jest 30 with `ts-jest` 29, while the separate tests package uses Jest 29. Until ownership and versions are consolidated, a single “all tests pass” claim is not credible.

The missing imports reported by the current clean runner are:

- `src/ai/prompts/resolution_agent.prompt.js`
- `src/services/erp_sync_staging_service.js`
- `src/services/erp_sync_promote_service.js`
- `src/db/repositories/sync_staging_delta_repository.js`
- `src/db/repositories/sync_snapshot_repository.js`
- `src/ai/prompts/export_narrative.prompt.js`
- `src/ai/prompts/justification_irac.prompt.js`

These are source references, not missing packages. They must be restored, renamed or removed before the backend can typecheck.

## 5. Documentation problems

### The repository cannot agree on its current state

Root reports alternately call the application production-ready and not production-ready. “Complete,” “final,” “optional steps complete,” “state of the nation” and multiple audit generations all remain visible as current-looking files. These are build records, not a usable status system.

Recommended action: keep one dated `PROJECT_STATUS.md` tied to a commit and enforced checks. Move old reviews to `docs/archive/audits/` without rewriting their conclusions.

### The README describes an older system

The README says “Backend-only” despite the substantial Next.js frontend and Python services. It gives conflicting ports, uses `APP_MODE` where `MODE` is now canonical, describes signing keys in the wrong encoding and gives a lock/certification sequence that no longer matches the current close-session state machine.

`CLAUDE.md` also omits `SUBSEQUENT_EVENTS_REVIEW` and says the frontend uses mock data, while no current frontend mock imports were found. `TODO.md` references a nonexistent `backend/` directory, obsolete Flask/Node ports and a missing environment example that now exists.

### Python component setup is incomplete

`mcp_server/README.md` instructs `pip install -e .`, but the repository root has no Python package configuration. Either give each Python service a package manifest or direct readers to its requirements file.

### Delivery documentation is not safe to trust yet

`GITHUB_PUSH_STEPS.md` still contains a `YOUR_REPO_NAME` placeholder. Cloud Build describes unauthenticated services and does not visibly provide all required secrets/configuration in its fresh-deploy path. Treat it as an example until a deployment review verifies secret references and authentication.

### Voice and claim calibration

“Sovereign CPA Engine,” “enterprise-grade,” “production-ready,” “Truth Gate,” “brutally honest” and repeated “complete” reports make the project sound more certain than its own evidence. The repository is large and ambitious; the copy does not need to keep announcing that.

Use “financial-close application” or “financial-close prototype.” Say which workflows exist, which checks pass and which dependencies are required. Keep archived reviews candid, but make the current status calm and factual.

Proposed repository description, for review only:

> A month-end close prototype that keeps calculations deterministic and uses AI only for reading and explanation.

## 6. Organization problems

1. Five runnable systems and three JavaScript package/test configurations share one repository without a clear workspace contract.
2. Backend routes (108 files), services (174 files), database repositories and types are broad and difficult to navigate.
3. Tests are split across several top-level conventions and package manifests.
4. Runtime evidence is committed even though ignore rules say it should be local.
5. Two copies of the same 11.3 MB taxonomy workbook are tracked.
6. Generated PID, TypeScript build state and test-result files are committed.
7. More than seventy root review/status files compete to be authoritative.
8. Python services are not packaged consistently.
9. The public repository has no license file.

## 7. Security or secret concerns

### Immediate credential response

A suspected live third-party provider credential was found in a tracked review document. The exact path and value are omitted here to avoid amplifying a secret in a public repository.

Required owner action:

1. Revoke and rotate the credential immediately in the provider console.
2. Review provider usage and billing logs from 26 March 2026 onward.
3. Search deployed environments and local machines for reuse.
4. After rotation, remove the value from the current tree.
5. Decide separately how to address public history. This audit does not rewrite history or force-push.

### Other security concerns

- `data/evidence/` contains tenant-labelled generated evidence and is copied by the Docker build context. It should not be packaged into production images.
- `.claude/settings.local.json` exposes a contributor's local tool-permission configuration and should not be tracked.
- `.claude/worktrees/zealous-elbakyan` is a gitlink with no `.gitmodules` entry. Its provenance and intended contents are unclear.
- The CI integration step masks failure.
- `cloudbuild.yaml` describes unauthenticated Cloud Run services. Verify authentication, database access and secret references before another deployment.
- Node 18 and Node 20 are end-of-life as of this audit; Node's official guidance says production applications should use Active or Maintenance LTS.
- `frontend/package.json` uses Next.js 14.2.3. The official December 2025 Next.js advisory requires 14.x App Router applications to use 14.2.35 or newer in that release line.

## 8. Safe cleanup candidates

No deletion is performed. Each item still requires approval.

### Candidate: `.server.pid`

- **Contents:** A supposed server process identifier containing the literal shell token `$!`.
- **Why it is unnecessary:** It is local runtime state and does not identify a reusable process in another checkout.
- **Evidence:** Content is not a valid durable PID; no active source reference was found.
- **References:** None found.
- **Risk:** Very low.
- **Recommended action:** Delete after approval and add the path/pattern to `.gitignore`.

### Candidate: `frontend/tsconfig.tsbuildinfo`

- **Contents:** TypeScript incremental compiler state.
- **Why it is unnecessary:** TypeScript regenerates it for each environment.
- **Evidence:** It is a standard generated build artifact.
- **References:** TypeScript may read it locally; application source does not require a committed copy.
- **Risk:** Very low; the next frontend build recreates it.
- **Recommended action:** Delete after approval and ignore `*.tsbuildinfo`.

### Candidate: `test-results.json`

- **Contents:** Generated Jest JSON reporting seven failed suites and 14 failed tests from an older run.
- **Why it is unnecessary:** Test output belongs in CI artifacts, not source history.
- **Evidence:** `CODEBASE_AUDITV5.md` calls it legacy and provides a command that regenerates it.
- **References:** `CODEBASE_AUDITV5.md` references it as historical evidence.
- **Risk:** Low to medium; deleting it without updating/archive-labelling that audit removes the source behind its old count.
- **Recommended action:** First mark the audit as historical, then delete the result file after approval and publish future test JSON only as CI artifacts.

### Candidate: `test-results-new.json`

- **Contents:** Generated Jest JSON reporting two failed suites and three failed tests.
- **Why it is unnecessary:** It is a point-in-time test artifact that has already become stale.
- **Evidence:** `CODEBASE_AUDITV5.md` names it as a generated CI-equivalent run.
- **References:** `CODEBASE_AUDITV5.md` cites the file and its counts.
- **Risk:** Low to medium for the same historical-evidence reason.
- **Recommended action:** Archive the report context, then delete after approval and move future machine output to CI artifacts.

## 9. Uncertain cleanup candidates

No deletion, redaction or history rewrite is approved or performed.

### Candidate group: `data/evidence/`

- **Contents:** 3,140 tracked runtime-style evidence files organized by tenant/evidence identifiers.
- **Why it may be unnecessary:** `.gitignore` already treats runtime evidence as local state; 2,868 files share one identical content hash; the Docker context can copy them into images.
- **Evidence:** Hash grouping and tracked-file inventory; `src/services/evidence_storage_service.ts` identifies this as local disk storage.
- **References:** Application storage defaults and Docker paths use the directory. Tests should use deliberate fixtures instead.
- **Risk:** High. Some files may be relied on by demos, tests or audit records, and tenant-labelled data requires a privacy review.
- **Recommended action:** Inventory producers/consumers, identify any real or sensitive content, keep a minimal deterministic fixture set under `tests/fixtures/evidence/`, stop copying evidence into images, then remove approved runtime artifacts from the current tree. History handling requires a separate explicit security decision.

### Candidate group: `data/evidence-test/`

- **Contents:** 30 tracked test evidence files.
- **Why it may be unnecessary in this form:** Tests generate/use a local evidence path and should own small named fixtures explicitly.
- **Evidence:** `tests/integration/evidence_file_upload_download.test.ts` defaults to `./data/evidence-test`.
- **References:** Integration tests reference the directory.
- **Risk:** Medium to high.
- **Recommended action:** Determine which files are inputs versus generated outputs. Move only required static inputs to `tests/fixtures/evidence/`; delete generated outputs after approval.

### Candidate: `GAAP Taxonomy/2025_GAAP_Taxonomy.xlsx`

- **Contents:** 11,318,810-byte GAAP taxonomy workbook.
- **Why it may be unnecessary:** It is byte-identical to `data/2025_GAAP_Taxonomy.xlsx`.
- **Evidence:** Matching size and SHA-256 hash.
- **References:** The parser explicitly reads `data/2025_GAAP_Taxonomy.xlsx`; no code reference to the spaced-directory copy was found.
- **Risk:** Low to medium; documentation or a manual process may rely on the human-facing folder.
- **Recommended action:** Retain `data/2025_GAAP_Taxonomy.xlsx` as the current code path, confirm no external process uses the duplicate, then delete the duplicate after approval.

### Candidate: `.claude/settings.local.json`

- **Contents:** Personal local AI-tool permission settings.
- **Why it may be unnecessary:** Machine/user-local permissions do not belong in a shared repository.
- **Evidence:** The filename and contents are local settings, not project-wide policy.
- **References:** Claude tooling may read it locally; application code does not.
- **Risk:** Medium. A contributor workflow may currently rely on it.
- **Recommended action:** Review for project-wide rules, move only shared rules into a documented non-local config, then delete and ignore the local file.

### Candidate: `.claude/worktrees/zealous-elbakyan`

- **Contents:** A mode-160000 gitlink to another Git object.
- **Why it may be unnecessary:** There is no `.gitmodules` entry, so normal clones cannot resolve it as a defined submodule.
- **Evidence:** Git index mode and missing submodule configuration.
- **References:** No application reference found.
- **Risk:** High. Its original worktree/content may hold unmerged work.
- **Recommended action:** Identify the referenced commit and owner before removal. Either restore it as a real submodule with a documented purpose or remove the broken gitlink after preserving any needed work.

### Candidate group: root audit/review/completion reports

- **Exact scope:** The 78 root files with audit, report, review, completion or state-style names.
- **Contents:** Generated reviews, milestone reports, verdicts, remediation notes and conflicting production-readiness claims.
- **Why they may be unnecessary at root:** They obscure current documentation and contradict one another.
- **Evidence:** Multiple reports on the same topics reach different conclusions at different commits.
- **References:** Some reference test-result files and one another; they are useful historical records.
- **Risk:** High if deleted wholesale.
- **Recommended action:** Inventory by date and commit, remove any embedded secrets through the separate incident process, move the remaining records to `docs/archive/audits/`, and create one current status. Do not delete as a group.

## 10. Files that should be retained

- `src/`, `frontend/`, `shared/` and supported Python service source.
- All 204 database migrations.
- One canonical GAAP taxonomy workbook and the parsed taxonomy if it is an intentional runtime asset.
- Authoritative unit, integration and E2E tests plus a small deliberate fixture set.
- Package locks and container/deployment files after correction.
- Environment example files with placeholders only.
- Current product, architecture, security and operations documents after consolidation.
- Historical audits after secret remediation and clear archive labels.
- Small named demo datasets that are demonstrably synthetic and required.

## 11. Recommended target structure

```text
CPACFA/
├── apps/
│   ├── api/                 # current src
│   └── web/                 # current frontend
├── services/
│   ├── slm/
│   └── mcp/
├── packages/
│   └── shared/
├── db/
│   └── migrations/
├── assets/
│   └── taxonomy/            # one canonical workbook
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── operations/
│   ├── security/
│   └── archive/audits/
├── scripts/
├── .github/workflows/
├── README.md
└── LICENSE
```

This is a long-term map. Do not begin the directory move until the secret incident, CI and test ownership are resolved.

## 12. Proposed implementation stages

### Stage 0: credential incident — immediate, separately authorized

1. Rotate/revoke the suspected credential and review provider logs.
2. Remove the value from the current tree after approval.
3. Search all tracked files and deployment environments for related secrets.
4. Decide whether public-history remediation is required. This would conflict with the current no-history-rewrite instruction and therefore needs explicit owner approval and a safe coordinated plan.

### Stage 1: establish a trustworthy gate

1. Recover or reproduce the TypeScript errors from a clean environment.
2. Remove the CI fallback that masks integration failures.
3. Define one root command that validates backend, frontend, Python services and required databases at the appropriate levels.
4. Align Jest and `ts-jest` versions.
5. Make CI publish test results as artifacts, not tracked files.

### Stage 2: security and dependency baseline

1. Stop including `data/evidence/` in container images.
2. Upgrade Node to an active LTS and Next.js 14 to at least 14.2.35.
3. Validate Cloud Run authentication and secret references.
4. Add a license decision before inviting external use.

### Stage 3: low-risk generated-file cleanup

1. Delete `.server.pid`, `frontend/tsconfig.tsbuildinfo` and the two result JSONs after approval and documentation updates.
2. Ignore those artifact patterns.
3. Deduplicate the taxonomy workbook after confirming the canonical path.

### Stage 4: evidence and test-data cleanup

1. Classify every tracked evidence file as fixture, demo input, generated output or potentially sensitive data.
2. Keep only small named deterministic fixtures.
3. Remove approved generated/runtime evidence from the current tree.
4. Keep history remediation separate and explicitly authorized.

### Stage 5: documentation and voice

1. Correct ports, mode names, key formats, state transitions and package commands.
2. Replace conflicting reports with one dated status linked to CI.
3. Archive historical reviews.
4. Replace grandiose and verdict-style language with direct descriptions of the application and its limits.

### Stage 6: structural reorganization

1. Move applications, services, packages, database assets and tests only after validation is green.
2. Preserve import paths or provide planned migrations.
3. Verify Docker, Cloud Build, local development and CI after each move.

Human review is required before every deletion, redaction, history operation, directory move, dependency upgrade, deployment change or public metadata update.
