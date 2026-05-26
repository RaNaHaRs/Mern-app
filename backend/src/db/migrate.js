require('dotenv').config();

const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

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
      const solutionKbSchema = fs.readFileSync(
        path.join(__dirname, 'migrations', '012_solution_knowledge_base.sql'),
        'utf8'
      );
      await client.query(solutionKbSchema);
      console.log('✅ Solution notes & knowledge base migration applied');
    } catch (kbErr) {
      console.warn('⚠️  Solution/KB migration warning (non-fatal):', kbErr.message);
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
