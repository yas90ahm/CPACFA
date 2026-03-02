-- Migration 132: Auto-update reconciling_items_total when recon items change
-- Ensures the GENERATED ALWAYS column (unexplained_variance) always uses fresh data.
-- Previously reconciling_items_total was maintained by application code only.

CREATE OR REPLACE FUNCTION recalc_recon_items_total()
RETURNS TRIGGER AS $$
DECLARE
  v_recon_id TEXT;
  v_new_total NUMERIC(20,2);
BEGIN
  -- Determine which recon_id was affected
  IF TG_OP = 'DELETE' THEN
    v_recon_id := OLD.recon_id;
  ELSE
    v_recon_id := NEW.recon_id;
  END IF;

  -- Sum all items for this reconciliation
  SELECT COALESCE(SUM(amount), 0)
    INTO v_new_total
    FROM tenant_recon_items
   WHERE recon_id = v_recon_id;

  -- Update the parent reconciliation
  UPDATE tenant_period_reconciliations
     SET reconciling_items_total = v_new_total,
         updated_at = NOW()
   WHERE recon_id = v_recon_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS recon_items_total_on_insert ON tenant_recon_items;
DROP TRIGGER IF EXISTS recon_items_total_on_update ON tenant_recon_items;
DROP TRIGGER IF EXISTS recon_items_total_on_delete ON tenant_recon_items;

CREATE TRIGGER recon_items_total_on_insert
  AFTER INSERT ON tenant_recon_items
  FOR EACH ROW
  EXECUTE FUNCTION recalc_recon_items_total();

CREATE TRIGGER recon_items_total_on_update
  AFTER UPDATE OF amount ON tenant_recon_items
  FOR EACH ROW
  EXECUTE FUNCTION recalc_recon_items_total();

CREATE TRIGGER recon_items_total_on_delete
  AFTER DELETE ON tenant_recon_items
  FOR EACH ROW
  EXECUTE FUNCTION recalc_recon_items_total();
