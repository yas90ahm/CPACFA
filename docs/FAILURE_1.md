# Failure 1

## Point of Failure

**Strategy / Pipeline Choice**

## Technical Reason

The message "Full Audit & Statement Build" together with `raw_rows` is inferred as **month_end_close**. The **deterministic pipeline** runs (`runResultPipeline` → `buildValidatedStatements`). It throws `MathematicalIntegrityError` before the **agent** (Supervisor) ever runs. No reasoning steps are written; no self-correction loop runs.

## HUD Disconnect

The agent never runs, so there is no reasoning stream to show. The HUD displays Yellow (self-healing) then Red (kill switch) with zero thoughts because the Supervisor ReAct loop was never entered.

## Recommended Fix

Prefer the **forensic (agentic)** path for this flow so the Supervisor runs, gets the tool failure, and can self-correct. Options:

- Treat "Full Audit & Statement Build" (or similar phrasing) as forensic in strategy inference, or
- Add a query/body flag to force the agentic path when running diagnostics.
