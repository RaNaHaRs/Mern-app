-- Migration 054: Update case_financials view to include inventory client charges in revenue
-- NOTE: inventory costs are already written to case_expenses (expense_type='inventory')
-- by the POST /cases/:id/inventory endpoint, so we do NOT double-add them here.
-- We only add client_charge_amount to revenue (what we billed the client above our cost).

CREATE OR REPLACE VIEW case_financials AS
SELECT
  c.id,
  c.case_number,

  -- Revenue: paid payments + client charges billed via inventory items
  COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)
    + COALESCE(inv.total_client_charged, 0) AS revenue,

  -- Expense breakdown from case_expenses (inventory cost is already recorded there)
  COALESCE(SUM(CASE WHEN ce.expense_type = 'inventory'       THEN ce.amount ELSE 0 END), 0) AS inventory_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'direct_purchase' THEN ce.amount ELSE 0 END), 0) AS direct_purchase_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'shipping'        THEN ce.amount ELSE 0 END), 0) AS shipping_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'vendor'          THEN ce.amount ELSE 0 END), 0) AS vendor_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'lab'             THEN ce.amount ELSE 0 END), 0) AS lab_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'misc'            THEN ce.amount ELSE 0 END), 0) AS misc_expense,

  -- Total expenses: only case_expenses (inventory cost is already in there)
  COALESCE(SUM(ce.amount), 0) AS total_expenses,

  -- Gross profit
  (
    COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)
      + COALESCE(inv.total_client_charged, 0)
  ) - COALESCE(SUM(ce.amount), 0) AS gross_profit,

  -- Detail columns for UI breakdown
  COALESCE(inv.total_client_charged, 0) AS inventory_client_revenue,
  COALESCE(inv.total_our_cost, 0)       AS inventory_our_cost

FROM cases c
LEFT JOIN payments p ON c.id = p.case_id
LEFT JOIN case_expenses ce ON c.id = ce.case_id

-- Aggregate inventory charges per case (only CONSUMED, not returned)
LEFT JOIN (
  SELECT
    case_id,
    SUM(
      CASE WHEN usage_type = 'CONSUMED'
        THEN GREATEST(0, qty_allocated * COALESCE(unit_cost, 0) - COALESCE(discount_amount, 0))
        ELSE 0
      END
    ) AS total_our_cost,
    SUM(
      CASE WHEN charge_to_client = TRUE
        THEN COALESCE(client_charge_amount, 0)
        ELSE 0
      END
    ) AS total_client_charged
  FROM case_inventory_items
  WHERE status != 'returned'
  GROUP BY case_id
) inv ON inv.case_id = c.id

GROUP BY c.id, c.case_number, inv.total_client_charged, inv.total_our_cost;
