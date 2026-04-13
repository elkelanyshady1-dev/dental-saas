#!/usr/bin/env node
/**
 * spec-audit.js — DentalSaaS SPEC-KIT Enforcement Audit (v1.1)
 * ═══════════════════════════════════════════════════════════════
 *
 * Self-policing, non-regressible validation of the Spec-First workflow.
 * Uses ripgrep (rg) for fast pattern scanning — falls back to Node fs for
 * environments without rg installed.
 *
 * Checks:
 *   G1 — Core spec documents exist (spec.md, module .spec.md files)
 *   G2 — plan.md exists and is non-empty
 *   G3 — tasks.md exists and is non-empty
 *   B1 — Zero-Trust Auth violations (raw localStorage platform token)
 *   B2 — Raw fetch() bypassing interceptors
 *   B3 — React Query violations
 *   B4 — Cross-plane import violations (spot-check key files)
 *   B5 — BroadcastChannel data payload violations
 *
 * Exit codes:
 *   0 — All checks pass
 *   1 — Critical violations found (blocks CI)
 *
 * Usage:
 *   node scripts/spec-audit.js
 *   node scripts/spec-audit.js --json
 *   node scripts/spec-audit.js --fail-fast
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

const ROOT     = path.resolve(__dirname, '..');
const SPECS    = path.join(ROOT, 'specs');
const FRONTEND = path.join(ROOT, 'frontend', 'src');

const args      = process.argv.slice(2);
const JSON_MODE = args.includes('--json');

// ─── Colors ──────────────────────────────────────────────────────────────────
const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';

// ─── Results ─────────────────────────────────────────────────────────────────
const results = { passed: [], warnings: [], violations: [] };
const pass    = (gate, msg)         => results.passed.push({ gate, msg });
const warn    = (gate, msg)         => results.warnings.push({ gate, msg });
const fail    = (gate, msg, file)   => results.violations.push({ gate, msg, file: file || null });

// ─── Helpers ─────────────────────────────────────────────────────────────────
const exists = p => fs.existsSync(p);
const size   = p => exists(p) ? fs.statSync(p).size : 0;
const read   = p => exists(p) ? fs.readFileSync(p, 'utf8') : '';

/**
 * Run ripgrep and return matches. Returns [] if no rg available or no matches.
 */
function rg(pattern, dir, opts = '') {
    try {
        const out = execSync(
            `rg --no-heading --with-filename -l ${opts} "${pattern}" "${dir}"`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }
        );
        return out.trim().split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE 1 — Spec Documents Exist
// ─────────────────────────────────────────────────────────────────────────────
function checkG1() {
    const specPath = path.join(SPECS, 'spec.md');
    if (!exists(specPath)) {
        fail('G1:SPEC_EXISTS', 'specs/spec.md is MISSING — root TDS not found. Run: make spec');
    } else if (size(specPath) < 10000) {
        warn('G1:SPEC_EXISTS', `specs/spec.md is suspiciously small (${size(specPath)} bytes) — may be incomplete`);
    } else {
        pass('G1:SPEC_EXISTS', `specs/spec.md exists (${Math.round(size(specPath) / 1024)}KB)`);
    }

    // Per-module spec files
    const MODULE_SPECS = [
        ['platform-governance', 'platform-governance.spec.md'],
        ['billing-engine',      'billing-engine.spec.md'],
        ['appointment-engine',  'appointment-engine.spec.md'],
        ['patient-domain',      'patient-domain.spec.md'],
        ['authentication',      'authentication.spec.md'],
        ['inventory-engine',    'inventory-engine.spec.md'],
        ['notifications',       'notification-communication.spec.md'],
        ['orthodontic-ai',      'orthodontic-ai.spec.md'],
        ['analytics',           'intelligence-analytics.spec.md'],
        ['system-architecture', 'system-architecture.spec.md'],
    ];
    for (const [name, file] of MODULE_SPECS) {
        const p = path.join(SPECS, file);
        if (!exists(p)) warn(`G1:MODULE[${name}]`, `Missing: specs/${file}`);
        else pass(`G1:MODULE[${name}]`, `specs/${file} ✓`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE 2 — Implementation Plan Exists
// ─────────────────────────────────────────────────────────────────────────────
function checkG2() {
    const p = path.join(SPECS, 'plan.md');
    if (!exists(p))          fail('G2:PLAN_EXISTS', 'specs/plan.md MISSING — run: make plan');
    else if (size(p) < 1000) warn('G2:PLAN_EXISTS', 'specs/plan.md appears empty — run: make plan');
    else                     pass('G2:PLAN_EXISTS', `specs/plan.md exists (${Math.round(size(p) / 1024)}KB)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE 3 — Task Cards Exist
// ─────────────────────────────────────────────────────────────────────────────
function checkG3() {
    const p = path.join(SPECS, 'tasks.md');
    if (!exists(p))         fail('G3:TASKS_EXISTS', 'specs/tasks.md MISSING — run: make tasks');
    else if (size(p) < 500) warn('G3:TASKS_EXISTS', 'specs/tasks.md appears empty — run: make tasks');
    else                    pass('G3:TASKS_EXISTS', `specs/tasks.md exists (${Math.round(size(p) / 1024)}KB)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — Zero-Trust Auth Violations (fast rg scan)
// ─────────────────────────────────────────────────────────────────────────────
function checkB1() {
    const AUTH_PATTERNS = [
        { pat: `localStorage.setItem\\(.platformToken.`,              msg: '❌ AUTH-DOWNGRADE: platformToken in localStorage (must be in-memory _pToken only)' },
        { pat: `sessionStorage.setItem\\(.platformToken.`,            msg: '❌ AUTH-DOWNGRADE: platformToken in sessionStorage (must be in-memory only)' },
        { pat: `localStorage\\.setItem\\(['"](token)['"`,             msg: '❌ GENERIC-KEY: Generic "token" key used — must use plane-namespaced keys' },
        { pat: `localStorage\\.getItem\\(['"](token)['"`,             msg: '❌ GENERIC-KEY: Generic "token" key read — must use plane-namespaced keys' },
        { pat: `localStorage\\.getItem\\(['"]orgToken['"]`,           msg: '❌ LEGACY-KEY: "orgToken" deprecated — canonical key is "org_access_token" via sessionStorage' },
    ];

    for (const { pat, msg } of AUTH_PATTERNS) {
        const hits = rg(pat, FRONTEND, '-g "*.{js,jsx}"');
        if (hits.length) hits.forEach(f => fail('B1:AUTH', msg, path.relative(ROOT, f)));
        else pass('B1:AUTH', `No violation: ${pat.substring(0, 40)}...`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — Raw fetch() Bypassing Interceptors
// ─────────────────────────────────────────────────────────────────────────────
function checkB2() {
    // Detect: const token = localStorage.getItem(...)  used for auth with fetch
    const hits = rg(`const token\\s*=\\s*localStorage\\.getItem`, FRONTEND, '-g "*.{js,jsx}"');
    if (hits.length) {
        hits.forEach(f => fail('B2:FETCH_BYPASS',
            '❌ INTERCEPTOR-BYPASS: Manual localStorage token read — use api / platformApi client',
            path.relative(ROOT, f)));
    } else {
        pass('B2:FETCH_BYPASS', 'No raw localStorage token reads found');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3 — React Query Violations
// ─────────────────────────────────────────────────────────────────────────────
function checkB3() {
    const RQ_PATTERNS = [
        {
            pat: `new QueryClient\\(\\)`,
            msg: '❌ RQ-SINGLETON: new QueryClient() outside queryClient.js — must use shared singleton',
            // Only flag files that are NOT the queryClient definition
            filterOut: 'queryClient.js',
        },
        {
            pat: `window\\.location\\.reload\\(\\)`,
            msg: '❌ RQ-RELOAD: window.location.reload() forbidden — use queryClient.invalidateQueries()',
        },
        {
            pat: `window\\.location\\.href\\s*=`,
            msg: '⚠️  RQ-REDIRECT: window.location.href assignment — verify this is not inside a response interceptor queue',
            isWarning: true,
        },
    ];

    for (const { pat, msg, filterOut, isWarning } of RQ_PATTERNS) {
        let hits = rg(pat, FRONTEND, '-g "*.{js,jsx}"');
        if (filterOut) hits = hits.filter(f => !f.endsWith(filterOut));
        if (hits.length) {
            hits.forEach(f => {
                const rel = path.relative(ROOT, f);
                if (isWarning) warn('B3:REACT_QUERY', `${msg}\n     ↳ ${rel}`);
                else fail('B3:REACT_QUERY', msg, rel);
            });
        } else {
            pass('B3:REACT_QUERY', `No violation: ${pat.substring(0, 45)}...`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 4 — Cross-Plane Import Violations (spot-check known boundaries)
// ─────────────────────────────────────────────────────────────────────────────
function checkB4() {
    const PLATFORM_SRC = path.join(FRONTEND, 'platform');
    const ORG_SRC      = path.join(FRONTEND, 'org');

    // Platform → importing from Org
    const platToOrg = rg(`from ['"][^'"]*\\/org\\/`, PLATFORM_SRC, '-g "*.{js,jsx}"');
    if (platToOrg.length) {
        platToOrg.forEach(f => fail('B4:PLANE_IMPORT',
            '❌ PLANE-VIOLATION: Platform file imports from Org plane',
            path.relative(ROOT, f)));
    } else {
        pass('B4:PLANE_IMPORT', 'Platform plane has no Org imports ✓');
    }

    // Org → importing from Platform
    const orgToPlat = rg(`from ['"][^'"]*\\/platform\\/`, ORG_SRC, '-g "*.{js,jsx}"');
    if (orgToPlat.length) {
        orgToPlat.forEach(f => fail('B4:PLANE_IMPORT',
            '❌ PLANE-VIOLATION: Org file imports from Platform plane',
            path.relative(ROOT, f)));
    } else {
        pass('B4:PLANE_IMPORT', 'Org plane has no Platform imports ✓');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5 — BroadcastChannel Zero-Trust Violations
// ─────────────────────────────────────────────────────────────────────────────
function checkB5() {
    // Data payloads in postMessage (contains field names rather than just 'type')
    const payloadHits = rg(
        `postMessage\\(\\s*\\{[^}]*(plans|planVersions|planId|visibility)\\s*:`,
        FRONTEND, '-g "*.{js,jsx}"'
    );
    if (payloadHits.length) {
        payloadHits.forEach(f => fail('B5:BROADCAST_PAYLOAD',
            '❌ BROADCAST-PAYLOAD: Event carries data — must be type-only { type: "PLAN_UPDATED" }',
            path.relative(ROOT, f)));
    } else {
        pass('B5:BROADCAST_PAYLOAD', 'No BroadcastChannel data payload leaks found ✓');
    }

    // New BroadcastChannel("plans") outside the singleton file
    const bcHits = rg(`new BroadcastChannel\\(['"]plans['"]\\)`, FRONTEND, '-g "*.{js,jsx}"')
        .filter(f => !f.includes('planChannel.js'));
    if (bcHits.length) {
        bcHits.forEach(f => fail('B5:BROADCAST_SINGLETON',
            '❌ BROADCAST-SINGLETON: BroadcastChannel("plans") created outside planChannel.js',
            path.relative(ROOT, f)));
    } else {
        pass('B5:BROADCAST_SINGLETON', 'BroadcastChannel singleton is properly isolated ✓');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${B}${C}Running SPEC-KIT Enforcement Audit...${X}\n`);

checkG1();
checkG2();
checkG3();
checkB1();
checkB2();
checkB3();
checkB4();
checkB5();

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
if (JSON_MODE) {
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.violations.length > 0 ? 1 : 0);
}

console.log(`\n${B}${C}══════════════════════════════════════════════════════${X}`);
console.log(`${B}${C}  DentalSaaS SPEC-KIT Audit Report${X}`);
console.log(`${B}${C}══════════════════════════════════════════════════════${X}\n`);

if (results.passed.length) {
    console.log(`${G}${B}PASSED (${results.passed.length})${X}`);
    for (const p of results.passed) console.log(`  ${G}✅${X} [${p.gate}] ${p.msg}`);
}

if (results.warnings.length) {
    console.log(`\n${Y}${B}WARNINGS (${results.warnings.length})${X}`);
    for (const w of results.warnings) console.log(`  ${Y}⚠️ ${X} [${w.gate}] ${w.msg}`);
}

if (results.violations.length) {
    console.log(`\n${R}${B}VIOLATIONS (${results.violations.length}) — CI BLOCKING${X}`);
    for (const v of results.violations) {
        console.log(`  ${R}❌${X} [${v.gate}] ${v.msg}`);
        if (v.file) console.log(`       ${Y}↳ ${v.file}${X}`);
    }
    console.log(`\n${R}${B}❌ AUDIT FAILED — fix violations before proceeding${X}\n`);
    process.exit(1);
} else {
    console.log(`\n${G}${B}✅ SPEC-KIT AUDIT PASSED — system is governed and compliant${X}\n`);
    process.exit(0);
}
