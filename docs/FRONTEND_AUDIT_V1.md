# Front End Audit v1

**Date:** February 2026  
**Scope:** Entire frontend codebase — every instance of mock data vs real API usage.  
**Method:** Read-only search (no code changes).

---

## 1. Query hooks (`frontend/lib/queries/`)

All hooks use **apiFetch** to real endpoints. **No query hook returns mock data.**

| # | File | Hook | Type | Status | Mock Source | Should Call |
|---|------|------|------|--------|-------------|-------------|
| 1 | lib/queries/close-session.ts | useCloseSession | query | REAL | — | GET /api/close/sessions/:id |
| 2 | lib/queries/close-session.ts | useCloseReadiness | query | REAL | — | GET /api/close/sessions/:id/readiness |
| 3 | lib/queries/close-session.ts | useCloseIssues | query | REAL | — | GET /api/close/sessions/:id/issues |
| 4 | lib/queries/close-session.ts | useAdvanceSession | mutation | REAL | — | POST /api/close/sessions/:id/advance |
| 5 | lib/queries/close-session.ts | useCreateSession | mutation | REAL | — | POST /api/close/sessions |
| 6 | lib/queries/entities.ts | useEntities | query | REAL | — | GET /api/settings/entities |
| 7 | lib/queries/variance.ts | useVariances | query | REAL | — | GET /api/close/sessions/:id/variances |
| 8 | lib/queries/audit-trail.ts | useAuditTrail | query | REAL | — | GET /api/close/sessions/:id/audit-events |
| 9 | lib/queries/sessions.ts | useSessions | query | REAL | — | GET /api/close/sessions |
| 10 | lib/queries/certification.ts | useCertification | query | REAL | — | GET /api/verification/certification/artifacts/:id |
| 11 | lib/queries/adjustments.ts | useAjeTemplates | query | REAL | — | GET /api/close/sessions/:id/template-status (or applications) |
| 12 | lib/queries/adjustments.ts | useJournalEntries | query | REAL | — | GET /api/close/journal-entries?closeSessionId= |
| 13 | lib/queries/adjustments.ts | useJournalEntry | query | REAL | — | GET /api/close/journal-entries/:jeId |
| 14 | lib/queries/statements.ts | useStatements | query | REAL | — | GET /api/close/sessions/:id/statement-packages + lines |
| 15 | lib/queries/statements.ts | useValidation | query | REAL | — | GET /api/close/sessions/:id/statement-packages (validationResults); catch returns empty checks |
| 16 | lib/queries/trial-balance.ts | useTrialBalance | query | REAL | — | GET /api/close/sessions/:id/trial-balance |
| 17 | lib/queries/reconciliations.ts | useReconciliations | query | REAL | — | GET /api/close/sessions/:id/reconciliations |
| 18 | lib/queries/reconciliations.ts | useReconciliation | query | REAL | — | GET /api/close/sessions/:id/reconciliations/:reconId; catch returns null |
| 19 | lib/queries/portfolio.ts | usePortfolioEntities | query | REAL | — | GET /api/portfolio/entities |
| 20 | lib/queries/portfolio.ts | usePortfolioSummary | query | REAL | — | GET /api/portfolio/summary |
| 21 | lib/queries/portfolio.ts | usePortfolioHistory | query | REAL | — | GET /api/portfolio/entities/:entityId/history |

---

## 2. Components / pages using mock or hardcoded data

| # | File | Hook/Component | Type | Status | Mock Source | Should Call / Replace With |
|---|------|----------------|------|--------|-------------|----------------------------|
| 22 | app/close/[sessionId]/dashboard/GLUploadFlow.tsx | GLUploadFlow | component | MOCK | parseGLFile, validateGL, getTBPreviewForIngest from @/lib/mock/gl-upload, tb-preview | POST /api/gl/ingest (or equivalent); validation + TB preview from API or real parsing |
| 23 | app/close/[sessionId]/dashboard/TBUploadFlow.tsx | TBUploadFlow | component | MOCK | parseTBFile, validateGL, getTBPreviewForIngest from @/lib/mock/gl-upload, tb-preview | Same as above for TB upload path |
| 24 | app/close/[sessionId]/dashboard/OpenStateDashboard.tsx | OpenStateDashboard | component | MOCK | MOCK_ERP_CONNECTED = false (flag) | Real integration status from API/settings |
| 25 | app/close/[sessionId]/mapping/page.tsx | Mapping page | component | MOCK | mockTaxonomy, mockTaxonomyFlat, mockAISuggestions from @/lib/mock/taxonomy, ai-suggestions | GET taxonomy/COA API; GET mapping suggestions API |
| 26 | app/close/[sessionId]/review/page.tsx | Review page | component | MOCK | MOCK_USER_ROLE, MOCK_USER_NAME ('Mike Torres'); participants: ['Sarah Chen', 'Mike Torres', 'David Kim']; mock financial highlights, activity summary, evidence manifest | Auth context for role/name; GET session participants; GET highlights/activity/evidence APIs |
| 27 | app/close/[sessionId]/adjustments/page.tsx | Adjustments page | component | MOCK | createdBy: 'Sarah Chen', proposedBy/approvedBy/rejectedBy/postedBy hardcoded ('Sarah Chen', 'Mike Torres'); local state only for approve/reject/post | Auth context for current user; PATCH/POST journal-entries for propose/approve/reject/post |
| 28 | app/close/[sessionId]/adjustments/JournalEntryForm.tsx | JournalEntryForm | component | MOCK | mockJEEvidenceByJe from @/lib/mock/je-evidence; uploadedBy: 'Sarah Chen' | GET evidence for JE; auth for uploadedBy |
| 29 | app/close/[sessionId]/adjustments/AdjustmentsEntriesTab.tsx | AdjustmentsEntriesTab | component | MOCK | mockJEEvidenceByJe from @/lib/mock/je-evidence | GET evidence by JE (or session) |
| 30 | app/close/[sessionId]/reconciliation/[reconId]/page.tsx | Recon detail page | component | MOCK | mockReconItemsByRecon, mockEvidenceByRecon, mockActivityByRecon; isPreparer = recon?.preparer === 'Sarah Chen'; periodEnd = '2026-01-31'; uploadedBy: 'Sarah Chen' | GET recon items, evidence, activity APIs; auth for current user; session period for periodEnd |
| 31 | app/close/[sessionId]/dashboard/page.tsx | Session info block | component | MOCK | "Feb 1, 2026", "4", "6 days" (Started, Days in close, Prior period close) | session.startedAt/createdAt; compute days from dates; prior-period API or config |
| 32 | app/settings/reconciliation/page.tsx | Reconciliation settings | component | MOCK | mockReconRequirements (useState initial) from @/lib/mock/recon-requirements | GET/PUT recon requirements API |
| 33 | app/settings/taxonomy/page.tsx | Taxonomy settings | component | MOCK | mockTaxonomyFull from @/lib/mock/taxonomy-full | GET/PUT taxonomy/COA API |
| 34 | app/settings/templates/page.tsx | Templates settings | component | MOCK | mockTemplateDefinitions from @/lib/mock/template-definitions | GET/PUT template definitions API |
| 35 | app/settings/evidence-policy/page.tsx | Evidence policy | component | MOCK | mockEvidencePolicy from @/lib/mock/evidence-policy | GET/PUT evidence policy API |
| 36 | app/settings/integrations/page.tsx | Integrations | component | MOCK | mockIntegrations from @/lib/mock/integrations | GET/PUT integrations API |
| 37 | app/settings/team/page.tsx | Team | component | MOCK | mockTeam from @/lib/mock/team | GET/PUT team members API |
| 38 | app/settings/general/page.tsx | General settings | component | MOCK | mockGeneralSettings from @/lib/mock/general-settings | GET/PUT general settings API |

---

## 3. Mock data files (`frontend/lib/mock/`)

| # | File | Provides | Still imported? | Can delete? |
|---|------|----------|-----------------|-------------|
| 39 | gl-upload.ts | parseGLFile, validateGL, TB parse helpers, MOCK_COLUMNS/ROWS | Yes (GLUploadFlow, TBUploadFlow) | No |
| 40 | tb-preview.ts | getTBPreviewForIngest | Yes (GLUploadFlow, TBUploadFlow) | No |
| 41 | taxonomy.ts | mockTaxonomy, mockTaxonomyFlat, TaxonomyNode type | Yes (mapping, taxonomy-full, settings/taxonomy) | No |
| 42 | taxonomy-full.ts | mockTaxonomyFull | Yes (settings/taxonomy) | No |
| 43 | ai-suggestions.ts | mockAISuggestions, types | Yes (mapping) | No |
| 44 | recon-requirements.ts | mockReconRequirements | Yes (settings/reconciliation) | No |
| 45 | template-definitions.ts | mockTemplateDefinitions | Yes (settings/templates) | No |
| 46 | evidence-policy.ts | mockEvidencePolicy | Yes (settings/evidence-policy) | No |
| 47 | integrations.ts | mockIntegrations | Yes (settings/integrations) | No |
| 48 | team.ts | mockTeam, types | Yes (settings/team) | No |
| 49 | general-settings.ts | mockGeneralSettings | Yes (settings/general) | No |
| 50 | je-evidence.ts | mockJEEvidenceByJe | Yes (JournalEntryForm, AdjustmentsEntriesTab) | No |
| 51 | recon-items.ts | mockReconItemsByRecon | Yes (reconciliation/[reconId]) | No |
| 52 | evidence-files.ts | mockEvidenceByRecon | Yes (reconciliation/[reconId]) | No |
| 53 | recon-activity.ts | mockActivityByRecon | Yes (reconciliation/[reconId]) | No |
| 54 | close-session.ts | mockSession, getCloseSessionById, mockReadiness, mockIssues, mockPhaseProgress, mockNextActions, mockRecentActivity | No (only imports mockSessions) | Yes |
| 55 | sessions.ts | mockSessions | Yes (only by close-session.ts) | Yes (if close-session.ts removed) |
| 56 | portfolio.ts | — | No | Yes |
| 57 | portfolio-summary.ts | — | No | Yes |
| 58 | certification.ts | — | No | Yes |
| 59 | audit-trail.ts | — | No | Yes |
| 60 | variances.ts | — | No | Yes |
| 61 | validation.ts | — | No | Yes |
| 62 | statements.ts | — | No | Yes |
| 63 | journal-entries.ts | — | No | Yes |
| 64 | aje-templates.ts | — | No | Yes |
| 65 | trial-balance.ts | — | No | Yes |
| 66 | reconciliations.ts | — | No | Yes |

---

## 4. Fallback patterns (API then mock on error)

- **useValidation (statements.ts):** `catch { return { sessionId, allPassing: false, checks: [] }; }` — error fallback, not mock data.
- **useReconciliation (reconciliations.ts):** `catch { return null; }` — error fallback, not mock data.
- **useCertification:** `try { ... } catch { return null; }` — error fallback, not mock data.

**No instances of "try API then return mock data" were found.**

---

## 5. Mutations not calling API

- **Adjustments page (propose/approve/reject/post):** All implemented with local state only (`setLocalDraftJEs`, `setLocalEntryPatches`). No `apiFetch` or `useMutation` for JE state changes. **Status: MOCK** — should call PATCH/POST on journal-entries (e.g. propose, approve, reject, post).

---

## 6. Summary counts

| Metric | Count |
|--------|--------|
| Total hooks audited (queries + mutations) | 21 |
| Hooks fully wired (REAL) | 21 |
| Hooks still mock (MOCK) | 0 |
| Components/pages using mock or hardcoded data | 17 |
| Using fallback pattern (API then mock on error) | 0 |
| Mock files still imported | 15 |
| Mock files not imported (can delete) | 12 |

---

## 7. Deletable mock files (not imported by app/components)

- close-session.ts
- sessions.ts
- portfolio.ts
- portfolio-summary.ts
- certification.ts
- audit-trail.ts
- variances.ts
- validation.ts
- statements.ts
- journal-entries.ts
- aje-templates.ts
- trial-balance.ts
- reconciliations.ts

*(close-session.ts only imports mockSessions; no app code imports close-session or sessions.)*

---

## 8. Highest-impact wiring targets

1. **GL/TB ingest** — Replace mock parsing/preview with real ingest API and TB/validation endpoints.
2. **Adjustments** — Wire propose/approve/reject/post to journal-entry APIs; replace mock evidence with API.
3. **Reconciliation detail** — Replace mock items/evidence/activity and hardcoded user/period with APIs and auth/session.
4. **Review page** — Replace mock role, name, participants, highlights, activity, evidence with auth and APIs.
5. **Settings (all)** — Replace each settings page's mock with GET/PUT for that domain (recon, taxonomy, templates, evidence policy, integrations, team, general).
6. **Mapping** — Replace mock taxonomy and AI suggestions with taxonomy and mapping-suggestions APIs.
7. **Dashboard session info** — Replace "Feb 1, 2026", "4", "6 days" with session dates and computed/API metrics.
