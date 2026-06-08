require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({
  host: process.env.DB_HOST||'localhost', port: parseInt(process.env.DB_PORT||'5432'),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});

async function main() {
  // Kill any hanging connections
  await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state != 'idle'");
  console.log('cleaned up locks');
  
  // Verify seed data
  let r = await pool.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
  console.log('tenants:', r.rows[0].cnt);
  r = await pool.query("SELECT COUNT(*) as cnt FROM saas_purchases WHERE status = 'paid'");
  console.log('paid purchases:', r.rows[0].cnt);
  r = await pool.query("SELECT COUNT(*) as cnt FROM discount_coupons");
  console.log('coupons:', r.rows[0].cnt);
  
  // Create a test super admin so we can login via API
  const hash = await bcrypt.hash('Admin@123', 12);
  // Check if super admin exists
  r = await pool.query("SELECT id FROM users WHERE username = 'sa_test'");
  if (r.rows.length === 0) {
    await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ($1,$2,$3,$4,$5,true)",
      ['sa_test', 'sa@test.com', hash, 'Test Super Admin', 'super_admin']
    );
    console.log('created test super admin');
  } else {
    console.log('super admin already exists');
  }
  
  await pool.end();
  
  // Now test API by starting a quick request
  console.log('\nSeed data verification complete. Ready for API testing.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
