require("module-alias/register");
/**
 * checkBrokenRelativeImports.js
 * v14.1 Import Hardening — Static Guard
 * 
 * Scans src/ for relative require() paths and verifies file existence.
 */
const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(process.cwd(), 'src');

function scanDir(dir) {
    let violations = 0;
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            violations += scanDir(fullPath);
        } else if (file.endsWith('.js')) {
            violations += checkFileImports(fullPath);
        }
    });

    return violations;
}

function checkFileImports(filePath) {
    let fileViolations = 0;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        // Matches require('./...') or require('../...')
        const match = line.match(/require\(['"](\.\.?\/[^'"]+)['"]\)/);
        if (match) {
            const relativePath = match[1];
            const dir = path.dirname(filePath);

            // Resolve path (handling both .js and directory index)
            let resolvedPath = path.resolve(dir, relativePath);
            let exists = fs.existsSync(resolvedPath) || fs.existsSync(resolvedPath + '.js');

            if (!exists) {
                console.error(`[BROKEN IMPORT] ${path.relative(process.cwd(), filePath)}:${index + 1}`);
                console.error(`  -> Cannot find: ${relativePath}`);
                fileViolations++;
            }
        }
    });

    return fileViolations;
}

console.log("Starting Backend Relative Import Scan...");
const totalViolations = scanDir(TARGET_DIR);

if (totalViolations > 0) {
    console.error(`\nFound ${totalViolations} broken relative imports.`);
    process.exit(1);
} else {
    console.log("All relative imports verified.");
    process.exit(0);
}
