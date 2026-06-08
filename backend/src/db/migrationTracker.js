/**
 * Migration Tracker - Ensures migrations run only once
 * Tracks which migrations have been applied to avoid re-running them
 */

const { pool } = require('../config/database');

/**
 * Initialize the migration tracking table
 */
async function initMigrationTracker(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migration_history (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      checksum VARCHAR(64),
      execution_time_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_migration_name ON migration_history(migration_name);
  `);
}

/**
 * Check if a migration has already been applied
 */
async function isMigrationApplied(client, migrationName) {
  const result = await client.query(
    'SELECT 1 FROM migration_history WHERE migration_name = $1',
    [migrationName]
  );
  return result.rows.length > 0;
}

/**
 * Mark a migration as applied
 */
async function markMigrationApplied(client, migrationName, executionTime = 0, checksum = null) {
  await client.query(
    `INSERT INTO migration_history (migration_name, execution_time_ms, checksum) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (migration_name) DO NOTHING`,
    [migrationName, executionTime, checksum]
  );
}

/**
 * Execute a migration if it hasn't been applied yet
 */
async function executeMigrationIfNeeded(client, migrationName, migrationFn) {
  const applied = await isMigrationApplied(client, migrationName);
  
  if (applied) {
    console.log(`⏭️  Skipping ${migrationName} (already applied)`);
    return false;
  }

  const startTime = Date.now();
  try {
    await migrationFn();
    const executionTime = Date.now() - startTime;
    await markMigrationApplied(client, migrationName, executionTime);
    console.log(`✅ ${migrationName} applied (${executionTime}ms)`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to apply ${migrationName}:`, err.message);
    throw err;
  }
}

/**
 * Execute SQL file migration if not already applied
 */
async function executeSqlMigrationIfNeeded(client, migrationName, sqlContent) {
  return executeMigrationIfNeeded(client, migrationName, async () => {
    await client.query(sqlContent);
  });
}

module.exports = {
  initMigrationTracker,
  isMigrationApplied,
  markMigrationApplied,
  executeMigrationIfNeeded,
  executeSqlMigrationIfNeeded
};
