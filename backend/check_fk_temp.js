const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:dhari@2006@localhost:5432/recoverlab_crm' });
(async () => {
  const r = await pool.query(`
    SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'users' AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
  `);
  console.log('UNIQUE/PRIMARY KEY constraints on users:');
  console.table(r.rows);

  const r2 = await pool.query(`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position
  `);
  console.log('Columns on users:');
  console.table(r2.rows);

  const r3 = await pool.query("SELECT to_regclass('public.activity_logs') AS tbl");
  console.log('activity_logs exists:', !!r3.rows[0].tbl);

  const r4 = await pool.query("SELECT to_regclass('public.sa_tenants') AS tbl");
  console.log('sa_tenants exists:', !!r4.rows[0].tbl);

  if (r4.rows[0].tbl) {
    const r5 = await pool.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'sa_tenants' ORDER BY ordinal_position
    `);
    console.log('Columns on sa_tenants:');
    console.table(r5.rows);
  }

  await pool.end();
})();
