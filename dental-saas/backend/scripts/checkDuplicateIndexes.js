require("module-alias/register");
/**
 * checkDuplicateIndexes.js
 * Scans model files for field-level index declarations (index: true, unique: true, sparse: true)
 * which are forbidden by the constitutional v13.2 Index Governance Policy.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const FORBIDDEN_PATTERNS = [
    /\sindex:\s*true/,
    /\sunique:\s*true/,
    /\ssparse:\s*true/
];

let violations = 0;

function checkFile(filePath) {
    const fileName = path.basename(filePath);
    // Skip this script if it somehow gets caught
    if (fileName === 'checkDuplicateIndexes.js') return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let insideIndexCall = false;

    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // Track if we are inside a .index(...) call
        if (trimmed.includes('.index(')) {
            insideIndexCall = true;
        }

        // If we reach the end of the .index call (heuristic: ); )
        if (insideIndexCall && trimmed.includes(');')) {
            insideIndexCall = false;
            return;
        }

        // Skip comments and lines inside .index calls
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || insideIndexCall || trimmed.includes('.index(')) {
            return;
        }

        FORBIDDEN_PATTERNS.forEach(pattern => {
            if (pattern.test(line)) {
                console.error(`[VIOLATION] Field-level index flag found:`);
                console.error(`  File: ${filePath}:${index + 1}`);
                console.error(`  Line: ${trimmed}`);
                violations++;
            }
        });
    });
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.model.js')) {
            // Check if it's likely a model file
            if (fullPath.includes('models') || file.includes('.model.js')) {
                checkFile(fullPath);
            }
        }
    });
}

console.log('--- Mongoose Index Governance Scan ---');
walk(SRC_DIR);

if (violations > 0) {
    console.error(`\n[FAILED] Found ${violations} index governance violations.`);
    process.exit(1);
} else {
    console.log('\n[PASSED] Index governance maintained.');
    process.exit(0);
}
