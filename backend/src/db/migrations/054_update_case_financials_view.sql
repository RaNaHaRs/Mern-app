-- Migration 054: Update case_financials view to include inventory client charges in revenue
-- NOTE: inventory costs are already written to case_expenses (expense_type='inventory')
-- by the POST /cases/:id/inventory endpoint, so we do NOT double-add them here.
-- We only add client_charge_amount to revenue (what we billed the client above our cost).
-- All aggregates use subqueries to avoid row multiplication from multiple JOINs.

CREATE OR REPLACE VIEW case_financials AS
SELECT
  c.id,
  c.case_number,

  -- Revenue: paid payments + client charges billed via inventory items
  COALESCE(pay.total_paid, 0) + COALESCE(inv.total_client_charged, 0) AS revenue,

  -- Expense breakdown from case_expenses (inventory cost is already recorded there)
  COALESCE(exp.inventory_expense,       0) AS inventory_expense,
  COALESCE(exp.direct_purchase_expense, 0) AS direct_purchase_expense,
  COALESCE(exp.shipping_expense,        0) AS shipping_expense,
  COALESCE(exp.vendor_expense,          0) AS vendor_expense,
  COALESCE(exp.lab_expense,             0) AS lab_expense,
  COALESCE(exp.misc_expense,            0) AS misc_expense,

  -- Total expenses: only case_expenses (inventory cost is already in there)
  COALESCE(exp.total_expenses, 0) AS total_expenses,

  -- Gross profit
  (COALESCE(pay.total_paid, 0) + COALESCE(inv.total_client_charged, 0))
    - COALESCE(exp.total_expenses, 0) AS gross_profit,

  -- Detail columns for UI breakdown
  COALESCE(inv.total_client_charged, 0) AS inventory_client_revenue,
  COALESCE(inv.total_our_cost,       0) AS inventory_our_cost

FROM cases c

-- Aggregate paid payments per case
LEFT JOIN (
  SELECT case_id,
    SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS total_paid
  FROM payments
  GROUP BY case_id
) pay ON pay.case_id = c.id

-- Aggregate expenses per case (each subtype + total)
LEFT JOIN (
  SELECT case_id,
    SUM(CASE WHEN expense_type = 'inventory'       THEN amount ELSE 0 END) AS inventory_expense,
    SUM(CASE WHEN expense_type = 'direct_purchase' THEN amount ELSE 0 END) AS direct_purchase_expense,
    SUM(CASE WHEN expense_type = 'shipping'        THEN amount ELSE 0 END) AS shipping_expense,
    SUM(CASE WHEN expense_type = 'vendor'          THEN amount ELSE 0 END) AS vendor_expense,
    SUM(CASE WHEN expense_type = 'lab'             THEN amount ELSE 0 END) AS lab_expense,
    SUM(CASE WHEN expense_type = 'misc'            THEN amount ELSE 0 END) AS misc_expense,
    SUM(amount) AS total_expenses
  FROM case_expenses
  GROUP BY case_id
) exp ON exp.case_id = c.id

-- Aggregate inventory charges per case (only non-returned items)
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
) inv ON inv.case_id = c.id;
