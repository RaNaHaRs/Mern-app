/**
 * Database Migration: Inventory ↔ Cases Integration
 * This migration creates all necessary tables and indexes for the inventory-case integration feature
 */

const { query } = require('../../config/database');

async function migrateInventoryCasesIntegration() {
  try {
    console.log('🚀 Starting Inventory ↔ Cases Integration Migration...');

    // 1. Create inventory_usage_logs table (immutable audit log)
    console.log('  ✓ Creating inventory_usage_logs table...');
    await query(`
      CREATE TABLE IF NOT EXISTS inventory_usage_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
        log_type VARCHAR(50) NOT NULL,
        quantity_change INTEGER NOT NULL,
        quantity_before INTEGER,
        quantity_after INTEGER,
        unit_cost DECIMAL(10,2),
        cost_impact DECIMAL(12,2),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 2. Create case_inventory_items table
    console.log('  ✓ Creating case_inventory_items table...');
    await query(`
      CREATE TABLE IF NOT EXISTS case_inventory_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        usage_type VARCHAR(50) NOT NULL,
        qty_allocated INTEGER NOT NULL DEFAULT 1,
        qty_used INTEGER NOT NULL DEFAULT 0,
        qty_returned INTEGER NOT NULL DEFAULT 0,
        qty_damaged INTEGER NOT NULL DEFAULT 0,
        unit_cost DECIMAL(10,2) NOT NULL,
        total_allocated_cost DECIMAL(12,2) GENERATED ALWAYS AS (qty_allocated * unit_cost) STORED,
        total_used_cost DECIMAL(12,2) GENERATED ALWAYS AS (qty_used * unit_cost) STORED,
        status VARCHAR(50) DEFAULT 'allocated',
        assigned_at TIMESTAMPTZ,
        returned_at TIMESTAMPTZ,
        condition_on_return VARCHAR(100),
        is_leftover_converted BOOLEAN DEFAULT false,
        leftover_qty INTEGER,
        notes TEXT,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 3. Create case_expenses table
    console.log('  ✓ Creating case_expenses table...');
    await query(`
      CREATE TABLE IF NOT EXISTS case_expenses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        expense_type VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        description TEXT NOT NULL,
        reference_id UUID,
        reference_type VARCHAR(50),
        category VARCHAR(100),
        vendor_name VARCHAR(255),
        notes TEXT,
        recorded_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 4. Create case_financials view
    console.log('  ✓ Creating case_financials view...');
    await query(`
      CREATE OR REPLACE VIEW case_financials AS
      SELECT
        c.id,
        c.case_number,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN ce.expense_type = 'inventory' THEN ce.amount ELSE 0 END), 0) as inventory_expense,
        COALESCE(SUM(CASE WHEN ce.expense_type = 'direct_purchase' THEN ce.amount ELSE 0 END), 0) as direct_purchase_expense,
        COALESCE(SUM(CASE WHEN ce.expense_type = 'shipping' THEN ce.amount ELSE 0 END), 0) as shipping_expense,
        COALESCE(SUM(CASE WHEN ce.expense_type = 'vendor' THEN ce.amount ELSE 0 END), 0) as vendor_expense,
        COALESCE(SUM(CASE WHEN ce.expense_type = 'lab' THEN ce.amount ELSE 0 END), 0) as lab_expense,
        COALESCE(SUM(CASE WHEN ce.expense_type = 'misc' THEN ce.amount ELSE 0 END), 0) as misc_expense,
        COALESCE(SUM(ce.amount), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) -
        COALESCE(SUM(ce.amount), 0) as gross_profit
      FROM cases c
      LEFT JOIN payments p ON c.id = p.case_id
      LEFT JOIN case_expenses ce ON c.id = ce.case_id
      GROUP BY c.id, c.case_number
    `);

    // 5. Add indexes
    console.log('  ✓ Creating indexes...');
    await query('CREATE INDEX IF NOT EXISTS idx_inventory_usage_logs_item ON inventory_usage_logs(inventory_item_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_inventory_usage_logs_case ON inventory_usage_logs(case_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_inventory_usage_logs_created ON inventory_usage_logs(created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_case_inventory_items_case ON case_inventory_items(case_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_case_inventory_items_item ON case_inventory_items(inventory_item_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_case_inventory_items_status ON case_inventory_items(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_case_expenses_case ON case_expenses(case_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_case_expenses_type ON case_expenses(expense_type)');
    await query('CREATE INDEX IF NOT EXISTS idx_case_expenses_created ON case_expenses(created_at DESC)');

    // 6. Modify inventory_items table (add new columns if they don't exist)
    console.log('  ✓ Modifying inventory_items table...');
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS vendor VARCHAR(255)`);
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES users(id)`);
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(10,2)`);
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2)`);
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available'`);
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);

    console.log('✅ Inventory ↔ Cases Integration Migration Completed Successfully!');
    return true;
  } catch (err) {
    console.error('❌ Migration Error:', err.message);
    throw err;
  }
}

module.exports = { migrateInventoryCasesIntegration };
