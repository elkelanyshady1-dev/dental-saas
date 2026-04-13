const { execSync } = require('child_process');
try {
  const result = execSync('npx vite --port 3001', { 
    cwd: __dirname,
    timeout: 10000,
    stdio: 'pipe',
    encoding: 'utf8'
  });
  console.log('STDOUT:', result);
} catch (e) {
  console.log('STDOUT:', e.stdout);
  console.log('STDERR:', e.stderr);
  console.log('STATUS:', e.status);
}
