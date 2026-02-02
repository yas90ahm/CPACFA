-- Revenue recognition: schedule pattern (linear, cost_to_cost, milestones, custom) per POB.

ALTER TABLE revenue_performance_obligations ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'linear';
ALTER TABLE revenue_performance_obligations ADD COLUMN IF NOT EXISTS cost_to_cost_total_estimated NUMERIC(15,2);
ALTER TABLE revenue_performance_obligations ADD COLUMN IF NOT EXISTS cost_to_cost_costs_to_date NUMERIC(15,2);
ALTER TABLE revenue_performance_obligations ADD COLUMN IF NOT EXISTS milestone_amounts JSONB;
