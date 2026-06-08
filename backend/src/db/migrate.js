require('dotenv').config();

const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { migrateInventoryCasesIntegration } = require('./migrations/inventory_cases_integration');

async function migrate() {

  const client = await pool.connect();

  try {

    console.log('📦 Running database migration...');

    // =========================================================
    // STEP 1: BASE SCHEMA
    // =========================================================

    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'),
      'utf8'
    );

    const schemaCheck = await client.query("SELECT to_regclass('public.users') AS users_table");
    if (!schemaCheck.rows[0].users_table) {
      await client.query(schema);
      console.log('✅ Base schema applied');
    } else {
      console.log('✅ Base schema already exists, skipping base schema apply');
    }


    // =========================================================
    // STEP 2: SUPER ADMIN MIGRATION
    // =========================================================

    const saSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_super_admin_schema.sql'),
      'utf8'
    );

    // IMPORTANT:
    // Execute WHOLE SQL FILE at once.
    // DO NOT split SQL manually.
    await client.query(saSchema);

    console.log('✅ Super Admin schema migration applied');

    const userPermSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '002_add_user_permissions_column.sql'),
      'utf8'
    );
    await client.query(userPermSchema);

    console.log('✅ User permissions schema migration applied');

    // =========================================================
    // STEP 2b: TENANT FIELDS MIGRATION
    // =========================================================

    const tenantFieldsSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '003_add_tenant_fields_to_users.sql'),
      'utf8'
    );
    await client.query(tenantFieldsSchema);

    console.log('✅ Tenant fields migration applied (subscription_plan, company_name, etc.)');

    // =========================================================
    // STEP 2c: FIELD CONFIG + INVENTORY + TRANSFERRED ITEMS
    // =========================================================
    const fieldConfigSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '004_field_config_inventory_transferred.sql'),
      'utf8'
    );
    await client.query(fieldConfigSchema);
    console.log('✅ Field config, inventory extensions, and transferred items migration applied');

    const invBrandsSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '005_inventory_brands_categories.sql'),
      'utf8'
    );
    await client.query(invBrandsSchema);
    console.log('✅ Inventory brands & categories migration applied');

    const invSoftDeleteSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '006_inventory_soft_delete.sql'),
      'utf8'
    );
    await client.query(invSoftDeleteSchema);
    console.log('✅ Inventory soft delete migration applied');

    const transferToClientSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '007_add_transfer_to_client.sql'),
      'utf8'
    );
    await client.query(transferToClientSchema);
    console.log('✅ Transfer to client migration applied');

    const addEsataInterfaceSchema = fs.readFileSync(
      path.join(__dirname, 'migrations', '009_add_esata_device_interface.sql'),
      'utf8'
    );
    await client.query(addEsataInterfaceSchema);
    console.log('✅ eSATA device_interface migration applied');

    // =========================================================
    // STEP 2d: CHAT TABLES MIGRATION
    // =========================================================
    try {
      const chatTablesSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '010_create_chat_tables.sql'),
        'utf8'
      );
      await client.query(chatTablesSchema);
      console.log('✅ Chat tables migration applied');
    } catch (chatErr) {
      console.warn('⚠️  Chat tables migration warning (non-fatal):', chatErr.message);
    }

    try {
      const inventoryTimelineSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '012_inventory_health_and_notes_timeline.sql'),
        'utf8'
      );
      await client.query(inventoryTimelineSchema);
      console.log('✅ Inventory notes timeline migration applied');
    } catch (inventoryTimelineErr) {
      console.warn('✅  Inventory notes timeline migration warning (non-fatal):', inventoryTimelineErr.message);
    }

    try {
      const solutionKbSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '012_solution_knowledge_base.sql'),
        'utf8'
      );
      await client.query(solutionKbSchema);
      console.log('✅ Solution notes & knowledge base migration applied');
    } catch (kbErr) {
      console.warn('⚠️  Solution/KB migration warning (non-fatal):', kbErr.message);
    }

    try {
      const mediaRecycleSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '013_media_recycle_bin.sql'),
        'utf8'
      );
      await client.query(mediaRecycleSchema);
      console.log('✅ Media recycle bin migration applied');
    } catch (mediaRbErr) {
      console.warn('⚠️  Media recycle bin migration warning (non-fatal):', mediaRbErr.message);
    }

    try {
      const failureTypeSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '014_failure_type_cases_varchar.sql'),
        'utf8'
      );
      await client.query(failureTypeSchema);
      console.log('✅ Failure type cases column migration applied');
    } catch (failureTypeErr) {
      console.warn('⚠️  Failure type migration warning (non-fatal):', failureTypeErr.message);
    }

    try {
      const problemHistorySchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '015_problem_diagnosis_history.sql'),
        'utf8'
      );
      await client.query(problemHistorySchema);
      console.log('✅ Problem & diagnosis history migration applied');
    } catch (problemHistoryErr) {
      console.warn('⚠️  Problem history migration warning (non-fatal):', problemHistoryErr.message);
    }

    try {
      const softDeleteSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '016_add_pending_amount_soft_delete.sql'),
        'utf8'
      );
      await client.query(softDeleteSchema);
      console.log('✅ Case soft delete and pending amount migration applied');
    } catch (softDeleteErr) {
      console.warn('⚠️  Case soft delete migration warning (non-fatal):', softDeleteErr.message);
    }

    // Ensure stock_number column exists on inventory_items before tenant migration
    try {
      await client.query("ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS stock_number VARCHAR(100)");
    } catch (stockErr) {
      console.warn('⚠️  stock_number column addition warning (non-fatal):', stockErr.message);
    }

    try {
      const unifiedTenantSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '016_unified_tenant_id.sql'),
        'utf8'
      );
      await client.query(unifiedTenantSchema);
      console.log('✅ Unified tenant_id migration applied');
    } catch (unifiedTenantErr) {
      console.warn('⚠️  Unified tenant_id migration warning (non-fatal):', unifiedTenantErr.message);
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    try {
      const assignedAdminSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '017_add_assigned_admin_to_users.sql'),
        'utf8'
      );
      await client.query(assignedAdminSchema);
      console.log('✅ Assigned admin migration applied');
    } catch (assignedAdminErr) {
      console.warn('⚠️  Assigned admin migration warning (non-fatal):', assignedAdminErr.message);
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    try {
      const activityLogsSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '017_create_activity_logs.sql'),
        'utf8'
      );
      await client.query(activityLogsSchema);
      console.log('✅ Activity logs table migration applied');
    } catch (activityLogsErr) {
      console.warn('⚠️  Activity logs migration warning (non-fatal):', activityLogsErr.message);
    }

    try {
      const caseStageSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '020_case_stage_to_varchar.sql'),
        'utf8'
      );
      await client.query(caseStageSchema);
      console.log('✅ Case stage enum conversion migration applied');
    } catch (caseStageErr) {
      console.warn('⚠️  Case stage migration warning (non-fatal):', caseStageErr.message);
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    // =========================================================
    // Automation Center migration
    // =========================================================
    try {
      const automationSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '030_create_automation_center.sql'),
        'utf8'
      );
      await client.query(automationSchema);
      console.log('✅ Automation Center migration applied');
    } catch (automationErr) {
      console.warn('⚠️  Automation Center migration warning (non-fatal):', automationErr.message);
    }

    // =========================================================
    // Add inward_pdf_path to cases (for storing uploaded inward PDFs)
    // =========================================================
    try {
      const inwardPdfSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '040_add_inward_pdf_path_to_cases.sql'),
        'utf8'
      );
      await client.query(inwardPdfSchema);
      console.log('✅ Added inward_pdf_path column to cases');
    } catch (inwardPdfErr) {
      console.warn('⚠️  inward_pdf_path migration warning (non-fatal):', inwardPdfErr.message);
    }

    try {
      const purchasesSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '021_create_accounting_purchases.sql'),
        'utf8'
      );
      await client.query(purchasesSchema);
      console.log('✅ Accounting purchases migration applied');
    } catch (purchasesErr) {
      console.warn('⚠️  Accounting purchases migration warning (non-fatal):', purchasesErr.message);
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    try {
      const discountCaseSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '022_add_discount_and_case_id.sql'),
        'utf8'
      );
      await client.query(discountCaseSchema);
      console.log('✅ Payments discount fields & invoice case_id migration applied');
    } catch (discountCaseErr) {
      console.warn('⚠️  Payments discount / invoice case_id migration warning (non-fatal):', discountCaseErr.message);
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    try {
      const caseIdExpSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '023_add_case_id_to_expenses.sql'),
        'utf8'
      );
      await client.query(caseIdExpSchema);
      console.log('✅ Case ID added to accounting_expenses migration applied');
    } catch (caseIdExpErr) {
      console.warn('⚠️  Case ID to expenses migration warning (non-fatal):', caseIdExpErr.message);
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    try {
      const invItemPurchSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '024_add_inventory_item_id_to_purchases.sql'),
        'utf8'
      );
      await client.query(invItemPurchSchema);
      console.log('✅ Inventory item ID added to accounting_purchases migration applied');
    } catch (invItemPurchErr) {
      console.warn('⚠️  Inventory item to purchases migration warning (non-fatal):', invItemPurchErr.message);
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    try {
      const clientFieldsSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '025_add_client_missing_fields.sql'),
        'utf8'
      );
      await client.query(clientFieldsSchema);
      console.log('✅ Client missing fields (state, pincode, whatsapp, middle_name) migration applied');
    } catch (clientFieldsErr) {
      console.warn('⚠️  Client fields migration warning (non-fatal):', clientFieldsErr.message);
    }

    // =========================================================
    // Tenant-specific case numbering
    // =========================================================
    try {
      const tenantCaseSeqSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '041_tenant_case_sequences.sql'),
        'utf8'
      );
      await client.query(tenantCaseSeqSchema);
      console.log('✅ Tenant-specific case numbering migration applied');
    } catch (tenantCaseSeqErr) {
      console.warn('⚠️  Tenant case sequences migration warning (non-fatal):', tenantCaseSeqErr.message);
    }

    // =========================================================
    // INVENTORY ↔ CASES INTEGRATION TABLES
    // =========================================================
    try {
      await migrateInventoryCasesIntegration();
    } catch (invCasesErr) {
      console.warn('⚠️  Inventory-cases integration migration warning (non-fatal):', invCasesErr.message);
    }

    const hasRoleEnum = await client.query("SELECT 1 FROM pg_type WHERE typname = 'user_role'");
    if (hasRoleEnum.rows.length) {
      try {
        await client.query("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(100) USING role::text");
        await client.query("DROP TYPE IF EXISTS user_role CASCADE");
        console.log('✅ Converted legacy users.role enum to VARCHAR(100)');
      } catch (enumErr) {
        console.log('ℹ️  user_role enum cleanup skipped (already converted or in use):', enumErr.message);
      }
    }

    try {
      const resetPwdSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '042_add_reset_password_token_to_users.sql'),
        'utf8'
      );
      await client.query(resetPwdSchema);
      console.log('✅ Forgot/Reset password columns migration applied');
    } catch (resetPwdErr) {
      console.warn('⚠️  Forgot/Reset password columns migration warning (non-fatal):', resetPwdErr.message);
    }

    try {
      const resetRateLimitSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '043_password_reset_rate_limit.sql'),
        'utf8'
      );
      await client.query(resetRateLimitSchema);
      console.log('✅ Password reset rate-limit table migration applied');
    } catch (resetRateLimitErr) {
      console.warn('⚠️  Password reset rate-limit migration warning (non-fatal):', resetRateLimitErr.message);
    }

    // =========================================================
    // STEP 3: SEED USERS
    // =========================================================

    // 👑 Platform Super Admin
    const saHash = await bcrypt.hash('SuperAdmin@2024', 12);

    await client.query(`
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        role
      )
      VALUES (
        'super_admin',
        'superadmin@recoverlab.in',
        $1,
        'Platform Super Admin',
        'super_admin'
      )
      ON CONFLICT (username) DO NOTHING
    `, [saHash]);


    // 👤 Default Tenant Admin
    const adminHash = await bcrypt.hash('Admin@1234', 12);

    await client.query(`
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        role
      )
      VALUES (
        'admin',
        'admin@datarecovery.lab',
        $1,
        'System Administrator',
        'admin'
      )
      ON CONFLICT (username) DO NOTHING
    `, [adminHash]);


    // 👨‍🔧 Sample Engineer
    const engHash = await bcrypt.hash('Engineer@1234', 12);

    await client.query(`
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        role,
        specializations
      )
      VALUES (
        'john_eng',
        'john@datarecovery.lab',
        $1,
        'John Smith',
        'senior_engineer',
        ARRAY[
          'head_swap',
          'firmware',
          'mechanical'
        ]
      )
      ON CONFLICT (username) DO NOTHING
    `, [engHash]);


    // =========================================================
    // DONE
    // =========================================================

    console.log('✅ Users seeded:');
    console.log('   👑 super_admin / SuperAdmin@2024');
    console.log('   👤 admin       / Admin@1234');
    console.log('   👨‍🔧 john_eng    / Engineer@1234');

    console.log('\n🎉 Migration completed successfully!');

  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error('\n❌ Migration failed:');
      console.error(err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { migrate };
