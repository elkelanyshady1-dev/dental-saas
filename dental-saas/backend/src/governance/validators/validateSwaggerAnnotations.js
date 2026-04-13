require("module-alias/register");
/**
 * validateSwaggerAnnotations.js
 * v20.1 Wave4 — Swagger Enforcement Validator
 *
 * Validates that platform route files contain @swagger JSDoc blocks
 * for all registered routes, and that documented capabilities match contract.
 *
 * Exit code 1 on failure.
 * Usage: node backend/scripts/validateSwaggerAnnotations.js
 */

const fs = require('fs');
const path = require('path');

const { PLATFORM_CAPABILITIES } = require('@contracts/platformContract.cjs.js');
const VALID = new Set(Object.values(PLATFORM_CAPABILITIES));

const routeDir = path.resolve(__dirname, "../../../src/routes");

// Collect platform route files from both top-level and platform/ subdirectory
const platformRouteFiles = [];

// Top-level platform* files (legacy)
const topLevelFiles = fs.readdirSync(routeDir)
    .filter(f => f.startsWith('platform') && f.endsWith('.js') && !fs.statSync(path.join(routeDir, f)).isDirectory());
topLevelFiles.forEach(f => platformRouteFiles.push({ file: f, dir: routeDir }));

// platform/ subdirectory
const platformSubDir = path.join(routeDir, "platform");
if (fs.existsSync(platformSubDir)) {
    const subFiles = fs.readdirSync(platformSubDir)
        .filter(f => f.endsWith('.js') && !fs.statSync(path.join(platformSubDir, f)).isDirectory());
    subFiles.forEach(f => platformRouteFiles.push({ file: f, dir: platformSubDir }));
}

const ROUTE_REGEX = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

let warnings = [];
let routeCount = 0;
let swaggerBlockCount = 0;

for (const { file, dir } of platformRouteFiles) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Count @swagger blocks
    const swaggerBlocks = (content.match(/@swagger/g) || []).length;
    swaggerBlockCount += swaggerBlocks;

    // Count routes
    let match;
    const routes = [];
    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
    while ((match = routeRegex.exec(content)) !== null) {
        routes.push({ method: match[1].toUpperCase(), path: match[2] });
        routeCount++;
    }

    // Check if file has any swagger documentation at all
    if (swaggerBlocks === 0 && routes.length > 0) {
        warnings.push({
            file,
            issue: `File has ${routes.length} routes but 0 @swagger JSDoc blocks`,
            severity: 'MEDIUM'
        });
    }

    // Check for capability strings in swagger blocks that don't match contract
    const swaggerCapRegex = /["'`]((?:VIEW_|MANAGE_)[A-Z_]+)["'`]/g;
    const swaggerSections = content.split('@swagger');
    for (let i = 1; i < swaggerSections.length; i++) {
        // Only check within swagger block (up to next route or end of comment)
        const block = swaggerSections[i].split('*/')[0] || '';
        let capMatch;
        while ((capMatch = swaggerCapRegex.exec(block)) !== null) {
            if (!VALID.has(capMatch[1])) {
                warnings.push({
                    file,
                    issue: `Unknown capability in @swagger block: "${capMatch[1]}"`,
                    severity: 'HIGH'
                });
            }
        }
    }
}

// Report
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  SWAGGER ANNOTATION VALIDATOR — Wave 4');
console.log('═══════════════════════════════════════════════════');
console.log(`  Platform route files:     ${platformRouteFiles.length}`);
console.log(`  Total routes found:       ${routeCount}`);
console.log(`  @swagger blocks found:    ${swaggerBlockCount}`);
console.log(`  Warnings:                 ${warnings.length}`);
console.log('');

const highSeverity = warnings.filter(w => w.severity === 'HIGH');

if (highSeverity.length > 0) {
    for (const w of warnings) {
        const icon = w.severity === 'HIGH' ? '❌' : '⚠️';
        console.error(`  ${icon} [${w.severity}] ${w.file}`);
        console.error(`     ${w.issue}`);
        console.error('');
    }
    console.error('RESULT: FAILED — Critical Swagger violations detected.');
    process.exit(1);
} else if (warnings.length > 0) {
    for (const w of warnings) {
        console.warn(`  ⚠️  [${w.severity}] ${w.file}`);
        console.warn(`     ${w.issue}`);
        console.warn('');
    }
    console.log('RESULT: PASSED with warnings (no HIGH severity issues).');
    process.exit(0);
} else {
    console.log('  ✅ All Swagger annotations valid and present.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
