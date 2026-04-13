const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outFile = path.join(__dirname, 'diag_output.txt');
let output = '';

try {
  output += 'Node: ' + process.version + '\n';
  output += 'CWD: ' + __dirname + '\n\n';
  
  // Check package.json
  const pkg = require('./package.json');
  output += 'Package: ' + pkg.name + ' v' + pkg.version + '\n';
  output += 'Dependencies: ' + Object.keys(pkg.dependencies).join(', ') + '\n\n';
  
  // Try tsc
  try {
    const tscResult = execSync('npx tsc --noEmit --skipLibCheck 2>&1', {
      cwd: __dirname,
      timeout: 60000,
      encoding: 'utf8'
    });
    output += 'TSC OUTPUT:\n' + (tscResult || '(no errors)') + '\n';
  } catch (tscErr) {
    output += 'TSC ERRORS:\n' + (tscErr.stdout || '') + '\n' + (tscErr.stderr || '') + '\n';
  }
  
} catch (err) {
  output += 'ERROR: ' + err.message + '\n';
}

fs.writeFileSync(outFile, output, 'utf8');
