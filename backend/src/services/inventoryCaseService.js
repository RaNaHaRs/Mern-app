/**
 * Inventory-Case Integration Service
 * Handles all business logic for inventory usage in cases
 */

const { query, transaction } = require('../config/database');

class InventoryCaseService {
  /**
   * Allocate inventory item to case
   */
  static async allocateItemToCase(caseId, itemId, qty, usageType, unitCost, userId, notes) {
    return transaction(async client => {
      // Get item details
      const itemResult = await client.query(
        'SELECT id, sku, name, quantity, unit_cost as default_unit_cost FROM inventory_items WHERE id = $1',
        [itemId]
      );
      if (!itemResult.rows.length) throw new Error('Item not found');

      const item = itemResult.rows[0];
      const finalUnitCost = unitCost || item.default_unit_cost || 0;
      const totalCost = qty * finalUnitCost;

      // Create case_inventory_item
      const ciiResult = await client.query(
        `INSERT INTO case_inventory_items (
          case_id, inventory_item_id, usage_type, qty_allocated,
          unit_cost, status, created_by, notes
        ) VALUES ($1, $2, $3, $4, $5, 'allocated', $6, $7)
        RETURNING *`,
        [caseId, itemId, usageType, qty, finalUnitCost, userId, notes]
      );

      // Create usage log
      const qtyBefore = item.quantity;
      const qtyAfter = usageType === 'TEMPORARY_TOOL' ? qtyBefore : qtyBefore - qty;
      
      await client.query(
        `INSERT INTO inventory_usage_logs (
          inventory_item_id, case_id, log_type, quantity_change,
          quantity_before, quantity_after, unit_cost, cost_impact, user_id, notes
        ) VALUES ($1, $2, 'ALLOCATED', $3, $4, $5, $6, $7, $8, $9)`,
        [itemId, caseId, -qty, qtyBefore, qtyAfter, finalUnitCost, -totalCost, userId,
         `Allocated to case: ${notes || ''}`]
      );

      // Update inventory if not temporary tool
      if (usageType !== 'TEMPORARY_TOOL') {
        await client.query(
          'UPDATE inventory_items SET quantity = quantity - $1 WHERE id = $2',
          [qty, itemId]
        );
      }

      // Create case expense
      await client.query(
        `INSERT INTO case_expenses (
          case_id, expense_type, amount, description, reference_id, reference_type, recorded_by
        ) VALUES ($1, 'inventory', $2, $3, $4, 'case_inventory_item', $5)`,
        [caseId, totalCost,
         `${item.name} (${item.sku}) - ${qty} qty @ ${finalUnitCost}`,
         ciiResult.rows[0].id, userId]
      );

      return ciiResult.rows[0];
    });
  }

  /**
   * Record inventory usage (consume, return, damage)
   */
  static async recordUsage(caseInventoryItemId, action, qty, userId, notes) {
    return transaction(async client => {
      // Get case_inventory_item
      const ciiResult = await client.query(
        'SELECT * FROM case_inventory_items WHERE id = $1',
        [caseInventoryItemId]
      );
      if (!ciiResult.rows.length) throw new Error('Item not found in case');

      const cii = ciiResult.rows[0];
      const updateQty = qty || cii.qty_allocated;

      let updateData = { updated_by: userId };
      let logType = 'ADJUSTED';
      let quantityChange = 0;
      let newStatus = cii.status;

      if (action === 'consume') {
        updateData.qty_used = (cii.qty_used || 0) + updateQty;
        newStatus = 'consumed';
        logType = 'CONSUMED';
        quantityChange = -updateQty;
      } else if (action === 'return') {
        updateData.qty_returned = (cii.qty_returned || 0) + updateQty;
        updateData.returned_at = new Date().toISOString();
        logType = 'RETURNED';
        quantityChange = updateQty;
        newStatus = 'returned';
      } else if (action === 'damage') {
        updateData.qty_damaged = (cii.qty_damaged || 0) + updateQty;
        logType = 'ADJUSTED';
        quantityChange = 0;
        newStatus = 'damaged';
      }

      updateData.status = newStatus;

      // Update case_inventory_item
      const setClauses = [];
      const params = [];
      let pi = 1;
      for (const [key, value] of Object.entries(updateData)) {
        setClauses.push(`${key} = $${pi++}`);
        params.push(value);
      }
      params.push(caseInventoryItemId);

      const updated = await client.query(
        `UPDATE case_inventory_items SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE id = $${pi}
         RETURNING *`,
        params
      );

      // Create usage log
      if (quantityChange !== 0) {
        const itemData = await client.query(
          'SELECT quantity FROM inventory_items WHERE id = $1',
          [cii.inventory_item_id]
        );
        const qtyBefore = itemData.rows[0].quantity;
        const qtyAfter = qtyBefore + quantityChange;

        await client.query(
          `INSERT INTO inventory_usage_logs (
            inventory_item_id, case_id, log_type, quantity_change,
            quantity_before, quantity_after, unit_cost, cost_impact, user_id, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [cii.inventory_item_id, cii.case_id, logType, quantityChange,
           qtyBefore, qtyAfter, cii.unit_cost, quantityChange * cii.unit_cost,
           userId, notes]
        );

        // Update inventory
        await client.query(
          'UPDATE inventory_items SET quantity = quantity + $1 WHERE id = $2',
          [quantityChange, cii.inventory_item_id]
        );
      }

      return updated.rows[0];
    });
  }

  /**
   * Convert leftover CASE_PURCHASE items back to inventory
   */
  static async convertLeftoverToInventory(caseInventoryItemId, qty, userId, notes) {
    return transaction(async client => {
      // Get case_inventory_item
      const ciiResult = await client.query(
        'SELECT * FROM case_inventory_items WHERE id = $1',
        [caseInventoryItemId]
      );
      if (!ciiResult.rows.length) throw new Error('Case inventory item not found');

      const cii = ciiResult.rows[0];
      if (cii.usage_type !== 'CASE_PURCHASE') {
        throw new Error('Only CASE_PURCHASE items can have leftovers converted');
      }

      // Update inventory quantity
      await client.query(
        'UPDATE inventory_items SET quantity = quantity + $1 WHERE id = $2',
        [qty, cii.inventory_item_id]
      );

      // Update case_inventory_item
      await client.query(
        `UPDATE case_inventory_items
         SET leftover_qty = $1, is_leftover_converted = true, updated_at = NOW()
         WHERE id = $2`,
        [qty, caseInventoryItemId]
      );

      // Create usage log
      const itemData = await client.query(
        'SELECT quantity FROM inventory_items WHERE id = $1',
        [cii.inventory_item_id]
      );
      const qtyBefore = itemData.rows[0].quantity - qty;
      const qtyAfter = itemData.rows[0].quantity;

      await client.query(
        `INSERT INTO inventory_usage_logs (
          inventory_item_id, case_id, log_type, quantity_change,
          quantity_before, quantity_after, unit_cost, user_id, notes
        ) VALUES ($1, $2, 'TRANSFERRED', $3, $4, $5, $6, $7, $8)`,
        [cii.inventory_item_id, cii.case_id, qty, qtyBefore, qtyAfter,
         cii.unit_cost, userId,
         `Case purchase leftover converted back to inventory: ${notes || ''}`]
      );
    });
  }

  /**
   * Get case profitability summary
   */
  static async getCaseProfitSummary(caseId) {
    const result = await query(
      `SELECT *
       FROM case_financials
       WHERE id = $1`,
      [caseId]
    );

    if (!result.rows.length) {
      return {
        case_id: caseId,
        revenue: 0,
        inventory_expense: 0,
        direct_purchase_expense: 0,
        shipping_expense: 0,
        vendor_expense: 0,
        lab_expense: 0,
        misc_expense: 0,
        total_expenses: 0,
        gross_profit: 0
      };
    }

    return result.rows[0];
  }

  /**
   * Get item usage analytics
   */
  static async getItemUsageAnalytics(itemId) {
    const result = await query(
      `SELECT
        COUNT(DISTINCT CASE WHEN log_type = 'PURCHASED' THEN 1 END) as purchase_count,
        SUM(CASE WHEN log_type = 'PURCHASED' THEN ABS(quantity_change) ELSE 0 END) as total_purchased_qty,
        SUM(CASE WHEN log_type = 'CONSUMED' THEN ABS(quantity_change) ELSE 0 END) as total_consumed_qty,
        SUM(CASE WHEN log_type = 'RETURNED' THEN ABS(quantity_change) ELSE 0 END) as total_returned_qty,
        SUM(CASE WHEN log_type = 'CONSUMED' THEN cost_impact ELSE 0 END) as total_consumed_value,
        COUNT(DISTINCT case_id) as cases_used_in
       FROM inventory_usage_logs
       WHERE inventory_item_id = $1`,
      [itemId]
    );

    return result.rows[0] || {
      purchase_count: 0,
      total_purchased_qty: 0,
      total_consumed_qty: 0,
      total_returned_qty: 0,
      total_consumed_value: 0,
      cases_used_in: 0
    };
  }

  /**
   * Get item's related cases with revenue
   */
  static async getItemRelatedCases(itemId) {
    const result = await query(
      `SELECT DISTINCT c.id, c.case_number, c.stage, c.created_at,
              SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END) as case_revenue
       FROM case_inventory_items cii
       JOIN cases c ON cii.case_id = c.id
       LEFT JOIN payments p ON c.id = p.case_id
       WHERE cii.inventory_item_id = $1
       GROUP BY c.id, c.case_number, c.stage, c.created_at
       ORDER BY c.created_at DESC`,
      [itemId]
    );

    return result.rows;
  }

  /**
   * Update item cost/pricing information
   */
  static async updateItemCostInfo(itemId, vendor, purchaseCost, unitCost) {
    const result = await query(
      `UPDATE inventory_items SET
        vendor = COALESCE($1, vendor),
        purchase_cost = COALESCE($2, purchase_cost),
        unit_cost = COALESCE($3, unit_cost),
        updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [vendor, purchaseCost ? parseFloat(purchaseCost) : null,
       unitCost ? parseFloat(unitCost) : null, itemId]
    );

    if (!result.rows.length) throw new Error('Item not found');
    return result.rows[0];
  }
}

module.exports = InventoryCaseService;
