require('dotenv').config();

const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { migrateInventoryCasesIntegration } = require('./migrations/inventory_cases_integration');
const {
  initMigrationTracker,
  executeSqlMigrationIfNeeded,
  executeMigrationIfNeeded,
  isMigrationApplied,
  markMigrationApplied
} = require('./migrationTracker');

async function migrate() {

  const client = await pool.connect();

  try {

    console.log('📦 Running database migration check...');

    // Initialize migration tracking table
    await initMigrationTracker(client);

    // =========================================================
    // STEP 1: BASE SCHEMA
    // =========================================================

    // If base_schema is not tracked but tables already exist, just mark it applied
    const baseSchemaApplied = await isMigrationApplied(client, 'base_schema');
    if (!baseSchemaApplied) {
      const hasUsersTable = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'users'`
      );
      if (hasUsersTable.rows.length > 0) {
        console.log('⏭️  Skipping base_schema (tables already exist)');
        await markMigrationApplied(client, 'base_schema', 0);
      } else {
        const schema = fs.readFileSync(
          path.join(__dirname, 'schema.sql'),
          'utf8'
        );
        await executeSqlMigrationIfNeeded(client, 'base_schema', schema);
      }
    } else {
      console.log('⏭️  Skipping base_schema (already applied)');
    }


    // =========================================================
    // STEP 2: ALL MIGRATIONS WITH TRACKING
    // =========================================================

    // Define all migrations in order
    const migrations = [
      { name: '001_super_admin_schema', file: '001_super_admin_schema.sql' },
      { name: '002_add_user_permissions_column', file: '002_add_user_permissions_column.sql' },
      { name: '003_add_tenant_fields_to_users', file: '003_add_tenant_fields_to_users.sql' },
      { name: '004_field_config_inventory_transferred', file: '004_field_config_inventory_transferred.sql' },
      { name: '005_inventory_brands_categories', file: '005_inventory_brands_categories.sql' },
      { name: '006_inventory_soft_delete', file: '006_inventory_soft_delete.sql' },
      { name: '007_add_transfer_to_client', file: '007_add_transfer_to_client.sql' },
      { name: '009_add_esata_device_interface', file: '009_add_esata_device_interface.sql' },
      { name: '010_create_chat_tables', file: '010_create_chat_tables.sql' },
      { name: '012_inventory_health_and_notes_timeline', file: '012_inventory_health_and_notes_timeline.sql' },
      { name: '012_solution_knowledge_base', file: '012_solution_knowledge_base.sql' },
      { name: '013_media_recycle_bin', file: '013_media_recycle_bin.sql' },
      { name: '014_failure_type_cases_varchar', file: '014_failure_type_cases_varchar.sql' },
      { name: '015_problem_diagnosis_history', file: '015_problem_diagnosis_history.sql' },
      { name: '016_add_pending_amount_soft_delete', file: '016_add_pending_amount_soft_delete.sql' },
      { name: '016_unified_tenant_id', file: '016_unified_tenant_id.sql' },
      { name: '017_add_assigned_admin_to_users', file: '017_add_assigned_admin_to_users.sql' },
      { name: '017_create_activity_logs', file: '017_create_activity_logs.sql' },
      { name: '020_case_stage_to_varchar', file: '020_case_stage_to_varchar.sql' },
      { name: '021_create_accounting_purchases', file: '021_create_accounting_purchases.sql' },
      { name: '022_add_discount_and_case_id', file: '022_add_discount_and_case_id.sql' },
      { name: '023_add_case_id_to_expenses', file: '023_add_case_id_to_expenses.sql' },
      { name: '024_add_inventory_item_id_to_purchases', file: '024_add_inventory_item_id_to_purchases.sql' },
      { name: '025_add_client_missing_fields', file: '025_add_client_missing_fields.sql' },
      { name: '030_create_automation_center', file: '030_create_automation_center.sql' },
      { name: '040_add_inward_pdf_path_to_cases', file: '040_add_inward_pdf_path_to_cases.sql' },
      { name: '041_tenant_case_sequences', file: '041_tenant_case_sequences.sql' },
      { name: '042_add_reset_password_token_to_users', file: '042_add_reset_password_token_to_users.sql' },
      { name: '043_password_reset_rate_limit', file: '043_password_reset_rate_limit.sql' },
      { name: '044_add_user_profile_fields', file: '044_add_user_profile_fields.sql' },
      { name: '050_inventory_extended_schema', file: '050_inventory_extended_schema.sql' },
      { name: '051_make_tenant_user_id_nullable', file: '051_make_tenant_user_id_nullable.sql' },
      { name: '051_add_discount_to_case_inventory_items', file: '051_add_discount_to_case_inventory_items.sql' },
      { name: '052_create_payment_links_table', file: '052_create_payment_links_table.sql' },
      { name: '052_add_charge_to_client_inventory', file: '052_add_charge_to_client_inventory.sql' },
      { name: '053_add_deleted_at_to_accounting_quotes', file: '053_add_deleted_at_to_accounting_quotes.sql' },
      { name: '054_update_case_financials_view', file: '054_update_case_financials_view.sql' },
      { name: '055_add_reply_to_id_to_communications', file: '055_add_reply_to_id_to_communications.sql' },
      { name: '056_change_interface_formfactor_to_varchar', file: '056_change_interface_formfactor_to_varchar.sql' },
      { name: '061_refresh_tokens_security_hardening', file: '061_refresh_tokens_security_hardening.sql' },
      { name: '054_create_payment_link_email_tracking', file: '054_create_payment_link_email_tracking.sql' },
      { name: '055_add_discount_tracking_to_payments', file: '055_add_discount_tracking_to_payments.sql' },
      { name: '056_allow_zero_amount_in_payments', file: '056_allow_zero_amount_in_payments.sql' }
    ];

    // Execute all SQL file migrations
    for (const migration of migrations) {
      try {
        const migrationPath = path.join(__dirname, 'migrations', migration.file);
        if (fs.existsSync(migrationPath)) {
          const sqlContent = fs.readFileSync(migrationPath, 'utf8');
          await executeSqlMigrationIfNeeded(client, migration.name, sqlContent);
        }
      } catch (err) {
        console.warn(`⚠️  ${migration.name} migration warning (non-fatal):`, err.message);
      }
    }

    // Special migrations with custom logic
    await executeMigrationIfNeeded(client, 'inventory_cases_integration', async () => {
      await migrateInventoryCasesIntegration();
    });

    await executeMigrationIfNeeded(client, 'user_role_enum_cleanup', async () => {
      const hasRoleEnum = await client.query("SELECT 1 FROM pg_type WHERE typname = 'user_role'");
      if (hasRoleEnum.rows.length) {
        await client.query("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(100) USING role::text");
        await client.query("DROP TYPE IF EXISTS user_role CASCADE");
      }
    });

    // =========================================================
    // STEP 3: SEED USERS (only if not exist)
    // =========================================================

    await executeMigrationIfNeeded(client, 'seed_super_admin', async () => {
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
    });

    await executeMigrationIfNeeded(client, 'seed_default_admin', async () => {
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
    });

    await executeMigrationIfNeeded(client, 'seed_sample_engineer', async () => {
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
    });

    // =========================================================
    // DONE
    // =========================================================

    console.log('🎉 Migration check completed successfully!');
    console.log('   Default users: super_admin, admin, john_eng');

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
