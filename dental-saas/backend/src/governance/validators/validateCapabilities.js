require("module-alias/register");
/**
 * validateCapabilities.js
 * v20.1 Wave4 — Phantom Capability Detector
 *
 * Scans the entire platform codebase for MANAGE_* and VIEW_* string literals.
 * Compares each against the canonical PLATFORM_CAPABILITIES contract.
 * Fails CI if any unknown capability string is found.
 *
 * Exit code 1 on failure.
 * Usage: node backend/scripts/validateCapabilities.js
 */

const fs = require('fs');
const path = require('path');

const { PLATFORM_CAPABILITIES } = require('@contracts/platformContract.cjs.js');

const VALID = new Set(Object.values(PLATFORM_CAPABILITIES));

// Directories to scan
const SCAN_DIRS = [
    path.resolve(__dirname, "../../../src"),
    path.resolve(__dirname, "../../../../frontend/src/platform")
];

// Files/dirs to exclude
const EXCLUDE_PATTERNS = [
    'node_modules',
    'platformContract.js',
    'platformContract.cjs.js',
    'platform-contract.json',
    'platformCapability.js',           // type definition
    'validateCapabilities.js',         // this script
    'validatePlatformCapabilities.js', // frontend validator
    'validatePlatformCapabilities.cjs',// frontend validator (CJS)
    'validatePlatformRoutes.js',       // route validator
    'platformRoleMatrix.test.js',      // snapshot test
    'roleMatrixSnapshot.json',         // snapshot file
    '.test.', '.spec.',
    'swagger.js',                      // swagger schema examples
    '.d.ts',                           // type declarations (generated)
    'generated'                        // generated API clients
];

const CAPABILITY_REGEX = /["'`]((?:VIEW_|MANAGE_)[A-Z_]+)["'`]/g;

function scanDir(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (EXCLUDE_PATTERNS.some(p => fullPath.includes(p))) continue;

        if (entry.isDirectory()) {
            results.push(...scanDir(fullPath));
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            let match;

            while ((match = CAPABILITY_REGEX.exec(content)) !== null) {
                const cap = match[1];
                if (!VALID.has(cap)) {
                    // Find line number
                    const beforeMatch = content.substring(0, match.index);
                    const lineNumber = beforeMatch.split('\n').length;

                    results.push({
                        file: path.relative(path.resolve(__dirname, "../../.."), fullPath),
                        line: lineNumber,
                        capability: cap
                    });
                }
            }
        }
    }

    return results;
}

// Run scan
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  PHANTOM CAPABILITY DETECTOR — Wave 4');
console.log('═══════════════════════════════════════════════════');
console.log(`  Valid capabilities: ${[...VALID].join(', ')}`);
console.log('');

let allPhantoms = [];

for (const dir of SCAN_DIRS) {
    const phantoms = scanDir(dir);
    allPhantoms.push(...phantoms);
}

console.log(`  Files scanned in: ${SCAN_DIRS.length} directories`);
console.log(`  Phantom capabilities found: ${allPhantoms.length}`);
console.log('');

if (allPhantoms.length > 0) {
    for (const p of allPhantoms) {
        console.error(`  ❌ ${p.file}:${p.line}`);
        console.error(`     Unknown capability: "${p.capability}"`);
        console.error('');
    }
    console.error('RESULT: FAILED — Phantom capabilities detected.');
    process.exit(1);
} else {
    console.log('  ✅ No phantom capabilities found. All strings match contract.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
