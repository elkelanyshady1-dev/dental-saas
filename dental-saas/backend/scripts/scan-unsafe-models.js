/**
 * scan-unsafe-models.js
 *
 * Scan backend/src for unsafe model access patterns.
 *
 * A caller is "unsafe" iff:
 *   (a) It requires a model file that exports { modelName, schema, default }
 *       (the new per-connection definition pattern), AND
 *   (b) It dereferences the require() result as a Mongoose model — calling
 *       .findOne / .find / .create / .updateOne / etc. directly on it, AND
 *   (c) It does NOT pass the require() result through getModel(conn, def)
 *       and does NOT access .default.
 *
 * Usage: node scripts/scan-unsafe-models.js
 * Exit code 0 = clean, 1 = violations found (suitable for CI).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../src');
const MODEL_METHODS = [
    'findOne', 'find', 'create', 'updateOne', 'updateMany',
    'deleteOne', 'deleteMany', 'findById', 'findOneAndUpdate',
    'findByIdAndUpdate', 'findOneAndDelete', 'findByIdAndDelete',
    'aggregate', 'countDocuments', 'insertMany', 'bulkWrite',
    'distinct', 'exists', 'replaceOne', 'estimatedDocumentCount',
];

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Step 1: collect model files that export the new {modelName, schema, default} pattern.
const defPattern = /module\.exports\s*=\s*\{[\s\S]*?modelName[\s\S]*?schema[\s\S]*?default[\s\S]*?\}/m;
const defBasenames = new Map();

function walkModels(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            walkModels(full);
        } else if (entry.name.endsWith('.js')) {
            const content = fs.readFileSync(full, 'utf8');
            if (defPattern.test(content)) {
                defBasenames.set(path.basename(full, '.js'), full);
            }
        }
    }
}

// Step 2: scan every JS file for unsafe require + method calls.
// We capture whether the require is immediately dereferenced via `.default`
// on the declaration line (e.g. `const X = require('./x.model').default;`).
// That form binds the var to the mongoose model, which IS safe (legacy but
// functional) — global mongoose connection only.
const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]+?\.model)['"]\)(\s*\.\s*default)?/g;
const violations = [];

function scanCaller(file) {
    const content = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = requireRe.exec(content)) !== null) {
        const varName = m[1];
        const reqPath = m[2];
        const requireDotDefault = !!m[3];
        const basename = path.basename(reqPath);
        if (!defBasenames.has(basename)) continue;

        // require('...').default → var IS the bound mongoose model. Safe (platform-plane).
        if (requireDotDefault) continue;

        // getModel(..., varName) → safe (per-connection, preferred pattern).
        const getModelRe = new RegExp('getModel\\([^)]*,\\s*' + escapeRegex(varName) + '\\)');
        if (getModelRe.test(content)) continue;

        // varName.default.method(...) → legacy but functional.
        const usesDefaultRe = new RegExp('\\b' + escapeRegex(varName) + '\\.default\\s*\\.');
        const usesDefault = usesDefaultRe.test(content);
        if (usesDefault) continue;

        const methodsHit = [];
        for (const method of MODEL_METHODS) {
            const re = new RegExp('\\b' + escapeRegex(varName) + '\\.' + method + '\\s*\\(');
            if (re.test(content)) methodsHit.push(method);
        }
        if (methodsHit.length > 0) {
            violations.push({
                file: path.relative(ROOT, file),
                var: varName,
                reqPath,
                methods: methodsHit,
            });
        }
    }
}

function walkAll(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            walkAll(full);
        } else if (entry.name.endsWith('.js')) {
            scanCaller(full);
        }
    }
}

walkModels(ROOT);
walkAll(ROOT);

// Dedupe per (file, var).
const unique = new Map();
for (const v of violations) {
    const key = v.file + ':' + v.var;
    if (!unique.has(key)) unique.set(key, v);
}

const list = Array.from(unique.values());
console.log('Model-def files scanned:', defBasenames.size);
console.log('Unsafe call sites:', list.length);

if (list.length === 0) {
    console.log('\nOK — no unsafe model access.');
    process.exit(0);
}

const byModule = {};
for (const v of list) {
    const mod = v.file.split(path.sep).slice(0, 3).join('/');
    (byModule[mod] = byModule[mod] || []).push(v);
}
for (const mod of Object.keys(byModule).sort()) {
    console.log('\n== ' + mod + ' (' + byModule[mod].length + ') ==');
    for (const v of byModule[mod]) {
        console.log('  ' + v.file + '  var=' + v.var + '  methods=' + v.methods.join(',') + (v.usesDefault ? '  (uses .default elsewhere)' : ''));
    }
}

process.exit(1);
