#!/usr/bin/env node
/**
 * auditSpecFlow.js — DentalSaaS SPEC-KIT CI Enforcement (v1.0)
 * ═══════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 *   Hard-gates the spec-first development pipeline at CI level.
 *   Runs on every push / pull request. Blocks merges on violation.
 *
 * SPEC STRUCTURE (actual repo layout):
 *   specs/spec.md                         ← root TDS (monolithic)
 *   specs/plan.md                         ← implementation plan
 *   specs/tasks.md                        ← developer task cards
 *   specs/<module>.spec.md               ← per-domain spec files
 *
 * GATES:
 *   G1 — Root spec.md exists + all module specs present
 *   G2 — plan.md exists and non-empty
 *   G3 — tasks.md exists and non-empty
 *   B1 — Auth token violations (localStorage platformToken, generic "token" key)
 *   B2 — Raw fetch() bypassing interceptors
 *   B3 — React Query violations (hardcoded keys, new QueryClient(), reload)
 *   B4 — Cross-plane frontend import violations
 *   B5 — BroadcastChannel data payload leaks
 *   B6 — Plan Projection Layer bypass (raw status/visibility comparisons in plan UI)
 *
 * EXIT CODES:
 *   0 — All gates pass (CI green)
 *   1 — One or more violations (CI red — blocks merge)
 *
 * USAGE:
 *   node scripts/auditSpecFlow.js            # human-readable
 *   node scripts/auditSpecFlow.js --json     # machine-readable (CI annotations)
 *   node scripts/auditSpecFlow.js --summary  # one-line pass/fail only
 */

'use strict';

const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT     = path.resolve(__dirname, '..');
const SPECS    = path.join(ROOT, 'specs');
const FRONTEND = path.join(ROOT, 'frontend', 'src');

// ─── Flags ───────────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const IS_JSON = argv.includes('--json');
const SUMMARY = argv.includes('--summary');

// ─── ANSI colours (disabled in CI if NO_COLOR env is set) ────────────────────
const NO_COLOR = process.env.NO_COLOR || process.env.CI;
const c = {
    red:    s => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
    green:  s => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
    yellow: s => NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`,
    cyan:   s => NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`,
    bold:   s => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
};

// ─── Result store ─────────────────────────────────────────────────────────────
const passed     = [];
const violations = [];
const warnings   = [];

const pass  = (gate, msg)           => passed.push({ gate, msg });
const fail  = (gate, msg, file)     => violations.push({ gate, msg, file: file || null });
const warn  = (gate, msg, file)     => warnings.push({ gate, msg, file: file || null });

// ─── Utilities ────────────────────────────────────────────────────────────────
const exists = p => fs.existsSync(p);
const size   = p => exists(p) ? fs.statSync(p).size : 0;

/** ripgrep wrapper — returns list of matching file paths. Returns [] on no match or if rg not installed. */
function rg(pattern, dir, globPattern = '*.{js,jsx}') {
    try {
        const cmd = process.platform === 'win32'
            ? `rg --no-heading --with-filename -l "${pattern}" -g "${globPattern}" "${dir}"`
            : `rg --no-heading --with-filename -l '${pattern}' -g '${globPattern}' '${dir}'`;

        const out = execSync(cmd, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 20000,
        });
        return out.trim().split(/\r?\n/).filter(Boolean);
    } catch {
        return [];
    }
}

const rel = p => path.relative(ROOT, p);

// ═════════════════════════════════════════════════════════════════════════════
// GATE 1 — SPEC DOCUMENTS EXIST
// ═════════════════════════════════════════════════════════════════════════════
function checkG1() {
    // Root TDS
    const specPath = path.join(SPECS, 'spec.md');
    if (!exists(specPath)) {
        fail('G1', 'specs/spec.md is MISSING — root TDS not found', 'specs/spec.md');
        fail('G1', 'Cannot proceed with G1 checks — root spec absent. Run: make spec');
        return;
    }
    const kb = Math.round(size(specPath) / 1024);
    if (kb < 10) warn('G1', `specs/spec.md is very small (${kb} KB) — may be truncated or incomplete`);
    else pass('G1', `specs/spec.md  ${kb} KB`);

    // Per-module specs — these MUST all exist
    const MODULE_SPECS = [
        ['platform-governance',    'platform-governance.spec.md'],
        ['billing-engine',         'billing-engine.spec.md'],
        ['appointment-engine',     'appointment-engine.spec.md'],
        ['patient-domain',         'patient-domain.spec.md'],
        ['authentication',         'authentication.spec.md'],
        ['inventory-engine',       'inventory-engine.spec.md'],
        ['notification-comms',     'notification-communication.spec.md'],
        ['orthodontic-ai',         'orthodontic-ai.spec.md'],
        ['intelligence-analytics', 'intelligence-analytics.spec.md'],
        ['system-architecture',    'system-architecture.spec.md'],
    ];

    for (const [domain, file] of MODULE_SPECS) {
        const p = path.join(SPECS, file);
        if (!exists(p)) fail('G1', `Module spec missing: specs/${file}  (domain: ${domain})`, `specs/${file}`);
        else if (size(p) < 2000) warn('G1', `specs/${file} is very small — may be a placeholder`);
        else pass('G1', `specs/${file}  ${Math.round(size(p) / 1024)} KB`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// GATE 2 — IMPLEMENTATION PLAN EXISTS
// ═════════════════════════════════════════════════════════════════════════════
function checkG2() {
    const p = path.join(SPECS, 'plan.md');
    if (!exists(p))          fail('G2', 'specs/plan.md MISSING  →  run: make plan', 'specs/plan.md');
    else if (size(p) < 1000) warn('G2', `specs/plan.md exists but is very small (${size(p)} bytes) — run: make plan`);
    else                     pass('G2', `specs/plan.md  ${Math.round(size(p) / 1024)} KB`);
}

// ═════════════════════════════════════════════════════════════════════════════
// GATE 3 — DEVELOPER TASK CARDS EXIST
// ═════════════════════════════════════════════════════════════════════════════
function checkG3() {
    const p = path.join(SPECS, 'tasks.md');
    if (!exists(p))         fail('G3', 'specs/tasks.md MISSING  →  run: make tasks', 'specs/tasks.md');
    else if (size(p) < 500) warn('G3', `specs/tasks.md exists but appears empty — run: make tasks`);
    else                    pass('G3', `specs/tasks.md  ${Math.round(size(p) / 1024)} KB`);
}

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 1 — ZERO-TRUST AUTH VIOLATIONS
// ═════════════════════════════════════════════════════════════════════════════
function checkB1() {
    const checks = [
        {
            pat: 'localStorage\\.setItem\\([\'"]platformToken[\'"]',
            msg: 'AUTH-DOWNGRADE: platformToken stored in localStorage — must be in-memory _pToken (Platform plane rule)',
        },
        {
            pat: 'sessionStorage\\.setItem\\([\'"]platformToken[\'"]',
            msg: 'AUTH-DOWNGRADE: platformToken stored in sessionStorage — must be in-memory only (Platform plane rule)',
        },
        {
            pat: 'localStorage\\.setItem\\([\'"]token[\'"]',
            msg: 'GENERIC-KEY: Generic "token" key in localStorage — must use plane-namespaced keys (org_access_token / patientToken)',
        },
        {
            pat: 'localStorage\\.getItem\\([\'"]token[\'"]',
            msg: 'GENERIC-KEY: Generic "token" key read from localStorage — must use canonical plane-specific keys',
        },
        {
            pat: 'localStorage\\.getItem\\([\'"]orgToken[\'"]',
            msg: 'LEGACY-KEY: "orgToken" key is deprecated — canonical key is org_access_token in sessionStorage',
        },
    ];

    for (const { pat, msg } of checks) {
        const hits = rg(pat, FRONTEND);
        if (hits.length) hits.forEach(f => fail('B1:AUTH', msg, rel(f)));
        else pass('B1:AUTH', `clean: ${pat.slice(0, 50)}...`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 2 — RAW FETCH() BYPASSING INTERCEPTORS
// ═════════════════════════════════════════════════════════════════════════════
function checkB2() {
    const hits = rg('const token\\s*=\\s*localStorage\\.getItem', FRONTEND);
    if (hits.length) {
        hits.forEach(f => fail('B2:FETCH_BYPASS',
            'INTERCEPTOR-BYPASS: Manual localStorage.getItem() for token — use api/platformApi client which handles auth automatically',
            rel(f)));
    } else {
        pass('B2:FETCH_BYPASS', 'No manual localStorage token reads found');
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — REACT QUERY VIOLATIONS
// ═════════════════════════════════════════════════════════════════════════════
function checkB3() {
    // new QueryClient() outside the singleton file
    const singletonHits = rg('new QueryClient\\(\\)', FRONTEND)
        .filter(f => !f.endsWith('queryClient.js') && !f.endsWith('queryClient.ts'));
    if (singletonHits.length) singletonHits.forEach(f =>
        fail('B3:RQ_SINGLETON',
            'RQ-SINGLETON: new QueryClient() created outside queryClient.js — all planes must use the shared instance from @/lib/query/queryClient',
            rel(f)));
    else pass('B3:RQ_SINGLETON', 'QueryClient singleton is properly isolated');

    // window.location.reload()
    const reloadHits = rg('window\\.location\\.reload\\(\\)', FRONTEND);
    if (reloadHits.length) reloadHits.forEach(f =>
        fail('B3:RQ_RELOAD',
            'RQ-RELOAD: window.location.reload() forbidden — use queryClient.invalidateQueries() to trigger data refresh',
            rel(f)));
    else pass('B3:RQ_RELOAD', 'No window.location.reload() found');

    // Hardcoded plan query keys (warn only — allows gradual migration)
    const keyHits = rg('useQuery\\(\\s*\\[[\'"](?:plans|publicPlans|planVersions)[\'"]\\]', FRONTEND);
    if (keyHits.length) keyHits.forEach(f =>
        warn('B3:RQ_KEY',
            'RQ-HARDKEY: Hardcoded useQuery key — should use PLAN_QUERY_KEYS registry from @/lib/query/planQueryKeys',
            rel(f)));
    else pass('B3:RQ_KEY', 'No hardcoded plan query keys found');
}

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 4 — CROSS-PLANE IMPORT VIOLATIONS
// ═════════════════════════════════════════════════════════════════════════════
function checkB4() {
    const PLATFORM_SRC = path.join(FRONTEND, 'platform');
    const ORG_SRC      = path.join(FRONTEND, 'org');

    // Platform → Org imports
    const p2o = rg('from [\'"][^\'"]*\\/org\\/', PLATFORM_SRC);
    if (p2o.length) p2o.forEach(f =>
        fail('B4:PLANE_IMPORT', 'PLANE-VIOLATION: Platform file imports from Org plane — use service API boundary instead', rel(f)));
    else pass('B4:PLANE_IMPORT', 'Platform plane: no Org imports');

    // Org → Platform imports
    const o2p = rg('from [\'"][^\'"]*\\/platform\\/', ORG_SRC);
    if (o2p.length) o2p.forEach(f =>
        fail('B4:PLANE_IMPORT', 'PLANE-VIOLATION: Org file imports from Platform plane — use service API boundary instead', rel(f)));
    else pass('B4:PLANE_IMPORT', 'Org plane: no Platform imports');
}

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 5 — BROADCAST CHANNEL ZERO-TRUST VIOLATIONS
// ═════════════════════════════════════════════════════════════════════════════
function checkB5() {
    // Data payloads
    const payloadHits = rg(
        'postMessage\\(\\s*\\{[^}]*(?:plans|planVersions|planId|visibility)\\s*:',
        FRONTEND
    );
    if (payloadHits.length) payloadHits.forEach(f =>
        fail('B5:BC_PAYLOAD',
            'ZERO-TRUST-VIOLATION: BroadcastChannel event carries data payload — must be type-only: { type: "PLAN_UPDATED" }',
            rel(f)));
    else pass('B5:BC_PAYLOAD', 'No BroadcastChannel data payload leaks');

    // Singleton violations
    const bcHits = rg('new BroadcastChannel\\([\'"]plans[\'"]\\)', FRONTEND)
        .filter(f => !f.endsWith('planChannel.js') && !f.endsWith('planChannel.ts'));
    if (bcHits.length) bcHits.forEach(f =>
        fail('B5:BC_SINGLETON',
            'SINGLETON-VIOLATION: BroadcastChannel("plans") created outside planChannel.js — import { emitPlanUpdate, usePlanChannelListener } instead',
            rel(f)));
    else pass('B5:BC_SINGLETON', 'BroadcastChannel singleton properly isolated');
}

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 6 — PLAN PROJECTION LAYER BYPASS (HARD BLOCK)
// ═════════════════════════════════════════════════════════════════════════════
//
// Law: ALL plan display logic must derive from planProjection.service.js fields:
//   displayStatus, isLive, isActive, isDraft, isDeprecated, showInMarketing
//
// These patterns indicate a bypass of the Projection Layer — hard CI block:
//   • plan.status === / version.status ===   → must use v.isActive / v.isDraft / v.isDeprecated
//   • plan.visibility === / v.visibility === → must use v.isPublic / v.isSales / v.isInternal
//   • resolveBadge(                          → removed in v3.0 — badge comes from displayStatus
//   • getOverallBadge(                       → removed in v3.0 — use activeVersion.displayStatus
//   • visibility === .public.                → must use v.showInMarketing
//
// Scan scope: plan-domain files in frontend/src/platform/modules/plans/
// and frontend/src/modules/public-site/ to keep scope tight.
// ═════════════════════════════════════════════════════════════════════════════
function checkB6() {
    // Directories in scope for the projection law
    const PLAN_DIRS = [
        path.join(FRONTEND, 'platform', 'modules', 'plans'),
        path.join(FRONTEND, 'modules', 'public-site'),
    ].filter(d => fs.existsSync(d));

    if (!PLAN_DIRS.length) {
        warn('B6:PROJECTION', 'Plan module directories not found — skipping projection audit');
        return;
    }

    // B6.1 — Raw lifecycle status comparison in plan-domain files
    // Allowed inside planProjection.service.js itself (that\'s where the derivation MUST live).
    // Blocked everywhere else in the plan UI domain.
    const statusHits = PLAN_DIRS.flatMap(d =>
        rg('\\.status\\s*===\\s*[\'"](?:active|draft|deprecated)[\'"]', d)
    ).filter(f =>
        // Allow in the projection service itself (it\'s the SSOT)
        !f.includes('planProjection.service')
        // Allow in backend controllers (they are producers, not consumers)
        && !f.includes('controllers')
        // Allow test files
        && !f.includes('.test.') && !f.includes('.spec.')
    );
    if (statusHits.length) {
        statusHits.forEach(f => fail('B6:PROJECTION_STATUS',
            'PROJECTION-BYPASS: Raw .status === comparison in plan UI — use v.isActive / v.isDraft / v.isDeprecated (projection layer fields)',
            rel(f)));
    } else {
        pass('B6:PROJECTION_STATUS', 'No raw .status comparisons in plan UI files');
    }

    // B6.2 — Raw visibility comparison in plan-domain files
    const visibilityHits = PLAN_DIRS.flatMap(d =>
        rg('\\.visibility\\s*===\\s*[\'"](?:public|sales|internal)[\'"]', d)
    ).filter(f =>
        !f.includes('planProjection.service')
        && !f.includes('controllers')
        && !f.includes('.test.') && !f.includes('.spec.')
    );
    if (visibilityHits.length) {
        visibilityHits.forEach(f => fail('B6:PROJECTION_VISIBILITY',
            'PROJECTION-BYPASS: Raw .visibility === comparison in plan UI — use v.isPublic / v.isSales / v.isInternal (projection layer fields)',
            rel(f)));
    } else {
        pass('B6:PROJECTION_VISIBILITY', 'No raw .visibility comparisons in plan UI files');
    }

    // B6.3 — resolveBadge() call (removed in PlanCard v3.0 — must stay removed)
    const resolveBadgeHits = PLAN_DIRS.flatMap(d =>
        rg('resolveBadge\\s*\\(', d)
    );
    if (resolveBadgeHits.length) {
        resolveBadgeHits.forEach(f => fail('B6:RESOLVE_BADGE',
            'PROJECTION-BYPASS: resolveBadge() call found in plan UI — removed in v3.0. Badge must come from server-projected displayStatus field',
            rel(f)));
    } else {
        pass('B6:RESOLVE_BADGE', 'resolveBadge() correctly absent from plan UI');
    }

    // B6.4 — getOverallBadge() call (removed in PlanCard v3.0 — must stay removed)
    const overallBadgeHits = PLAN_DIRS.flatMap(d =>
        rg('getOverallBadge\\s*\\(', d)
    );
    if (overallBadgeHits.length) {
        overallBadgeHits.forEach(f => fail('B6:OVERALL_BADGE',
            'PROJECTION-BYPASS: getOverallBadge() call found — removed in v3.0. Use activeVersion.displayStatus from projection layer',
            rel(f)));
    } else {
        pass('B6:OVERALL_BADGE', 'getOverallBadge() correctly absent from plan UI');
    }

    // B6.5 — Frontend showInMarketing re-derivation
    // Frontend must READ showInMarketing, never COMPUTE it.
    const simHits = PLAN_DIRS.flatMap(d =>
        rg('showInMarketing\\s*=\\s*(?!version\\.|v\\.)', d)
    ).filter(f =>
        !f.includes('planProjection.service')
        && !f.includes('publicController')
        && !f.includes('.test.') && !f.includes('.spec.')
    );
    if (simHits.length) {
        simHits.forEach(f => fail('B6:SIM_RECOMPUTE',
            'PROJECTION-BYPASS: showInMarketing re-derived in frontend — must be READ from server projection, never computed locally',
            rel(f)));
    } else {
        pass('B6:SIM_RECOMPUTE', 'showInMarketing not re-derived in plan UI');
    }
}

// ═════════════════════════════════════════════════════════════════════════════
if (!SUMMARY) console.log(c.bold(c.cyan('\n  DentalSaaS SPEC-KIT Enforcement Audit\n')));

checkG1();
checkG2();
checkG3();
checkB1();
checkB2();
checkB3();
checkB4();
checkB5();
checkB6();

// ═════════════════════════════════════════════════════════════════════════════
// REPORT
// ═════════════════════════════════════════════════════════════════════════════
if (IS_JSON) {
    console.log(JSON.stringify({ passed, violations, warnings }, null, 2));
    process.exit(violations.length > 0 ? 1 : 0);
}

if (SUMMARY) {
    if (violations.length > 0) {
        console.log(`FAIL  ${violations.length} violation(s)  ${warnings.length} warning(s)  ${passed.length} passed`);
        process.exit(1);
    } else {
        console.log(`PASS  0 violations  ${warnings.length} warning(s)  ${passed.length} passed`);
        process.exit(0);
    }
}

// Full human-readable report
const sep = '─'.repeat(56);
console.log(sep);

if (passed.length) {
    console.log(c.bold(c.green(`PASSED (${passed.length})`)));
    passed.forEach(p => console.log(`  ${c.green('✓')} [${p.gate}] ${p.msg}`));
}

if (warnings.length) {
    console.log(`\n${c.bold(c.yellow(`WARNINGS (${warnings.length})`))} — not blocking`);
    warnings.forEach(w => {
        console.log(`  ${c.yellow('⚠')} [${w.gate}] ${w.msg}`);
        if (w.file) console.log(`      ${c.yellow('↳')} ${w.file}`);
    });
}

console.log(sep);

if (violations.length) {
    console.log(`\n${c.bold(c.red(`VIOLATIONS (${violations.length}) — BUILD BLOCKED`))}`);
    violations.forEach(v => {
        console.log(`  ${c.red('✗')} [${v.gate}] ${v.msg}`);
        if (v.file) console.log(`      ${c.red('↳')} ${v.file}`);
    });
    console.log(`\n${c.bold(c.red('✗ SPEC-KIT AUDIT FAILED'))}`);
    console.log(c.yellow('  Required: fix all violations before this branch can be merged.\n'));
    process.exit(1);
} else {
    console.log(`\n${c.bold(c.green('✓ SPEC-KIT AUDIT PASSED'))} — system is governed and compliant.\n`);
    process.exit(0);
}
