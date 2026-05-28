-- Prevent duplicate transfer rows per inventory item within tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_transferred_items_tenant_inventory
ON transferred_items (tenant_id, inventory_item_id)
WHERE inventory_item_id IS NOT NULL;

-- Ensure recycle table does not hold duplicate active metadata rows per case
CREATE UNIQUE INDEX IF NOT EXISTS uq_cases_recycle_case_id
ON cases_recycle_bin (case_id);
