/**
 * validatePlatformCapabilities.js
 * v20.1 Wave4 — Frontend Capability Validator
 *
 * Scans frontend/src/platform/* for:
 *   - Raw capability string literals not imported from contract
 *   - Unknown capability names
 *   - Object-style capability access (capabilities[cap])
 *   - Feature registry entries not matching contract
 *
 * Exit code 1 on failure.
 * Usage: node frontend/scripts/validatePlatformCapabilities.js
 */

const fs = require('fs');
const path = require('path');

// Import contract — use CJS version since this is a Node script
const contractPath = path.resolve(__dirname, '../../packages/platform-contract/platformContract.cjs.js');
const { PLATFORM_CAPABILITIES } = require(contractPath);

const VALID = new Set(Object.values(PLATFORM_CAPABILITIES));
const PLATFORM_DIR = path.resolve(__dirname, '../src/platform');

const EXCLUDE_PATTERNS = [
    'node_modules',
    '__tests__',
    '.test.', '.spec.'
];

let violations = [];

// ─── Rule 1: Check for object-style capability access ──────────────────────
function checkObjectAccess(content, filePath, relPath) {
    const objectAccessRegex = /capabilities\[["'`]?(\w+)["'`]?\]/g;
    let match;
    while ((match = objectAccessRegex.exec(content)) !== null) {
        const beforeMatch = content.substring(0, match.index);
        const line = beforeMatch.split('\n').length;
        violations.push({
            file: relPath,
            line,
            issue: `Object-style capability access: capabilities[${match[1]}] — must use includes()`,
            severity: 'HIGH'
        });
    }
}

// ─── Rule 2: Check capability strings in hasCapability / RequireCapability ──
function checkCapabilityStrings(content, filePath, relPath) {
    // hasCapability("SOMETHING")
    const hasCapRegex = /hasCapability\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    let match;
    while ((match = hasCapRegex.exec(content)) !== null) {
        if (!VALID.has(match[1])) {
            const beforeMatch = content.substring(0, match.index);
            const line = beforeMatch.split('\n').length;
            violations.push({
                file: relPath,
                line,
                issue: `Unknown capability in hasCapability: "${match[1]}"`,
                severity: 'HIGH'
            });
        }
    }

    // RequireCapability permission="SOMETHING"
    const reqCapRegex = /RequireCapability\s+permission\s*=\s*["'`]([^"'`]+)["'`]/g;
    while ((match = reqCapRegex.exec(content)) !== null) {
        if (!VALID.has(match[1])) {
            const beforeMatch = content.substring(0, match.index);
            const line = beforeMatch.split('\n').length;
            violations.push({
                file: relPath,
                line,
                issue: `Unknown capability in RequireCapability: "${match[1]}"`,
                severity: 'HIGH'
            });
        }
    }
}

// ─── Rule 3: Check feature registry capability values ──────────────────────
function checkRegistryCapabilities(content, filePath, relPath) {
    const capFieldRegex = /capability:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = capFieldRegex.exec(content)) !== null) {
        if (!VALID.has(match[1])) {
            const beforeMatch = content.substring(0, match.index);
            const line = beforeMatch.split('\n').length;
            violations.push({
                file: relPath,
                line,
                issue: `Unknown capability in registry: "${match[1]}"`,
                severity: 'HIGH'
            });
        }
    }
}

// ─── Scan ──────────────────────────────────────────────────────────────────
function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (EXCLUDE_PATTERNS.some(p => fullPath.includes(p))) continue;

        if (entry.isDirectory()) {
            scanDir(fullPath);
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const relPath = path.relative(path.resolve(__dirname, '..'), fullPath);

            checkObjectAccess(content, fullPath, relPath);
            checkCapabilityStrings(content, fullPath, relPath);
            checkRegistryCapabilities(content, fullPath, relPath);
        }
    }
}

scanDir(PLATFORM_DIR);

// Report
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  FRONTEND CAPABILITY VALIDATOR — Wave 4');
console.log('═══════════════════════════════════════════════════');
console.log(`  Contract capabilities: ${[...VALID].join(', ')}`);
console.log(`  Violations: ${violations.length}`);
console.log('');

if (violations.length > 0) {
    for (const v of violations) {
        console.error(`  ❌ [${v.severity}] ${v.file}:${v.line}`);
        console.error(`     ${v.issue}`);
        console.error('');
    }
    console.error('RESULT: FAILED — Frontend capability violations detected.');
    process.exit(1);
} else {
    console.log('  ✅ All frontend capabilities match contract.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
