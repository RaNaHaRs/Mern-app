require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'recoverlab_crm',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  connectionTimeoutMillis: 5000
});

async function seed() {
  const hash = await bcrypt.hash('Test@1234', 12);

  const existing = await pool.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'");
  if (parseInt(existing.rows[0].cnt) > 0) {
    console.log('Tenants already exist, skipping');
  } else {
    const users = [
      { u: 'datarc_mum', e: 'admin@datarcmumbai.com', n: 'Rahul Sharma', c: 'DataRescue Mumbai', ct: 'Mumbai', p: 'starter', s: 'active', d: 60, m: 2 },
      { u: 'hd_pros', e: 'admin@harddrivepros.com', n: 'Priya Patel', c: 'HardDrive Pros', ct: 'Delhi', p: 'professional', s: 'active', d: 150, m: 5 },
      { u: 'techlab_del', e: 'admin@techlabdelhi.com', n: 'Amit Singh', c: 'TechLab Delhi', ct: 'Delhi', p: 'business', s: 'active', d: 300, m: 15 },
      { u: 'reco_hub', e: 'admin@recoveryhub.com', n: 'Sneha Reddy', c: 'Recovery Hub Bangalore', ct: 'Bangalore', p: 'professional', s: 'active', d: 90, m: 5 },
      { u: 'dataclinic', e: 'admin@dataclinicpune.com', n: 'Vikram Joshi', c: 'DataClinic Pune', ct: 'Pune', p: 'starter', s: 'trial', d: 10, m: 2 },
      { u: 'oldlab', e: 'admin@oldlabchennai.com', n: 'Rajesh Kumar', c: 'OldLab Chennai', ct: 'Chennai', p: 'starter', s: 'expired', d: -5, m: 2 },
      { u: 'diskdr_hyd', e: 'admin@diskdrhyd.com', n: 'Anita Verma', c: 'DiskDR Hyderabad', ct: 'Hyderabad', p: 'business', s: 'active', d: 200, m: 12 },
      { u: 'ssd_labs', e: 'admin@ssdlabs.com', n: 'Arun Nair', c: 'SSD Recovery Labs', ct: 'Kochi', p: 'enterprise', s: 'active', d: 350, m: 25 },
      { u: 'quickfix_ahm', e: 'admin@quickfixahmedabad.com', n: 'Deepak Shah', c: 'QuickFix Ahmedabad', ct: 'Ahmedabad', p: 'starter', s: 'active', d: 45, m: 2 },
      { u: 'dataguard_kol', e: 'admin@dataguardkolkata.com', n: 'Meera Banerjee', c: 'DataGuard Kolkata', ct: 'Kolkata', p: 'professional', s: 'suspended', d: -15, m: 3 },
    ];
    for (const x of users) {
      const active = x.s !== 'expired' && x.s !== 'suspended';
      const expiryStr = x.d >= 0 ? `NOW() + INTERVAL '${x.d} days'` : `NOW() - INTERVAL '${Math.abs(x.d)} days'`;
      await pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, is_active, company_name, city, phone, subscription_plan, subscription_status, subscription_expiry, max_team_users)
         VALUES ($1, $2, $3, $4, 'admin', $5, $6, $7, '+91-00000', $8, $9, ${expiryStr}, $10)`,
        [x.u, x.e, hash, x.n, active, x.c, x.ct, x.p, x.s, x.m]
      );
    }
    console.log('Created 10 sample tenants');
  }

  const tenants = await pool.query("SELECT id, company_name, subscription_plan FROM users WHERE role = 'admin' ORDER BY created_at");

  const pcount = await pool.query('SELECT COUNT(*) AS cnt FROM saas_purchases');
  if (parseInt(pcount.rows[0].cnt) > 0) {
    console.log('Purchases already exist, skipping');
  } else {
    for (const t of tenants.rows) {
      const amt = { starter: 999, professional: 2499, business: 4999, enterprise: 9999 }[t.subscription_plan] || 999;
      await pool.query(
        `INSERT INTO saas_purchases (tenant_user_id, plan_key, plan_label, amount, months, status, paid_at)
         VALUES ($1, $2, $3, $4, 1, 'paid', NOW())`,
        [t.id, t.subscription_plan, t.subscription_plan, amt]
      );
    }
    console.log('Created ' + tenants.rows.length + ' purchase records');
  }

  await pool.query(`
    INSERT INTO discount_coupons (code, type, discount_type, discount_value, max_uses, used_count, description, expiry_date)
    VALUES
      ('WELCOME20', 'global', 'percent', 20, 100, 5, 'Welcome discount', NOW() + INTERVAL '90 days'),
      ('SAVE500', 'global', 'flat', 500, 50, 12, 'Flat off', NOW() + INTERVAL '60 days'),
      ('LAUNCH25', 'global', 'percent', 25, 200, 0, 'Launch offer', NOW() + INTERVAL '180 days')
    ON CONFLICT (code) DO NOTHING
  `);
  console.log('Created discount coupons');

  await pool.query(`
    INSERT INTO platform_settings (key, value)
    VALUES
      ('company_name', '"RecoverLab CRM"'),
      ('support_email', '"support@recoverlab.in"'),
      ('platform_timezone', '"Asia/Kolkata"'),
      ('currency', '"INR"'),
      ('trial_days', '14')
    ON CONFLICT (key) DO NOTHING
  `);
  console.log('Created platform settings');

  console.log('\nSeed complete!');
  await pool.end();
}

seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
