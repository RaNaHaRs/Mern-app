const { Pool } = require('pg');
const logger = require('./logger');

// ─── Database Credentials Validation ────────────────────────────
function validateDatabaseConfig() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'data_recovery_crm',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  const isProduction = process.env.NODE_ENV === 'production';

  // ─── Critical Security Checks ─────────────────────────────
  if (isProduction) {
    // Check for default credentials in production
    if (config.user === 'postgres' && config.password === 'postgres') {
      const msg = '🔴 CRITICAL SECURITY ISSUE: Using default PostgreSQL credentials (postgres/postgres) in production. This is a critical vulnerability.';
      logger.error(msg);
      throw new Error('Default PostgreSQL credentials detected in production');
    }

    // Warn if using localhost
    if (config.host === 'localhost' || config.host === '127.0.0.1') {
      logger.error('🔴 ERROR: Database host is localhost in production. Must connect to a remote database for security and availability.');
      throw new Error('Localhost database not allowed in production');
    }

    // Require SSL in production
    if (!config.ssl) {
      logger.warn('⚠️  WARNING: Database SSL is not enabled in production. Enable with DB_SSL=true for security.');
    }
  }

  // ─── Configuration Validation ─────────────────────────────
  if (!config.database || config.database === 'data_recovery_crm' && isProduction) {
    logger.warn('ℹ️  Using default database name. Consider setting DB_NAME in production.');
  }

  if (config.min < 1 || config.min > 10) {
    logger.warn(`⚠️  DB_POOL_MIN=${config.min} may be suboptimal. Recommended: 2-5`);
  }
  if (config.max < 5 || config.max > 100) {
    logger.warn(`⚠️  DB_POOL_MAX=${config.max} may be suboptimal. Recommended: 10-30`);
  }
  if (config.min > config.max) {
    throw new Error(`Invalid pool configuration: min (${config.min}) cannot exceed max (${config.max})`);
  }

  logger.info('✅ Database configuration validated', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    poolMin: config.min,
    poolMax: config.max,
    ssl: !!config.ssl,
  });

  return config;
}

// Validate config on module load
const dbConfig = validateDatabaseConfig();

// ─── Connection Pool ────────────────────────────────────────────
const pool = new Pool(dbConfig);

pool.on('error', (err) => {
  logger.error('Unexpected pool client error', { error: err.message });
});

async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() as now');
    logger.info('✅ Database connection test successful', { 
      time: result.rows[0].now,
      host: dbConfig.host,
      database: dbConfig.database 
    });
    return true;
  } catch (err) {
    logger.error('❌ Database connection test failed', { 
      error: err.message,
      host: dbConfig.host,
      database: dbConfig.database,
      user: dbConfig.user
    });
    throw err;
  } finally {
    client.release();
  }
}

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { 
        duration: `${duration}ms`, 
        query: text.substring(0, 100),
        paramCount: params?.length || 0
      });
    }
    return result;
  } catch (err) {
    logger.error('Query error', { 
      query: text.substring(0, 100), 
      error: err.message 
    });
    throw err;
  }
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction, testConnection, validateDatabaseConfig };
