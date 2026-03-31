# _previous — Quarantined Components (Pre-Figma Redesign)

This directory contains the old component library from the pre-Figma frontend.
Moved here on 2026-03-30 during the V1 redesign.

These components were wired to the backend via the query layer in lib/_previous/.
When building new Figma-based components, reference these for:
- Data flow patterns
- Which API endpoints each component consumed
- Business logic (approval flows, validation, state machines)

Do not import from this directory in new code.
