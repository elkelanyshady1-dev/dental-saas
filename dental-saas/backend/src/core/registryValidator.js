/**
 * registryValidator.js — Boot-Time Registry Integrity Validator
 * Phase B — SSOT Consolidation (featureRegistry is the single source of truth)
 *
 * Performs structural validation of FEATURE_REGISTRY at boot time.
 * Catches configuration errors before the server accepts traffic.
 *
 * Checks:
 *   1. No duplicate basePath values   (Express routing conflicts)
 *   2. All routable modules have routeFactory functions
 *   3. Plan-gated modules have non-empty plans arrays
 *   4. All dependency references point to existing registry keys
 *   5. No self-referencing dependencies
 *   6. No circular dependency chains  (DFS cycle detection)
 *   7. No conflicting module key flags (isCore consistency)
 *   8. Plan tier names are valid       (catches typos)
 *
 * PLANE: Shared — runs at server boot.
 */

"use strict";

const logger = require("@utils/logger");

/** Allowed plan tier names — catches typos like "enterprse" */
const VALID_PLAN_TIERS = new Set(["basic", "pro", "enterprise"]);

/**
 * validateRegistry(FEATURE_REGISTRY)
 *
 * @param {Object} FEATURE_REGISTRY — the frozen feature registry
 * @param {{ strict?: boolean }} [options] — if strict, throws on error
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateRegistry(FEATURE_REGISTRY, options = {}) {
    const { strict = false } = options;
    const errors = [];
    const warnings = [];

    const allKeys = new Set(Object.keys(FEATURE_REGISTRY));

    // ── Check 1: Duplicate basePaths ─────────────────────────────────────────
    const seenPaths = new Map(); // basePath → registryKey
    for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
        if (!def.basePath) continue; // Non-routable — skip

        if (seenPaths.has(def.basePath)) {
            errors.push(
                `Duplicate basePath "/${def.basePath}" claimed by both ` +
                `"${seenPaths.get(def.basePath)}" and "${registryKey}"`
            );
        }
        seenPaths.set(def.basePath, registryKey);
    }

    // ── Check 2: Routable modules need routeFactory ──────────────────────────
    for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
        if (def.basePath && !def.routeFactory) {
            errors.push(
                `Module "${registryKey}" has basePath "${def.basePath}" but no routeFactory`
            );
        }
        if (!def.basePath && def.routeFactory) {
            warnings.push(
                `Module "${registryKey}" has routeFactory but no basePath — route will not be mounted`
            );
        }
    }

    // ── Check 3: Plans validation ────────────────────────────────────────────
    for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
        if (!def.plans || !Array.isArray(def.plans) || def.plans.length === 0) {
            errors.push(`Module "${registryKey}" has empty or missing plans array`);
        }
    }

    // ── Check 4: Dependency validation ───────────────────────────────────────
    for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
        if (!def.dependencies || def.dependencies.length === 0) continue;

        for (const dep of def.dependencies) {
            if (!allKeys.has(dep)) {
                errors.push(
                    `Module "${registryKey}" declares dependency "${dep}" ` +
                    `which does not exist in FEATURE_REGISTRY`
                );
            }
        }
    }

    // ── Check 5: Self-referencing dependencies ───────────────────────────────
    for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
        if (def.dependencies?.includes(registryKey)) {
            errors.push(`Module "${registryKey}" lists itself as a dependency`);
        }
    }

    // ── Check 6: Circular dependency detection (DFS) ─────────────────────────
    // Catches transitive cycles: A→B→C→A
    {
        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = {};
        for (const key of allKeys) color[key] = WHITE;

        function dfs(node, path) {
            color[node] = GRAY;
            path.push(node);

            const deps = FEATURE_REGISTRY[node]?.dependencies || [];
            for (const dep of deps) {
                if (!allKeys.has(dep)) continue; // already caught in Check 4
                if (color[dep] === GRAY) {
                    // Found a cycle — extract the cycle path
                    const cycleStart = path.indexOf(dep);
                    const cycle = path.slice(cycleStart).concat(dep);
                    errors.push(
                        `Circular dependency detected: ${cycle.join(" → ")}`
                    );
                    return;
                }
                if (color[dep] === WHITE) {
                    dfs(dep, path);
                }
            }

            path.pop();
            color[node] = BLACK;
        }

        for (const key of allKeys) {
            if (color[key] === WHITE) {
                dfs(key, []);
            }
        }
    }

    // ── Check 7: Conflicting isCore flags for same module key ────────────────
    // Multiple registry entries can share the same `module` key (e.g., procedures
    // and treatments both use module="clinical"). They MUST agree on isCore.
    {
        const moduleFlags = new Map(); // module → { isCore, firstKey }
        for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
            if (!def.module) continue;
            const prev = moduleFlags.get(def.module);
            if (prev && prev.isCore !== def.isCore) {
                errors.push(
                    `Module key "${def.module}" has conflicting isCore flags: ` +
                    `"${prev.firstKey}" (isCore=${prev.isCore}) vs "${registryKey}" (isCore=${def.isCore})`
                );
            }
            if (!prev) {
                moduleFlags.set(def.module, { isCore: def.isCore, firstKey: registryKey });
            }
        }
    }

    // ── Check 8: Plan tier name validation ───────────────────────────────────
    for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
        if (!def.plans || !Array.isArray(def.plans)) continue;
        for (const plan of def.plans) {
            if (!VALID_PLAN_TIERS.has(plan)) {
                warnings.push(
                    `Module "${registryKey}" contains unrecognized plan tier "${plan}" — ` +
                    `valid tiers: ${[...VALID_PLAN_TIERS].join(", ")}`
                );
            }
        }
    }

    // ── Report ───────────────────────────────────────────────────────────────
    if (errors.length > 0) {
        const msg = `[registryValidator] FEATURE_REGISTRY validation FAILED:\n  ${errors.join("\n  ")}`;
        logger.error({ errors }, msg);

        if (strict) {
            throw new Error(msg);
        }
    }

    if (warnings.length > 0) {
        logger.warn(
            { warnings },
            `[registryValidator] FEATURE_REGISTRY warnings:\n  ${warnings.join("\n  ")}`
        );
    }

    if (errors.length === 0) {
        logger.info(
            {
                service: "registryValidator",
                routableModules: seenPaths.size,
                totalModules: allKeys.size,
                checks: 8,
            },
            `[registryValidator] ✅ FEATURE_REGISTRY validation passed (${seenPaths.size} routable / ${allKeys.size} total, 8 checks)`
        );
    }

    return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateRegistry };
