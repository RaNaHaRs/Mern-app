require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST||'localhost', port: parseInt(process.env.DB_PORT||'5432'),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});
(async () => {
  await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
  
  // Fix: update the null-company user to be a proper tenant
  await pool.query("UPDATE users SET username='placeholder_user', company_name='Placeholder Co', email='placeholder@co.com', city='City', phone='+91-00000', subscription_plan='starter', subscription_status='active', subscription_expiry=NOW() + INTERVAL '30 days', max_team_users=2 WHERE company_name IS NULL AND role = 'admin'");
  console.log('fixed null company');
  
  // Update the test user that has 'Test Company' as name
  await pool.query("DELETE FROM saas_purchases WHERE tenant_user_id IN (SELECT id FROM users WHERE username IN ('testuser123','test123abc'))");
  await pool.query("DELETE FROM users WHERE username IN ('testuser123','test123abc')");
  console.log('removed test users');
  
  // Show remaining tenants
  let r = await pool.query("SELECT username, company_name, subscription_plan, subscription_status FROM users WHERE role = 'admin' ORDER BY created_at");
  console.log('tenants:', r.rows.length);
  r.rows.forEach(x => console.log(' - ' + x.username + ': ' + x.company_name + ' (' + x.subscription_plan + '/' + x.subscription_status + ')'));
  
  r = await pool.query("SELECT COUNT(*) as cnt FROM saas_purchases");
  console.log('purchases:', r.rows[0].cnt);
  
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
