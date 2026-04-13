require("module-alias/register");
/**
 * extractControllerResponseShapes.js
 * Phase 17 — Controller Response Shape Extractor (Precision Upgrade)
 *
 * Statically analyzes platform controllers for res.json() calls.
 * Extracts top-level object keys from response shapes.
 *
 * Uses routeGraph.json to map handler names → controller files.
 *
 * Improvements over Phase 10:
 *   - Detects res.json(variable) as variable_response (not undetected)
 *   - Detects res.send() and res.status().end() as success responses
 *   - Handles asyncHandler() wrapper pattern for exports
 *   - Distinguishes partial_dynamic (spread + static keys) from full dynamic
 *   - Scans all .js files in controller dirs (not just platform-named)
 *
 * Output: scripts/controllerResponseShapes.json
 * Usage: node backend/scripts/extractControllerResponseShapes.js
 */

const fs = require('fs');
const path = require('path');

const GRAPH_FILE = path.resolve(__dirname, "../reports/routeGraph.json");
const OUTPUT_FILE = path.resolve(__dirname, "../reports/controllerResponseShapes.json");

// Controller directories to scan
const CONTROLLER_DIRS = [
    path.resolve(__dirname, "../../../src/controllers"),
    path.resolve(__dirname, "../../../src/platform/domain/controllers"),
    path.resolve(__dirname, "../../../src/platform/support/controllers"),
    path.resolve(__dirname, "../../../src/modules/billingDomain/controllers"),
];

// ─── Parse response shapes from a controller file ───────────────────────────
function extractResponseShapes(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const shapes = {};

    // Find exported function names (multiple patterns)
    const exportedFunctions = new Set();

    // Pattern 1: exports.foo = ...
    const exportsAssignRegex = /exports\.(\w+)\s*=/g;
    let match;
    while ((match = exportsAssignRegex.exec(content)) !== null) {
        exportedFunctions.add(match[1]);
    }

    // Pattern 2: module.exports = { foo, bar, baz: something }
    const moduleExportsRegex = /module\.exports\s*=\s*\{([^}]+)\}/g;
    while ((match = moduleExportsRegex.exec(content)) !== null) {
        match[1].split(',').forEach(fn => {
            const trimmed = fn.trim().split(':')[0].trim();
            if (trimmed) exportedFunctions.add(trimmed);
        });
    }

    // ─── Track current function context ─────────────────────────────────────
    // Patterns we need to match:
    //   exports.foo = async (req, res) => {
    //   exports.foo = asyncHandler(async (req, res) => {
    //   exports.foo = async function(req, res) {
    //   const foo = async (req, res) => {
    //   const foo = asyncHandler(async (req, res) => {
    const funcStartPatterns = [
        /exports\.(\w+)\s*=\s*(?:asyncHandler\s*\(\s*)?(?:async\s+)?(?:function\s*\w*\s*)?\(\s*req/,
        /const\s+(\w+)\s*=\s*(?:asyncHandler\s*\(\s*)?(?:async\s+)?(?:function\s*\w*\s*)?\(\s*req/,
    ];

    let currentFunction = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Track current function
        for (const pattern of funcStartPatterns) {
            const funcMatch = pattern.exec(line);
            if (funcMatch && funcMatch[1]) {
                currentFunction = funcMatch[1];
                break;
            }
        }

        // ─── Detect res.json({ ... }) with object literal ───────────────────
        const jsonObjMatch = /res(?:\.status\(\s*(\d+)\s*\))?\.json\(\s*\{/.exec(line);
        if (jsonObjMatch) {
            const statusCode = jsonObjMatch[1] ? parseInt(jsonObjMatch[1]) : 200;

            // Extract keys with nesting awareness
            let objectContent = '';
            let braceCount = 0;
            let started = false;

            for (let j = i; j < Math.min(i + 30, lines.length); j++) {
                const scanLine = lines[j];
                for (let k = 0; k < scanLine.length; k++) {
                    if (scanLine[k] === '{') {
                        if (!started) started = true;
                        braceCount++;
                    } else if (scanLine[k] === '}') {
                        braceCount--;
                        if (started && braceCount === 0) {
                            objectContent += scanLine.substring(0, k);
                            break;
                        }
                    }
                }
                if (started && braceCount === 0) break;
                if (started) objectContent += scanLine + '\n';
            }

            // ── Nesting-aware key extraction ──
            // Parse the object content tracking brace depth to separate
            // top-level keys from nested ones
            const topKeys = [];
            const nestedKeys = {}; // { parentKey: [childKey, ...] }
            const hasSpread = /\.\.\./.test(objectContent);
            let hasStaticKeys = false;

            const JS_KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'new',
                'const', 'let', 'var', 'if', 'else', 'return', 'await', 'try', 'catch', 'function']);

            // Split into lines and track depth
            const objLines = objectContent.split('\n');
            let depth = 0; // 0 = top-level of the res.json({...}) body
            let currentParentKey = null;

            for (const ol of objLines) {
                // Extract key BEFORE counting braces, so the key's depth is based
                // on braces from previous lines, not the current line's own braces
                const lineKeyMatch = /^\s*(\w+)\s*(?::|,|\s*$)/.exec(ol.trim());
                const opensObject = /:\s*\{/.test(ol);

                // Count closing braces BEFORE key position to handle "}" lines
                const keyPos = lineKeyMatch ? ol.indexOf(lineKeyMatch[1]) : ol.length;
                for (let ci = 0; ci < keyPos; ci++) {
                    if (ol[ci] === '{') depth++;
                    if (ol[ci] === '}') {
                        depth--;
                        if (depth <= 0) currentParentKey = null;
                    }
                }

                // Now process the key at current depth
                if (lineKeyMatch) {
                    const keyName = lineKeyMatch[1];
                    if (!JS_KEYWORDS.has(keyName)) {
                        if (depth <= 1) {
                            // Top-level key
                            topKeys.push(keyName);
                            hasStaticKeys = true;
                            if (opensObject) {
                                currentParentKey = keyName;
                                if (!nestedKeys[keyName]) nestedKeys[keyName] = [];
                            }
                        } else if (depth === 2 && currentParentKey) {
                            // Nested key inside a parent object
                            nestedKeys[currentParentKey].push(keyName);
                            hasStaticKeys = true;
                        }
                    }
                }

                // Count remaining braces AFTER key position
                for (let ci = keyPos; ci < ol.length; ci++) {
                    if (ol[ci] === '{') depth++;
                    if (ol[ci] === '}') {
                        depth--;
                        if (depth <= 0) currentParentKey = null;
                    }
                }
            }

            // Classify dynamic status
            let isDynamic = false;
            let isPartialDynamic = false;
            if (hasSpread) {
                if (hasStaticKeys) {
                    isPartialDynamic = true;
                } else {
                    isDynamic = true;
                }
            }

            const funcName = currentFunction || 'unknown';
            if (!shapes[funcName]) shapes[funcName] = [];

            shapes[funcName].push({
                status: statusCode,
                keys: [...new Set(topKeys)],
                nestedKeys: Object.keys(nestedKeys).length > 0 ? nestedKeys : undefined,
                isDynamic,
                isPartialDynamic,
                line: i + 1
            });
            continue;
        }

        // ─── Detect res.json(variable) — no object literal ──────────────────
        const jsonVarMatch = /res(?:\.status\(\s*(\d+)\s*\))?\.json\(\s*(\w+)\s*\)/.exec(line);
        if (jsonVarMatch) {
            const statusCode = jsonVarMatch[1] ? parseInt(jsonVarMatch[1]) : 200;
            const varName = jsonVarMatch[2];

            // Skip error responses
            if (statusCode >= 400) continue;

            const funcName = currentFunction || 'unknown';
            if (!shapes[funcName]) shapes[funcName] = [];

            shapes[funcName].push({
                status: statusCode,
                keys: [],
                isDynamic: false,
                isPartialDynamic: false,
                isVariableResponse: true,
                variableName: varName,
                line: i + 1
            });
            continue;
        }

        // ─── Detect res.send() / res.status().send() / res.status().end() ───
        const sendMatch = /res(?:\.status\(\s*(\d+)\s*\))?\.(?:send|end)\(/.exec(line);
        if (sendMatch) {
            const statusCode = sendMatch[1] ? parseInt(sendMatch[1]) : 200;
            if (statusCode >= 400) continue;

            const funcName = currentFunction || 'unknown';
            if (!shapes[funcName]) shapes[funcName] = [];

            shapes[funcName].push({
                status: statusCode,
                keys: [],
                isDynamic: false,
                isPartialDynamic: false,
                isSendResponse: true,
                line: i + 1
            });
            continue;
        }
    }

    return shapes;
}

// ─── Build handler → controller file mapping ────────────────────────────────
function buildHandlerMap() {
    const handlerMap = {};

    for (const dir of CONTROLLER_DIRS) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

        for (const file of files) {
            const filePath = path.join(dir, file);
            const content = fs.readFileSync(filePath, 'utf8');

            // Pattern 1: exports.foo = ...
            const exportRegex = /exports\.(\w+)\s*=/g;
            let match;
            while ((match = exportRegex.exec(content)) !== null) {
                handlerMap[match[1]] = {
                    file: path.relative(path.resolve(__dirname, "../../.."), filePath),
                    functionName: match[1]
                };
            }

            // Pattern 2: module.exports = { foo, bar }
            const modExportRegex = /module\.exports\s*=\s*\{([^}]+)\}/g;
            while ((match = modExportRegex.exec(content)) !== null) {
                match[1].split(',').forEach(fn => {
                    const name = fn.trim().split(':')[0].trim();
                    if (name && /^\w+$/.test(name)) {
                        handlerMap[name] = {
                            file: path.relative(path.resolve(__dirname, "../../.."), filePath),
                            functionName: name
                        };
                    }
                });
            }
        }
    }

    return handlerMap;
}

// ─── Main ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(GRAPH_FILE)) {
    console.error('ERROR: routeGraph.json not found. Run extractRouteGraph.js first.');
    process.exit(1);
}

const graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
const handlerMap = buildHandlerMap();

// Extract shapes from all controller files in all dirs
const allShapes = {};
const processedFiles = new Set();

for (const dir of CONTROLLER_DIRS) {
    if (!fs.existsSync(dir)) continue;
    // Scan ALL .js files — remove the restrictive platform-only filter
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

    for (const file of files) {
        const filePath = path.join(dir, file);
        if (processedFiles.has(filePath)) continue;
        processedFiles.add(filePath);

        const shapes = extractResponseShapes(filePath);
        const relPath = path.relative(path.resolve(__dirname, "../../.."), filePath);

        for (const [funcName, responses] of Object.entries(shapes)) {
            allShapes[`${relPath}:${funcName}`] = responses;
        }
    }
}

// ─── Route-file-aware import resolution ─────────────────────────────────────
// Parse require() statements in route files to map handlerName → controllerFile
function resolveRouteImports(routeFileName) {
    const ROUTES_DIR = path.resolve(__dirname, "../../../src/routes");
    const routeFilePath = path.join(ROUTES_DIR, routeFileName);
    if (!fs.existsSync(routeFilePath)) return {};

    const content = fs.readFileSync(routeFilePath, 'utf8');
    const importMap = {}; // handlerName → controllerRelPath

    // Pattern: const { foo, bar } = require("../controllers/somethingController");
    const destructureRegex = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = destructureRegex.exec(content)) !== null) {
        const names = m[1].split(',').map(n => n.trim().split(':')[0].trim()).filter(Boolean);
        const reqPath = m[2];
        // Resolve to a relative path from project root
        const resolvedPath = path.resolve(ROUTES_DIR, reqPath);
        const relPath = path.relative(path.resolve(__dirname, "../../.."), resolvedPath).replace(/\\/g, '/');
        // Ensure .js extension for matching
        const relPathJs = relPath.endsWith('.js') ? relPath : relPath + '.js';
        for (const name of names) {
            importMap[name] = relPathJs;
        }
    }

    // Pattern: const something = require("../controllers/somethingController");
    const singleRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = singleRegex.exec(content)) !== null) {
        const varName = m[1];
        const reqPath = m[2];
        // Skip middleware, config, etc.
        if (reqPath.includes('middleware') || reqPath.includes('config')) continue;
        const resolvedPath = path.resolve(ROUTES_DIR, reqPath);
        const relPath = path.relative(path.resolve(__dirname, "../../.."), resolvedPath).replace(/\\/g, '/');
        const relPathJs = relPath.endsWith('.js') ? relPath : relPath + '.js';
        importMap[`__module__:${varName}`] = relPathJs;
    }

    return importMap;
}

// Map routes to their response shapes (with controller-file awareness)
const routeShapes = {};
const platformRoutes = graph.routes.filter(r =>
    r.fullPath.startsWith('/api/platform') || r.fullPath.startsWith('/platform')
);

// Cache route file import maps
const routeImportCache = {};

for (const route of platformRoutes) {
    // Extract function name from handlerName (e.g., "planController.getAllPlans" → "getAllPlans")
    const handlerParts = route.handlerName.split('.');
    const funcName = handlerParts[handlerParts.length - 1];
    const modulePrefix = handlerParts.length > 1 ? handlerParts[0] : null;

    // Resolve import map for this route's file
    if (!routeImportCache[route.file]) {
        routeImportCache[route.file] = resolveRouteImports(route.file);
    }
    const importMap = routeImportCache[route.file];

    // Determine expected controller file from imports
    let expectedControllerFile = null;
    if (importMap[funcName]) {
        // Direct destructured import: const { globalSearch } = require("../controllers/platformController")
        expectedControllerFile = importMap[funcName];
    } else if (modulePrefix && importMap[`__module__:${modulePrefix}`]) {
        // Module-style import: const planController = require(...); planController.getAllPlans
        expectedControllerFile = importMap[`__module__:${modulePrefix}`];
    }

    // Find matching shape — prefer controller-file-scoped match
    let matchedShape = null;
    if (expectedControllerFile) {
        // Scoped match: only look in the correct controller file
        for (const [key, shapes] of Object.entries(allShapes)) {
            const normalizedKey = key.replace(/\\/g, '/');
            if (normalizedKey.endsWith(`:${funcName}`) && normalizedKey.startsWith(expectedControllerFile.replace(/\.js$/, ''))) {
                matchedShape = { controllerKey: key, responses: shapes };
                break;
            }
        }
    }

    // Fallback: unscoped match (for backward compat)
    if (!matchedShape) {
        for (const [key, shapes] of Object.entries(allShapes)) {
            if (key.endsWith(`:${funcName}`)) {
                matchedShape = { controllerKey: key, responses: shapes };
                break;
            }
        }
    }

    const routeKey = `${route.method} ${route.fullPath}`;
    routeShapes[routeKey] = {
        handlerName: route.handlerName,
        file: route.file,
        line: route.line,
        shape: matchedShape || { controllerKey: null, responses: [], unresolved: true }
    };
}

// ─── Write Output ───────────────────────────────────────────────────────────
const output = {
    generated: new Date().toISOString(),
    totalRoutes: Object.keys(routeShapes).length,
    resolvedHandlers: Object.values(routeShapes).filter(r => !r.shape.unresolved).length,
    unresolvedHandlers: Object.values(routeShapes).filter(r => r.shape.unresolved).length,
    routes: routeShapes
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  CONTROLLER RESPONSE SHAPE EXTRACTOR — Phase 17');
console.log('═══════════════════════════════════════════════════');
console.log(`  Controller dirs scanned:  ${CONTROLLER_DIRS.length}`);
console.log(`  Controller files parsed:  ${processedFiles.size}`);
console.log(`  Function shapes found:    ${Object.keys(allShapes).length}`);
console.log(`  Routes mapped:            ${output.totalRoutes}`);
console.log(`  Resolved handlers:        ${output.resolvedHandlers}`);
console.log(`  Unresolved handlers:      ${output.unresolvedHandlers}`);
console.log(`  Output:                   ${path.relative(process.cwd(), OUTPUT_FILE)}`);
console.log('');
console.log('RESULT: PASSED');
process.exit(0);
