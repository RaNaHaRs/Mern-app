require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({
  host: process.env.DB_HOST||'localhost', port: parseInt(process.env.DB_PORT||'5432'),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});
(async () => {
  let hash = await bcrypt.hash('Test@1234', 12);
  console.log('hash done');
  await pool.query("DELETE FROM users WHERE username = 'test123abc'");
  console.log('cleanup done');
  await pool.query("INSERT INTO users (username, email, password_hash, full_name, role, is_active, company_name, city, phone, subscription_plan, subscription_status, subscription_expiry, max_team_users) VALUES ($1, $2, $3, $4, 'admin', true, 'TestCo', 'City', '+91-00000', 'starter', 'active', NOW() + INTERVAL '30 days', 2)", ['test123abc', 'test123@abc.com', hash, 'Tester']);
  console.log('insert done');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
