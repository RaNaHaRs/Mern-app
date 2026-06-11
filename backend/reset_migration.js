const { pool } = require('./src/config/database');

async function resetMigration() {
  const client = await pool.connect();
  try {
    console.log('Resetting 056 migration...');
    const result = await client.query(
      'DELETE FROM migration_history WHERE migration_name = $1',
      ['056_change_interface_formfactor_to_varchar']
    );
    console.log('Deleted', result.rowCount, 'rows');
    console.log('✅ Migration reset. Run npm run migrate again');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

resetMigration();
