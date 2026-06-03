const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'recoverlab_crm',
  user: 'postgres',
  password: 'Harsh@2607'
});
(async () => {
  try {
    await pool.query(
      "INSERT INTO activity_logs(tenant_id,user_id,action,module,resource_type,title,description,ip_address) VALUES(null,null,'system_migration','system','migration','Activity Logs Activated','Activity logging system initialized on ' || NOW()::text,'127.0.0.1')"
    );
    console.log('Test log inserted');
    const r = await pool.query('SELECT COUNT(*) FROM activity_logs');
    console.log('Total logs:', r.rows[0].count);
  } catch (e) {
    console.error('Error:', e.message);
  }
  pool.end();
})();
