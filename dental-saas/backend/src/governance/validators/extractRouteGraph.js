require("module-alias/register");
/**
 * extractRouteGraph.js
 * Phase 9 — Canonical Route Graph Extraction
 *
 * Parses app.js mount prefixes and all platform router files to build
 * a resolved route graph with full paths, methods, and middleware.
 *
 * Detects duplicate method + fullPath collisions.
 *
 * Outputs: scripts/routeGraph.json (generated)
 *
 * Usage: node backend/scripts/extractRouteGraph.js
 * Exit code 1 if duplicate routes detected.
 */

const fs = require('fs');
const path = require('path');

const APP_FILE = path.resolve(__dirname, "../../../app.js");
const ROUTES_DIR = path.resolve(__dirname, "../../../src/routes");
const OUTPUT_FILE = path.resolve(__dirname, "../reports/routeGraph.json");

// ─── Step 1: Parse app.js for mount prefixes ────────────────────────────────
function extractMountPrefixes(appContent) {
    const mounts = [];
    // Match: app.use("/api/platform...", someRoutes)  and  v1Router.use(...)
    const mountRegex = /(?:app|v1Router)\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;
    let match;
    while ((match = mountRegex.exec(appContent)) !== null) {
        mounts.push({
            prefix: match[1],
            routerVar: match[2]
        });
    }
    return mounts;
}

// ─── Step 2: Parse route files ──────────────────────────────────────────────
function extractRoutes(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const routes = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const routeMatch = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/i.exec(line);
        if (!routeMatch) continue;

        const method = routeMatch[1].toUpperCase();
        const routePath = routeMatch[2];

        // Extract middleware names from the line
        const middleware = [];
        if (/platformProtect/.test(line)) middleware.push('platformProtect');
        if (/superAdminOnly/.test(line)) middleware.push('superAdminOnly');

        // Check for authorizePlatformPermission
        const capMatch = /authorizePlatformPermission\s*\(\s*(?:CAP\.|PLATFORM_CAPABILITIES\.)?([A-Z_]+)\s*\)/g;
        let cm;
        while ((cm = capMatch.exec(line)) !== null) {
            middleware.push(`authorizePlatformPermission(${cm[1]})`);
        }

        // Check for spread middleware variables
        const spreadMatch = /\.\.\.(\w+)/g;
        let sm;
        while ((sm = spreadMatch.exec(line)) !== null) {
            middleware.push(`...${sm[1]}`);
        }

        // Extract handler name (last function argument)
        const handlerMatch = /,\s*(\w+(?:\.\w+)?)\s*\)/.exec(line);
        const handlerName = handlerMatch ? handlerMatch[1] : 'anonymous';

        routes.push({
            method,
            path: routePath,
            file: path.basename(filePath),
            line: i + 1,
            middleware,
            handlerName
        });
    }

    return routes;
}

// ─── Step 3: Resolve mount prefix → router file mapping ─────────────────────
function resolveRouterFileMapping(appContent) {
    // Match: const platformRoutes = require("./src/routes/platformRoutes")
    const requireRegex = /const\s+(\w+)\s*=\s*require\s*\(\s*["'`][^"'`]*\/routes\/([^"'`]+)["'`]\s*\)/g;
    const mapping = {};
    let match;
    while ((match = requireRegex.exec(appContent)) !== null) {
        const varName = match[1];
        const fileName = match[2].replace(/\.js$/, '') + '.js';
        mapping[varName] = fileName;
    }
    return mapping;
}

// ─── Main ───────────────────────────────────────────────────────────────────
const appContent = fs.readFileSync(APP_FILE, 'utf8');
const mounts = extractMountPrefixes(appContent);
const varToFile = resolveRouterFileMapping(appContent);

// Build resolved graph
const routeGraph = [];

// Collect platform route files from both top-level AND platform/ subdirectory
const platformRouteFiles = [];
const topLevel = fs.readdirSync(ROUTES_DIR)
    .filter(f => f.startsWith('platform') && f.endsWith('.js') && !fs.statSync(path.join(ROUTES_DIR, f)).isDirectory());
platformRouteFiles.push(...topLevel);

const platformSubDir = path.join(ROUTES_DIR, "platform");
if (fs.existsSync(platformSubDir)) {
    const subFiles = fs.readdirSync(platformSubDir)
        .filter(f => f.endsWith('.js') && !fs.statSync(path.join(platformSubDir, f)).isDirectory());
    platformRouteFiles.push(...subFiles.map(f => 'platform/' + f));
}

// For each mount, find matching router file and resolve full paths
for (const mount of mounts) {
    const routerFile = varToFile[mount.routerVar];
    if (!routerFile) continue;

    // Only process platform route files
    if (!routerFile.startsWith('platform')) continue;

    // Resolve file path — handle directory imports (platform.js → platform/index.js)
    let filePath = path.join(ROUTES_DIR, routerFile);
    if (!fs.existsSync(filePath)) {
        // Try as directory with index.js
        const dirPath = filePath.replace(/\.js$/, '');
        const indexPath = path.join(dirPath, 'index.js');
        if (fs.existsSync(indexPath)) {
            filePath = indexPath;
        } else {
            continue;
        }
    }

    const routes = extractRoutes(filePath);
    for (const route of routes) {
        // Resolve full path = mount prefix + route path
        let fullPath = mount.prefix + route.path;
        // Normalize double slashes
        fullPath = fullPath.replace(/\/+/g, '/');

        routeGraph.push({
            method: route.method,
            fullPath,
            routePath: route.path,
            mountPrefix: mount.prefix,
            file: route.file,
            line: route.line,
            middleware: route.middleware,
            handlerName: route.handlerName
        });
    }

    // If this is an index.js, also scan the sub-router files it imports
    if (path.basename(filePath) === 'index.js') {
        const indexContent = fs.readFileSync(filePath, 'utf8');
        const subRequireRegex = /require\s*\(\s*["'`]\.\/([^"'`]+)["'`]\s*\)/g;
        let subMatch;
        while ((subMatch = subRequireRegex.exec(indexContent)) !== null) {
            const subFile = subMatch[1].replace(/\.js$/, '') + '.js';
            const subFilePath = path.join(path.dirname(filePath), subFile);
            if (!fs.existsSync(subFilePath)) continue;

            const subRoutes = extractRoutes(subFilePath);
            for (const route of subRoutes) {
                let fullPath = mount.prefix + route.path;
                fullPath = fullPath.replace(/\/+/g, '/');

                // Avoid duplicates
                const exists = routeGraph.some(r => r.method === route.method && r.fullPath === fullPath);
                if (!exists) {
                    routeGraph.push({
                        method: route.method,
                        fullPath,
                        routePath: route.path,
                        mountPrefix: mount.prefix,
                        file: route.file,
                        line: route.line,
                        middleware: route.middleware,
                        handlerName: route.handlerName
                    });
                }
            }
        }
    }
}

// Also scan /api/v1/platform mounts (v1Router)
for (const mount of mounts) {
    const routerFile = varToFile[mount.routerVar];
    if (!routerFile) continue;
    if (!routerFile.startsWith('platform')) continue;

    // v1Router mounts use /api/v1 prefix
    if (!mount.prefix.startsWith('/platform')) continue;

    const filePath = path.join(ROUTES_DIR, routerFile);
    if (!fs.existsSync(filePath)) continue;

    const routes = extractRoutes(filePath);
    for (const route of routes) {
        let fullPath = '/api/v1' + mount.prefix + route.path;
        fullPath = fullPath.replace(/\/+/g, '/');

        // Check if already exists (from direct mount)
        const exists = routeGraph.some(r =>
            r.method === route.method && r.fullPath === fullPath
        );
        if (!exists) {
            routeGraph.push({
                method: route.method,
                fullPath,
                routePath: route.path,
                mountPrefix: '/api/v1' + mount.prefix,
                file: route.file,
                line: route.line,
                middleware: route.middleware,
                handlerName: route.handlerName
            });
        }
    }
}

// ─── Duplicate Detection ────────────────────────────────────────────────────
const seen = new Map();
const duplicates = [];

for (const route of routeGraph) {
    const key = `${route.method} ${route.fullPath}`;
    if (seen.has(key)) {
        duplicates.push({
            key,
            first: seen.get(key),
            second: `${route.file}:${route.line}`
        });
    } else {
        seen.set(key, `${route.file}:${route.line}`);
    }
}

// ─── Write Output ───────────────────────────────────────────────────────────
const output = {
    generated: new Date().toISOString(),
    totalRoutes: routeGraph.length,
    duplicates: duplicates.length,
    routes: routeGraph
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  ROUTE GRAPH EXTRACTOR — Phase 9');
console.log('═══════════════════════════════════════════════════');
console.log(`  Total routes:     ${routeGraph.length}`);
console.log(`  Platform files:   ${platformRouteFiles.length}`);
console.log(`  Mount prefixes:   ${mounts.filter(m => m.prefix.includes('platform')).length}`);
console.log(`  Duplicates:       ${duplicates.length}`);
console.log(`  Output:           ${path.relative(process.cwd(), OUTPUT_FILE)}`);
console.log('');

if (duplicates.length > 0) {
    for (const d of duplicates) {
        console.error(`  ❌ DUPLICATE: ${d.key}`);
        console.error(`     First:  ${d.first}`);
        console.error(`     Second: ${d.second}`);
        console.error('');
    }
    console.error('RESULT: FAILED — Duplicate route definitions detected.');
    process.exit(1);
} else {
    console.log('  ✅ No duplicate routes detected.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
