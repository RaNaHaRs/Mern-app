const { spawn } = require('child_process');
const srv = spawn('node', ['src/index.js'], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '5000' }
});
srv.stdout.on('data', d => process.stdout.write(d.toString()));
srv.stderr.on('data', d => process.stderr.write(d.toString()));
setTimeout(() => {
  console.log('Server PID:', srv.pid);
  process.exit(0);
}, 30000);
