-- Fix prepaid amortization rounding remainder (blind audit finding #4)
-- monthly_amount = ROUND(total/months, 2) leaves a remainder for non-divisible amounts
-- last_month_amount absorbs the remainder so all months sum to total_amount exactly
--
-- Example: $10,000 / 3 months
--   monthly_amount = $3,333.33 (months 1-2)
--   last_month_amount = 10000 - (3333.33 * 2) = $3,333.34 (month 3)
--   Total: 3333.33 + 3333.33 + 3333.34 = $10,000.00 ✓

ALTER TABLE tenant_prepaid_schedules
  ADD COLUMN IF NOT EXISTS last_month_amount NUMERIC(20,2) GENERATED ALWAYS AS (
    total_amount - (ROUND(total_amount / months_count, 2) * (months_count - 1))
  ) STORED;
