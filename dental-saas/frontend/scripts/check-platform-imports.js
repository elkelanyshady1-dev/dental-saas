/**
 * check-platform-imports.js
 * v11.1 Sovereign Governance — Structural Integrity Guard
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🛡️ Resolve correctly relative to script location
const PLATFORM_ROOT = path.resolve(__dirname, '../src/platform');
const FORBIDDEN_PATTERNS = [
    /from ['"]\.\.\/\.\.\/org/i,
    /from ['"]\.\.\/\.\.\/store/i,
    /from ['"]\.\.\/\.\.\/context/i,
    /from ['"]\.\.\/\.\.\/\.\.\/org/i,
];

let violations = 0;

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    FORBIDDEN_PATTERNS.forEach(pattern => {
        if (pattern.test(content)) {
            console.error(`❌ Sovereignty Violation: ${filePath} imports from forbidden directory.`);
            violations++;
        }
    });
}

function walk(dir) {
    if (!fs.existsSync(dir)) {
        console.error(`🚨 Error: Directory ${dir} does not exist.`);
        process.exit(1);
    }
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (/\.(js|jsx)$/.test(file)) {
            checkFile(fullPath);
        }
    });
}

console.log('🏛 Running Sovereign Governance Structural Integrity Check...');
walk(PLATFORM_ROOT);

if (violations > 0) {
    console.error(`\n🚨 FOUND ${violations} SOVEREIGNTY VIOLATIONS.`);
    process.exit(1);
} else {
    console.log('\n✅ Boundary Integrity Verified. No cross-layer leaks detected.');
    process.exit(0);
}
