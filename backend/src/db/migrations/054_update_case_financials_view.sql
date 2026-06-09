-- Migration 054: Update case_financials view to include inventory costs and client charges
-- Revenue now includes: paid payments + client charges from inventory items
-- Expenses now includes: case_expenses + actual inventory cost (qty * unit_cost - discount) for consumed items

CREATE OR REPLACE VIEW case_financials AS
SELECT
  c.id,
  c.case_number,

  -- Revenue: paid payments + client charges billed via inventory
  COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)
    + COALESCE(inv_charges.total_client_charged, 0) AS revenue,

  -- Expense breakdown from case_expenses table
  COALESCE(SUM(CASE WHEN ce.expense_type = 'inventory'       THEN ce.amount ELSE 0 END), 0) AS inventory_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'direct_purchase' THEN ce.amount ELSE 0 END), 0) AS direct_purchase_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'shipping'        THEN ce.amount ELSE 0 END), 0) AS shipping_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'vendor'          THEN ce.amount ELSE 0 END), 0) AS vendor_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'lab'             THEN ce.amount ELSE 0 END), 0) AS lab_expense,
  COALESCE(SUM(CASE WHEN ce.expense_type = 'misc'            THEN ce.amount ELSE 0 END), 0) AS misc_expense,

  -- Total expenses: case_expenses + actual inventory cost (our cost, not client charge)
  COALESCE(SUM(ce.amount), 0)
    + COALESCE(inv_charges.total_our_cost, 0) AS total_expenses,

  -- Gross profit = revenue - total expenses
  (
    COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)
      + COALESCE(inv_charges.total_client_charged, 0)
  ) - (
    COALESCE(SUM(ce.amount), 0)
      + COALESCE(inv_charges.total_our_cost, 0)
  ) AS gross_profit,

  -- Extra detail columns for the UI
  COALESCE(inv_charges.total_client_charged, 0) AS inventory_client_revenue,
  COALESCE(inv_charges.total_our_cost, 0)       AS inventory_our_cost

FROM cases c
LEFT JOIN payments p ON c.id = p.case_id
LEFT JOIN case_expenses ce ON c.id = ce.case_id

-- Aggregate inventory items per case
LEFT JOIN (
  SELECT
    case_id,
    -- Our actual cost: (qty * unit_cost) - discount, only for CONSUMED items
    SUM(
      CASE
        WHEN usage_type = 'CONSUMED'
        THEN GREATEST(0, (qty_allocated * COALESCE(unit_cost, 0)) - COALESCE(discount_amount, 0))
        ELSE 0
      END
    ) AS total_our_cost,
    -- What we billed the client via inventory charge
    SUM(
      CASE
        WHEN charge_to_client = TRUE
        THEN COALESCE(client_charge_amount, 0)
        ELSE 0
      END
    ) AS total_client_charged
  FROM case_inventory_items
  WHERE status != 'returned'
  GROUP BY case_id
) inv_charges ON inv_charges.case_id = c.id

GROUP BY c.id, c.case_number, inv_charges.total_client_charged, inv_charges.total_our_cost;
