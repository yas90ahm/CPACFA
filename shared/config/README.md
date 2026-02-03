# Shared config

Single source of truth for financial validation rules used by both Node (Agent) and Python (Math engine).

- **financial_rules.json** — `roundingTolerance` (Debits = Credits, Assets = L + E), `materiality.defaultThreshold`. Edits take effect on the next request (no restart). Override path via `RULES_CONFIG_PATH` (Node or Python).
