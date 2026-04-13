require("module-alias/register");
/**
 * validateSwaggerDrift.js
 * Phase 9 — Swagger Drift Detector
 *
 * Compares @swagger JSDoc blocks in platform route files against
 * the actual route definitions to detect:
 *
 *   A) Routes in code but NOT documented (undocumented)
 *   B) Swagger paths documented but not matching any route (orphans)
 *   C) Legacy /core namespace references in Swagger blocks
 *
 * Relies on routeGraph.json from extractRouteGraph.js.
 *
 * Usage: node backend/scripts/validateSwaggerDrift.js
 * Exit code 1 on critical drift.
 */

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.resolve(__dirname, "../../../src/routes");
const GRAPH_FILE = path.resolve(__dirname, "../reports/routeGraph.json");

// ─── Load route graph ───────────────────────────────────────────────────────
if (!fs.existsSync(GRAPH_FILE)) {
    console.error('ERROR: routeGraph.json not found. Run extractRouteGraph.js first.');
    process.exit(1);
}

const graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));

// ─── Extract Swagger paths from @swagger JSDoc blocks ───────────────────────
function extractSwaggerPaths(dir) {
    const documented = [];

    // 1. Scan top-level platform* files (legacy)
    const topLevelFiles = fs.readdirSync(dir)
        .filter(f => f.startsWith('platform') && f.endsWith('.js') && !fs.statSync(path.join(dir, f)).isDirectory());

    // 2. Scan all files in platform/ subdirectory
    const platformSubDir = path.join(dir, "platform");
    const subDirFiles = fs.existsSync(platformSubDir)
        ? fs.readdirSync(platformSubDir).filter(f => f.endsWith('.js') && !fs.statSync(path.join(platformSubDir, f)).isDirectory())
        : [];

    // Build combined list with directory info
    const filesToScan = [
        ...topLevelFiles.map(f => ({ file: f, dir: dir })),
        ...subDirFiles.map(f => ({ file: f, dir: platformSubDir }))
    ];

    for (const { file, dir: scanDir } of filesToScan) {
        const content = fs.readFileSync(path.join(scanDir, file), 'utf8');

        // Match @swagger blocks — extract paths and methods
        const swaggerBlocks = content.split('@swagger');

        for (let i = 1; i < swaggerBlocks.length; i++) {
            const block = swaggerBlocks[i].split('*/')[0] || '';

            // Extract path: /api/platform/something:
            const pathMatch = /\*\s+(\/api\/\S+?):/m.exec(block);
            if (!pathMatch) continue;

            const swaggerPath = pathMatch[1].replace(/\{(\w+)\}/g, ':$1'); // Convert {id} to :id

            // Extract method
            const methodMatch = /\*\s+(get|post|put|patch|delete):/mi.exec(block);
            if (!methodMatch) continue;

            documented.push({
                method: methodMatch[1].toUpperCase(),
                path: swaggerPath,
                file
            });
        }
    }

    return documented;
}

// ─── Comparison ─────────────────────────────────────────────────────────────
const swaggerPaths = extractSwaggerPaths(ROUTES_DIR);

// Filter graph to only /api/platform/* routes (direct mounts, not v1)
const platformRoutes = graph.routes.filter(r =>
    r.fullPath.startsWith('/api/platform') &&
    !r.fullPath.startsWith('/api/v1')
);

// A) Undocumented routes — in code but not in swagger
const undocumented = [];
for (const route of platformRoutes) {
    const found = swaggerPaths.some(s =>
        s.method === route.method && s.path === route.fullPath
    );
    if (!found) {
        undocumented.push({
            method: route.method,
            path: route.fullPath,
            file: route.file,
            line: route.line
        });
    }
}

// B) Orphan swagger paths — documented but not in code
const orphans = [];
for (const swagger of swaggerPaths) {
    const found = platformRoutes.some(r =>
        r.method === swagger.method && r.fullPath === swagger.path
    );
    if (!found) {
        orphans.push({
            method: swagger.method,
            path: swagger.path,
            file: swagger.file
        });
    }
}

// C) Legacy /core references in swagger blocks
const legacyRefs = [];
const legacyTopFiles = fs.readdirSync(ROUTES_DIR)
    .filter(f => f.startsWith('platform') && f.endsWith('.js') && !fs.statSync(path.join(ROUTES_DIR, f)).isDirectory());
const legacyPlatformDir = path.join(ROUTES_DIR, "platform");
const legacySubFiles = fs.existsSync(legacyPlatformDir)
    ? fs.readdirSync(legacyPlatformDir).filter(f => f.endsWith('.js') && !fs.statSync(path.join(legacyPlatformDir, f)).isDirectory())
    : [];

const allLegacyFiles = [
    ...legacyTopFiles.map(f => ({ file: f, dir: ROUTES_DIR })),
    ...legacySubFiles.map(f => ({ file: f, dir: legacyPlatformDir }))
];

for (const { file, dir } of allLegacyFiles) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const sections = content.split('@swagger');
    for (let i = 1; i < sections.length; i++) {
        const block = sections[i].split('*/')[0] || '';
        if (block.includes('/api/platform/core')) {
            legacyRefs.push({ file, issue: 'Legacy /core path in @swagger block' });
        }
    }
}

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  SWAGGER DRIFT DETECTOR — Phase 9');
console.log('═══════════════════════════════════════════════════');
console.log(`  Platform routes (code):     ${platformRoutes.length}`);
console.log(`  Swagger-documented paths:   ${swaggerPaths.length}`);
console.log(`  Undocumented routes:        ${undocumented.length}`);
console.log(`  Orphan Swagger paths:       ${orphans.length}`);
console.log(`  Legacy /core references:    ${legacyRefs.length}`);
console.log('');

let hasCritical = false;

if (orphans.length > 0) {
    hasCritical = true;
    console.error('  ❌ ORPHAN SWAGGER PATHS (documented but no matching route):');
    for (const o of orphans) {
        console.error(`     ${o.method} ${o.path} — in ${o.file}`);
    }
    console.error('');
}

if (legacyRefs.length > 0) {
    hasCritical = true;
    console.error('  ❌ LEGACY /core IN SWAGGER:');
    for (const l of legacyRefs) {
        console.error(`     ${l.file}: ${l.issue}`);
    }
    console.error('');
}

if (undocumented.length > 0) {
    console.warn('  ⚠️  UNDOCUMENTED ROUTES (in code but no @swagger block):');
    for (const u of undocumented) {
        console.warn(`     ${u.method} ${u.path} — ${u.file}:${u.line}`);
    }
    console.warn('');
}

if (hasCritical) {
    console.error('RESULT: FAILED — Critical Swagger drift detected.');
    process.exit(1);
} else if (undocumented.length > 0) {
    console.log('RESULT: PASSED with warnings (undocumented routes exist).');
    process.exit(0);
} else {
    console.log('  ✅ No Swagger drift detected.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
