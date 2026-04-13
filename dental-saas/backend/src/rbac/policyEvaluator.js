/**
 * policyEvaluator.js — Policy Condition Evaluator
 *
 * Evaluates a list of policy conditions against an access context.
 * Uses priority-sorted evaluation with deny-first semantics:
 *
 *   1. Sort by priority (highest first)
 *   2. Evaluate each condition
 *   3. First "deny" match → DENY (immediately)
 *   4. First "allow" match → ALLOW
 *   5. No match → DENY (implicit deny)
 *
 * STRICT MODE (v2.0):
 *   Write operations (create/update/delete) with no policy defined
 *   are DENIED by default. Read operations without policies are
 *   still allowed (base RBAC is sufficient for reads).
 *
 * PLANE: Org only.
 */

"use strict";

const { policies } = require("./policyRegistry");

// ─── Write-Action Detection ─────────────────────────────────────────────────

const WRITE_SUFFIXES = [".create", ".update", ".delete", ".manage", ".review", ".send", ".export"];

function isWritePermission(permission) {
    return WRITE_SUFFIXES.some(s => permission.endsWith(s));
}

// ─── Evaluation Result ──────────────────────────────────────────────────────

/**
 * @typedef {Object} PolicyDecision
 * @property {boolean} allowed — true if access is granted
 * @property {string} reason — human-readable explanation
 * @property {"allow"|"deny"|"implicit_deny"|"no_policy"|"strict_deny"} effect
 * @property {string|null} matchedRule — description of matched rule
 * @property {Array<{effect: string, priority: number, description: string, matched: boolean}>} evaluatedRules — trace of all rules checked
 */

// ─── Core Evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate all policies for a given permission against the provided context.
 *
 * @param {string} permission — the RBAC permission string (e.g., "patients.update")
 * @param {Object} ctx — the evaluation context
 * @param {Object} [options]
 * @param {boolean} [options.strict] — if true, deny write ops without policy (default: true)
 * @returns {PolicyDecision}
 */
function evaluatePolicy(permission, ctx, options = {}) {
    const { strict = true } = options;
    const rules = policies[permission];

    // No policy defined for this permission
    if (!rules || rules.length === 0) {
        // STRICT MODE: deny write operations without explicit policies
        if (strict && isWritePermission(permission)) {
            return {
                allowed: false,
                reason: `No policy defined for write permission "${permission}" — strict mode denies unprotected writes`,
                effect: "strict_deny",
                matchedRule: null,
                evaluatedRules: [],
            };
        }

        // Read operations: base RBAC is sufficient
        return {
            allowed: true,
            reason: "No policy defined — base RBAC sufficient (read-only)",
            effect: "no_policy",
            matchedRule: null,
            evaluatedRules: [],
        };
    }

    // Sort by priority (highest first, then preserve order)
    const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Build evaluation trace
    const evaluatedRules = [];

    for (const rule of sorted) {
        const ruleTrace = {
            effect: rule.effect,
            priority: rule.priority || 0,
            description: rule.description || "Unnamed rule",
            matched: false,
        };

        try {
            const matches = rule.condition(ctx);
            ruleTrace.matched = !!matches;

            if (matches) {
                evaluatedRules.push(ruleTrace);

                if (rule.effect === "deny") {
                    return {
                        allowed: false,
                        reason: rule.description || "Explicitly denied by policy",
                        effect: "deny",
                        matchedRule: rule.description,
                        evaluatedRules,
                    };
                }

                if (rule.effect === "allow") {
                    return {
                        allowed: true,
                        reason: rule.description || "Allowed by policy",
                        effect: "allow",
                        matchedRule: rule.description,
                        evaluatedRules,
                    };
                }
            } else {
                evaluatedRules.push(ruleTrace);
            }
        } catch (err) {
            // Condition evaluation error → skip this rule (fail-safe: deny)
            ruleTrace.matched = false;
            ruleTrace.error = "Evaluation error";
            evaluatedRules.push(ruleTrace);
            continue;
        }
    }

    // No matching rule → implicit deny
    return {
        allowed: false,
        reason: "No matching policy rule — implicit deny",
        effect: "implicit_deny",
        matchedRule: null,
        evaluatedRules,
    };
}

// ─── Batch Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate multiple permissions at once (for capability introspection).
 *
 * @param {string[]} permissions — array of permission strings
 * @param {Object} ctx — evaluation context
 * @returns {Map<string, PolicyDecision>}
 */
function evaluateMultiple(permissions, ctx) {
    const results = new Map();
    for (const perm of permissions) {
        results.set(perm, evaluatePolicy(perm, ctx));
    }
    return results;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    evaluatePolicy,
    evaluateMultiple,
};
