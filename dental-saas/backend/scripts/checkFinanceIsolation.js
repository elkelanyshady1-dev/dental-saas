require("module-alias/register");
/**
 * checkFinanceIsolation.js
 * v12.0 Sovereignty Enforcement Scanner
 * 
 * Enforces strict architectural separation between Platform Finance and Organization Finance.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '../src/modules/billingDomain');
const PLATFORM_DIR = path.join(BASE_DIR, 'platformFinance');
const ORG_DIR = path.join(BASE_DIR, 'organizationFinance');

let violations = 0;

function checkFile(filePath, sourceDomain, forbiddenPattern) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        if (line.includes('require') && line.includes(forbiddenPattern)) {
            console.error(`[VIOLATION] ${sourceDomain} file imports from ${forbiddenPattern}:`);
            console.error(`  File: ${filePath}:${index + 1}`);
            console.error(`  Line: ${line.trim()}`);
            violations++;
        }
    });
}

function walk(dir, sourceDomain, forbiddenPattern) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath, sourceDomain, forbiddenPattern);
        } else if (file.endsWith('.js')) {
            checkFile(fullPath, sourceDomain, forbiddenPattern);
        }
    });
}

console.log('--- Financial Sovereignty Isolation Scan ---');

console.log('Scanning Platform Finance for Org Finance imports...');
walk(PLATFORM_DIR, 'PlatformFinance', 'organizationFinance');

console.log('Scanning Org Finance for Platform Finance imports...');
walk(ORG_DIR, 'OrganizationFinance', 'platformFinance');

if (violations > 0) {
    console.error(`\n[FAILED] Found ${violations} sovereignty violations.`);
    process.exit(1);
} else {
    console.log('\n[PASSED] Financial Sovereignty maintained.');
    process.exit(0);
}
