require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST||'localhost', port: parseInt(process.env.DB_PORT||'5432'),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});
(async () => {
  await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
  let r = await pool.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
  console.log('tenants:', r.rows[0].cnt);
  r = await pool.query("SELECT COUNT(*) as cnt FROM saas_purchases");
  console.log('purchases:', r.rows[0].cnt);
  r = await pool.query("SELECT company_name, subscription_plan, subscription_status FROM users WHERE role = 'admin' ORDER BY created_at");
  console.log('tenant list:', r.rows.map(x => x.company_name + ' (' + x.subscription_plan + '/' + x.subscription_status + ')').join(', '));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
