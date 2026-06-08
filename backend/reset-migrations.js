/**
 * Migration Reset Tool
 * Use this ONLY if you need to force re-run migrations for testing/debugging
 * 
 * Usage:
 *   node reset-migrations.js                    - Show migration history
 *   node reset-migrations.js --clear-all        - Clear ALL migration history (DANGEROUS!)
 *   node reset-migrations.js --remove <name>    - Remove specific migration
 */

require('dotenv').config();
const { pool } = require('./src/config/database');

async function showMigrations() {
  const result = await pool.query(`
    SELECT migration_name, applied_at, execution_time_ms 
    FROM migration_history 
    ORDER BY applied_at DESC
  `);
  
  console.log('\n📋 Migration History:');
  console.log('═'.repeat(80));
  
  if (result.rows.length === 0) {
    console.log('No migrations have been applied yet.');
  } else {
    result.rows.forEach(row => {
      console.log(`✓ ${row.migration_name}`);
      console.log(`  Applied: ${row.applied_at} (${row.execution_time_ms}ms)`);
    });
  }
  
  console.log('═'.repeat(80));
  console.log(`Total: ${result.rows.length} migrations applied\n`);
}

async function clearAllMigrations() {
  console.log('\n⚠️  WARNING: This will clear ALL migration history!');
  console.log('This means all migrations will re-run on next server start.\n');
  
  const result = await pool.query('DELETE FROM migration_history RETURNING *');
  console.log(`✅ Cleared ${result.rows.length} migration records\n`);
}

async function removeMigration(name) {
  const result = await pool.query(
    'DELETE FROM migration_history WHERE migration_name = $1 RETURNING *',
    [name]
  );
  
  if (result.rows.length > 0) {
    console.log(`✅ Removed migration: ${name}\n`);
  } else {
    console.log(`❌ Migration not found: ${name}\n`);
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args[0] === '--clear-all') {
      await clearAllMigrations();
    } else if (args[0] === '--remove' && args[1]) {
      await removeMigration(args[1]);
    } else {
      await showMigrations();
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
