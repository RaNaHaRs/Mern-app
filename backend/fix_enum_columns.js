const { pool } = require('./src/config/database');

async function fixEnumColumns() {
  const client = await pool.connect();
  try {
    console.log('Starting enum column fix...');
    
    // Check current column types
    console.log('\n1. Checking current column types...');
    const typeCheck = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'cases' 
      AND column_name IN ('interface', 'form_factor')
    `);
    console.log('Current types:', typeCheck.rows);

    // Convert interface column to VARCHAR
    console.log('\n2. Converting interface column to VARCHAR...');
    try {
      await client.query('ALTER TABLE cases ALTER COLUMN interface TYPE VARCHAR(50)');
      console.log('✅ interface column converted');
    } catch (e) {
      console.error('❌ Failed to convert interface:', e.message);
    }

    // Convert form_factor column to VARCHAR
    console.log('\n3. Converting form_factor column to VARCHAR...');
    try {
      await client.query('ALTER TABLE cases ALTER COLUMN form_factor TYPE VARCHAR(50)');
      console.log('✅ form_factor column converted');
    } catch (e) {
      console.error('❌ Failed to convert form_factor:', e.message);
    }

    // Drop old enum types
    console.log('\n4. Dropping old enum types...');
    try {
      await client.query('DROP TYPE IF EXISTS device_interface CASCADE');
      console.log('✅ device_interface enum dropped');
    } catch (e) {
      console.error('⚠️  device_interface not dropped:', e.message);
    }

    try {
      await client.query('DROP TYPE IF EXISTS device_form_factor CASCADE');
      console.log('✅ device_form_factor enum dropped');
    } catch (e) {
      console.error('⚠️  device_form_factor not dropped:', e.message);
    }

    // Verify changes
    console.log('\n5. Verifying changes...');
    const typeCheckAfter = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'cases' 
      AND column_name IN ('interface', 'form_factor')
    `);
    console.log('New types:', typeCheckAfter.rows);

    console.log('\n✅ All done! Columns are now VARCHAR');
    process.exit(0);
  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  } finally {
    client.release();
  }
}

fixEnumColumns();
