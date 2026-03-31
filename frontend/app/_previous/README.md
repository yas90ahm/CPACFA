# _previous — Quarantined Pages (Pre-Figma Redesign)

Old page components moved here on 2026-03-30 during the V1 Figma redesign.

These pages were wired to the backend via:
- lib/_previous/queries/ (React Query hooks)
- lib/_previous/types/ (TypeScript interfaces)
- components/_previous/ (shared UI components)

When rewiring the new Figma-based pages, reference these for:
- Which API endpoints each page consumed
- Business logic (state machines, validation, approval flows)
- Data transformation patterns

Do not import from this directory in new code.
