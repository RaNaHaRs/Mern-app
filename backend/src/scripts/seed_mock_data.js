require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'recoverlab_crm',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function seed() {
  console.log('Starting seed...');
  const hash = await bcrypt.hash('Test@1234', 12);

  // 1. Add Engineers
  console.log('Adding engineers...');
  const engineers = [
    { u: 'eng_john', e: 'john@recoverlab.in', n: 'John Doe', r: 'staff' },
    { u: 'eng_jane', e: 'jane@recoverlab.in', n: 'Jane Smith', r: 'support_engineer' },
  ];
  const engIds = [];
  for (const eng of engineers) {
    const res = await pool.query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email RETURNING id',
      [eng.u, eng.e, hash, eng.n, eng.r]
    );
    engIds.push(res.rows[0].id);
  }

  // 2. Add Clients
  console.log('Adding clients...');
  const clients = [
    { f: 'Alice', l: 'Brown', ph: '9876543210' },
    { f: 'Bob', l: 'White', ph: '9123456789' },
  ];
  const clientIds = [];
  for (const cl of clients) {
    const res = await pool.query(
      'INSERT INTO clients (first_name, last_name, phone) VALUES ($1, $2, $3) RETURNING id',
      [cl.f, cl.l, cl.ph]
    );
    clientIds.push(res.rows[0].id);
  }

  // 3. Add Inventory (with and without unit cost)
  console.log('Adding inventory...');
  await pool.query('INSERT INTO inventory_items (sku, name, category, quantity, unit_cost) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', ['SKU-001', 'Seagate 1TB HDD', 'spare_part', 10, 2500]);
  await pool.query('INSERT INTO inventory_items (sku, name, category, quantity, unit_cost) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', ['SKU-002', 'Generic Cable', 'consumable', 100, null]);

  // 4. Add Cases
  console.log('Adding cases...');
  await pool.query(
    'INSERT INTO cases (case_number, client_id, device_brand, device_model, assigned_engineer, stage) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
    ['DR-2026-00001', clientIds[0], 'Seagate', 'Barracuda', engIds[0], 'received']
  );
  await pool.query(
    'INSERT INTO cases (case_number, client_id, device_brand, device_model, assigned_engineer, stage) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
    ['DR-2026-00002', clientIds[1], 'Western Digital', 'Blue', engIds[1], 'diagnosis']
  );

  console.log('Mock data added successfully!');
  await pool.end();
}

seed().catch(e => { console.error('Error:', e); process.exit(1); });
