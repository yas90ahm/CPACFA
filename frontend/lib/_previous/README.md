# _previous — Quarantined API Wiring (Pre-Figma Redesign)

This directory contains the old API wiring layer (queries, types, auth, adapters)
from the pre-Figma frontend. Moved here on 2026-03-30 during the V1 redesign.

Everything here was functional and connected to the backend. When rewiring the
new Figma-based pages, reference these files for:
- Correct API endpoint paths
- Request/response type shapes
- React Query key conventions
- Auth token handling patterns

Do not import from this directory in new code. Copy what you need and adapt.
