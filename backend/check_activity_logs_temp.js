const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:dhari@2006@localhost:5432/recoverlab_crm' });
(async () => {
  const r = await pool.query(`SELECT to_regclass('public.activity_logs') AS tbl, (SELECT COUNT(*) FROM activity_logs) AS cnt`);
  console.log('activity_logs exists:', !!r.rows[0].tbl, 'rows:', r.rows[0].cnt);
  await pool.end();
})();
