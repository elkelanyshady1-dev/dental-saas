/**
 * moduleLifecycle.service.js — OrgRuntime Module Lifecycle Manager
 * Phase B — Runtime Module Engine
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 * Provides the service layer for enabling/disabling modules per organization.
 * All module state changes are validated against the MODULE_REGISTRY and
 * the organization's current plan before being persisted.
 *
 * ── GOVERNANCE ───────────────────────────────────────────────────────────────
 * 1. Module toggles are platform-admin-only operations
 *    (org_admin can READ status but NOT write).
 * 2. Core modules cannot be disabled.
 * 3. Plan-gated modules can only be enabled if the org's plan allows it.
 * 4. Dependency chains are validated: a module cannot be enabled unless
 *    all its dependencies are also enabled.
 * 5. Reverse-dependency chains are validated: a module cannot be disabled
 *    if other enabled modules depend on it.
 * 6. All operations are audited via structured logging.
 *
 * ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
 * ✗ Does not modify Stripe / billing state
 * ✗ Does not modify JWT claims
 * ✗ Does not mount/unmount Express routes (routes are always mounted)
 * ✗ Does not bypass platform RBAC
 * ✗ Does not affect platform-plane modules
 */

"use strict";

const Organization = require("../shared/models/Organization").default;
const { MODULE_REGISTRY, getModule, listModuleKeys } = require("../platform/featureRegistry");
const { triggerLifecycle } = require("./lifecycleHooks");
const logger = require("@utils/logger");

// ─── Module Toggle Operations ────────────────────────────────────────────────

/**
 * enableModule(organizationId, registryKey, opts)
 *
 * Enables a module for a specific organization, with full validation:
 *   1. Module must exist in MODULE_REGISTRY
 *   2. Module must not be a core module (already always enabled)
 *   3. Organization must be on a plan that allows this module
 *   4. All dependency modules must already be enabled
 *
 * @param {string} organizationId — MongoDB ObjectId string
 * @param {string} registryKey — the MODULE_REGISTRY key (e.g., "booking", "analytics")
 * @param {{ actorId?: string, actorType?: string, plan?: string }} [opts]
 * @returns {Promise<{ success: boolean, module: string, previousState: boolean, newState: boolean }>}
 * @throws {Error} if validation fails
 */
async function enableModule(organizationId, registryKey, opts = {}) {
    const moduleDef = getModule(registryKey);
    if (!moduleDef) {
        throw Object.assign(
            new Error(`Unknown module: "${registryKey}". Only registered modules can be toggled.`),
            { code: "MODULE_NOT_FOUND", statusCode: 400 }
        );
    }

    // Core modules are always enabled — no toggle needed
    if (moduleDef.isCore) {
        throw Object.assign(
            new Error(`Module "${registryKey}" is a core module and is always enabled.`),
            { code: "CORE_MODULE_NO_TOGGLE", statusCode: 400 }
        );
    }

    // Load organization
    const org = await Organization.findById(organizationId).select("modules subscription").lean();
    if (!org) {
        throw Object.assign(
            new Error(`Organization not found: ${organizationId}`),
            { code: "ORG_NOT_FOUND", statusCode: 404 }
        );
    }

    const currentPlan = opts.plan || org.subscription?.plan || "basic";

    // Plan eligibility check
    if (!moduleDef.allowedPlans.includes(currentPlan)) {
        throw Object.assign(
            new Error(
                `Module "${registryKey}" requires plan [${moduleDef.allowedPlans.join(", ")}], ` +
                `but organization is on "${currentPlan}".`
            ),
            { code: "MODULE_PLAN_RESTRICTED", statusCode: 403 }
        );
    }

    // Dependency check — all deps must be enabled
    if (moduleDef.dependencies && moduleDef.dependencies.length > 0) {
        const missingDeps = [];
        for (const depKey of moduleDef.dependencies) {
            const depDef = getModule(depKey);
            if (!depDef) continue; // Should not happen — validated at boot

            // Check if the dependency's module key is enabled on the org
            if (!org.modules?.[depDef.key]) {
                missingDeps.push(depKey);
            }
        }

        if (missingDeps.length > 0) {
            throw Object.assign(
                new Error(
                    `Cannot enable "${registryKey}": dependencies not enabled: [${missingDeps.join(", ")}]`
                ),
                { code: "DEPENDENCY_NOT_MET", statusCode: 400, missingDeps }
            );
        }
    }

    // Check current state
    const previousState = !!org.modules?.[moduleDef.key];
    if (previousState) {
        // Already enabled — idempotent success
        return {
            success: true,
            module: registryKey,
            previousState: true,
            newState: true,
            changed: false,
        };
    }

    // Perform the update
    await Organization.findByIdAndUpdate(organizationId, {
        $set: {
            [`modules.${moduleDef.key}`]: true,
            modulesUpdatedAt: new Date(),
        },
        $inc: { version: 1 },
    });

    logger.info(
        {
            event: "MODULE_ENABLED",
            organizationId,
            registryKey,
            moduleKey: moduleDef.key,
            plan: currentPlan,
            actorId: opts.actorId || "system",
            actorType: opts.actorType || "platform",
        },
        `[moduleLifecycle] Module "${registryKey}" ENABLED for org ${organizationId}`
    );

    // Phase B.2: Trigger lifecycle hook (non-blocking)
    triggerLifecycle("onEnable", organizationId, moduleDef.key, {
        actorId: opts.actorId || "system",
        actorType: opts.actorType || "platform",
        plan: currentPlan,
    }).catch(() => {}); // Fire-and-forget — errors logged inside triggerLifecycle

    return {
        success: true,
        module: registryKey,
        previousState: false,
        newState: true,
        changed: true,
    };
}

/**
 * disableModule(organizationId, registryKey, opts)
 *
 * Disables a module for a specific organization, with validation:
 *   1. Module must exist in MODULE_REGISTRY
 *   2. Module must not be a core module (cannot be disabled)
 *   3. No other enabled module may depend on this module
 *
 * @param {string} organizationId
 * @param {string} registryKey
 * @param {{ actorId?: string, actorType?: string, force?: boolean }} [opts]
 * @returns {Promise<{ success: boolean, module: string, previousState: boolean, newState: boolean }>}
 * @throws {Error} if validation fails
 */
async function disableModule(organizationId, registryKey, opts = {}) {
    const moduleDef = getModule(registryKey);
    if (!moduleDef) {
        throw Object.assign(
            new Error(`Unknown module: "${registryKey}".`),
            { code: "MODULE_NOT_FOUND", statusCode: 400 }
        );
    }

    // Core modules cannot be disabled
    if (moduleDef.isCore) {
        throw Object.assign(
            new Error(`Module "${registryKey}" is a core module and cannot be disabled.`),
            { code: "CORE_MODULE_NO_TOGGLE", statusCode: 400 }
        );
    }

    // Load organization
    const org = await Organization.findById(organizationId).select("modules").lean();
    if (!org) {
        throw Object.assign(
            new Error(`Organization not found: ${organizationId}`),
            { code: "ORG_NOT_FOUND", statusCode: 404 }
        );
    }

    // Reverse dependency check — prevent breaking dependents
    if (!opts.force) {
        const blockers = [];
        for (const [otherKey, otherDef] of Object.entries(MODULE_REGISTRY)) {
            if (otherKey === registryKey) continue;
            if (!otherDef.dependencies || otherDef.dependencies.length === 0) continue;

            // Check if this other module depends on the module being disabled
            if (otherDef.dependencies.includes(registryKey)) {
                // And is currently enabled
                if (org.modules?.[otherDef.key]) {
                    blockers.push(otherKey);
                }
            }
        }

        if (blockers.length > 0) {
            throw Object.assign(
                new Error(
                    `Cannot disable "${registryKey}": the following enabled modules depend on it: [${blockers.join(", ")}]. ` +
                    `Disable those modules first, or use force=true.`
                ),
                { code: "REVERSE_DEPENDENCY_BLOCK", statusCode: 400, blockers }
            );
        }
    }

    // Check current state
    const previousState = !!org.modules?.[moduleDef.key];
    if (!previousState) {
        // Already disabled — idempotent success
        return {
            success: true,
            module: registryKey,
            previousState: false,
            newState: false,
            changed: false,
        };
    }

    // Perform the update
    await Organization.findByIdAndUpdate(organizationId, {
        $set: {
            [`modules.${moduleDef.key}`]: false,
            modulesUpdatedAt: new Date(),
        },
        $inc: { version: 1 },
    });

    logger.info(
        {
            event: "MODULE_DISABLED",
            organizationId,
            registryKey,
            moduleKey: moduleDef.key,
            actorId: opts.actorId || "system",
            actorType: opts.actorType || "platform",
            forced: !!opts.force,
        },
        `[moduleLifecycle] Module "${registryKey}" DISABLED for org ${organizationId}`
    );

    // Phase B.2: Trigger lifecycle hook (non-blocking)
    triggerLifecycle("onDisable", organizationId, moduleDef.key, {
        actorId: opts.actorId || "system",
        actorType: opts.actorType || "platform",
        forced: !!opts.force,
    }).catch(() => {}); // Fire-and-forget

    return {
        success: true,
        module: registryKey,
        previousState: true,
        newState: false,
        changed: true,
    };
}

/**
 * getModuleStatus(organizationId)
 *
 * Returns the full module status for an organization — every registered module
 * with its enabled state, plan eligibility, and dependency info.
 *
 * @param {string} organizationId
 * @returns {Promise<{ modules: Object[], plan: string }>}
 */
async function getModuleStatus(organizationId) {
    const org = await Organization.findById(organizationId)
        .select("modules subscription")
        .lean();

    if (!org) {
        throw Object.assign(
            new Error(`Organization not found: ${organizationId}`),
            { code: "ORG_NOT_FOUND", statusCode: 404 }
        );
    }

    const plan = org.subscription?.plan || "basic";
    const modules = [];

    for (const [registryKey, def] of Object.entries(MODULE_REGISTRY)) {
        const enabled = def.isCore ? true : !!org.modules?.[def.key];
        const planEligible = def.allowedPlans.includes(plan);

        modules.push({
            registryKey,
            key: def.key,
            mountPath: def.mountPath,
            category: def.category,
            description: def.description,
            isCore: def.isCore,
            selfContained: !!def.selfContained,
            enabled,
            planEligible,
            allowedPlans: def.allowedPlans,
            dependencies: def.dependencies || [],
            canEnable: !enabled && planEligible && !def.isCore,
            canDisable: enabled && !def.isCore,
        });
    }

    return { plan, modules };
}

/**
 * bulkSetModules(organizationId, moduleMap, opts)
 *
 * Sets multiple module states at once. Used during plan upgrades/downgrades
 * when the platform needs to enable/disable several modules atomically.
 *
 * @param {string} organizationId
 * @param {Object<string, boolean>} moduleMap — { registryKey: enabled }
 * @param {{ actorId?: string, actorType?: string }} [opts]
 * @returns {Promise<{ success: boolean, results: object[] }>}
 */
async function bulkSetModules(organizationId, moduleMap, opts = {}) {
    const results = [];
    const updateSet = {};

    for (const [registryKey, shouldEnable] of Object.entries(moduleMap)) {
        const moduleDef = getModule(registryKey);
        if (!moduleDef) {
            results.push({ registryKey, success: false, error: "MODULE_NOT_FOUND" });
            continue;
        }
        if (moduleDef.isCore) {
            results.push({ registryKey, success: true, note: "Core module — always enabled" });
            continue;
        }

        updateSet[`modules.${moduleDef.key}`] = !!shouldEnable;
        results.push({
            registryKey,
            moduleKey: moduleDef.key,
            success: true,
            newState: !!shouldEnable,
        });
    }

    if (Object.keys(updateSet).length > 0) {
        updateSet.modulesUpdatedAt = new Date();

        await Organization.findByIdAndUpdate(organizationId, {
            $set: updateSet,
            $inc: { version: 1 },
        });

        logger.info(
            {
                event: "MODULES_BULK_SET",
                organizationId,
                moduleCount: Object.keys(updateSet).length - 1, // exclude modulesUpdatedAt
                actorId: opts.actorId || "system",
                actorType: opts.actorType || "platform",
            },
            `[moduleLifecycle] Bulk module update for org ${organizationId}`
        );
    }

    return { success: true, results };
}

module.exports = {
    enableModule,
    disableModule,
    getModuleStatus,
    bulkSetModules,
};
