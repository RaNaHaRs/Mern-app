const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const pool = new Pool({ connectionString: 'postgresql://postgres:dhari@2006@localhost:5432/recoverlab_crm' });
(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'src', 'db', 'migrations', '017_create_activity_logs.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ activity_logs table created');
  } catch (e) {
    console.error('❌', e.message);
  }
  await pool.end();
})();
