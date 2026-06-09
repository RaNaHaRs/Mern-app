require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST||'localhost', port: parseInt(process.env.DB_PORT||'5432'),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});
(async () => {
  let r = await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
  console.log('killed', r.rowCount + ' connections');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
