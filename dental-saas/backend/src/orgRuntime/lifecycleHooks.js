/**
 * lifecycleHooks.js — Module Lifecycle Hook Registry
 * Phase B.2 — Runtime Maturity & Architecture Optimization
 *
 * PURPOSE:
 * Provides lifecycle callbacks for module enable/disable/install/uninstall
 * events. The moduleLifecycle.service.js calls these hooks when module
 * state changes. Each module can optionally register hooks.
 *
 * Hooks are async and receive (orgId, context) where context includes
 * the actorId, actorType, and any additional metadata.
 *
 * Hooks MUST be idempotent and MUST handle errors gracefully.
 * A hook failure is logged but does NOT block the module state change.
 *
 * PLANE: Org-plane only.
 */

"use strict";

const logger = require("@utils/logger");
const eventBus = require("../core/eventBus");

/**
 * LIFECYCLE_HOOKS — Per-module lifecycle callbacks.
 *
 * Each key is a module canonical key (e.g., "finance", "orthodontics").
 * Each value is an object with optional async handlers:
 *   - onEnable(orgId, context)
 *   - onDisable(orgId, context)
 *   - onInstall(orgId, context)   — first-time enablement
 *   - onUninstall(orgId, context) — permanent removal (future)
 *
 * Hooks are purely additive — modules without hooks simply skip execution.
 */
const LIFECYCLE_HOOKS = {

    finance: {
        onEnable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onEnable", module: "finance", orgId },
                `[Lifecycle] Finance module enabled for org ${orgId}`
            );
            eventBus.emit("module.enabled", { moduleKey: "finance", organizationId: orgId, ...context });
        },
        onDisable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onDisable", module: "finance", orgId },
                `[Lifecycle] Finance module disabled for org ${orgId}`
            );
            eventBus.emit("module.disabled", { moduleKey: "finance", organizationId: orgId, ...context });
        },
    },

    orthodontics: {
        onEnable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onEnable", module: "orthodontics", orgId },
                `[Lifecycle] Orthodontics module enabled for org ${orgId}`
            );
            eventBus.emit("module.enabled", { moduleKey: "orthodontics", organizationId: orgId, ...context });
        },
        onDisable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onDisable", module: "orthodontics", orgId },
                `[Lifecycle] Orthodontics module disabled for org ${orgId}`
            );
            eventBus.emit("module.disabled", { moduleKey: "orthodontics", organizationId: orgId, ...context });
        },
    },

    analytics: {
        onEnable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onEnable", module: "analytics", orgId },
                `[Lifecycle] Analytics module enabled for org ${orgId}`
            );
            eventBus.emit("module.enabled", { moduleKey: "analytics", organizationId: orgId, ...context });
        },
        onDisable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onDisable", module: "analytics", orgId },
                `[Lifecycle] Analytics module disabled for org ${orgId}`
            );
            eventBus.emit("module.disabled", { moduleKey: "analytics", organizationId: orgId, ...context });
        },
    },

    booking: {
        onEnable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onEnable", module: "booking", orgId },
                `[Lifecycle] Booking module enabled for org ${orgId}`
            );
            eventBus.emit("module.enabled", { moduleKey: "booking", organizationId: orgId, ...context });
        },
        onDisable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onDisable", module: "booking", orgId },
                `[Lifecycle] Booking module disabled for org ${orgId}`
            );
            eventBus.emit("module.disabled", { moduleKey: "booking", organizationId: orgId, ...context });
        },
    },

    communication: {
        onEnable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onEnable", module: "communication", orgId },
                `[Lifecycle] Communication module enabled for org ${orgId}`
            );
            eventBus.emit("module.enabled", { moduleKey: "communication", organizationId: orgId, ...context });
        },
        onDisable: async (orgId, context) => {
            logger.info(
                { event: "MODULE_LIFECYCLE", hook: "onDisable", module: "communication", orgId },
                `[Lifecycle] Communication module disabled for org ${orgId}`
            );
            eventBus.emit("module.disabled", { moduleKey: "communication", organizationId: orgId, ...context });
        },
    },
};

/**
 * triggerLifecycle(event, orgId, moduleKey, context)
 *
 * Triggers the lifecycle hook for a module if one is registered.
 * Failures are logged but never thrown — hooks are non-blocking.
 *
 * @param {"onEnable"|"onDisable"|"onInstall"|"onUninstall"} event
 * @param {string} orgId — organization ID
 * @param {string} moduleKey — canonical module key (e.g., "finance")
 * @param {Object} [context] — additional context (actorId, actorType, etc.)
 * @returns {Promise<{ executed: boolean, error?: string }>}
 */
async function triggerLifecycle(event, orgId, moduleKey, context = {}) {
    const hooks = LIFECYCLE_HOOKS[moduleKey];
    if (!hooks || typeof hooks[event] !== "function") {
        return { executed: false };
    }

    try {
        await hooks[event](orgId, context);
        return { executed: true };
    } catch (err) {
        logger.error(
            {
                event: "MODULE_LIFECYCLE_ERROR",
                hook: event,
                module: moduleKey,
                orgId,
                error: err.message,
            },
            `[Lifecycle] Hook ${event} for module "${moduleKey}" FAILED: ${err.message}`
        );
        return { executed: true, error: err.message };
    }
}

/**
 * getRegisteredHooks — Returns which modules have lifecycle hooks registered.
 * Used by admin/diagnostic APIs.
 *
 * @returns {Object<string, string[]>} — { moduleKey: [hookNames] }
 */
function getRegisteredHooks() {
    const result = {};
    for (const [moduleKey, hooks] of Object.entries(LIFECYCLE_HOOKS)) {
        result[moduleKey] = Object.keys(hooks).filter(
            k => typeof hooks[k] === "function"
        );
    }
    return result;
}

module.exports = {
    triggerLifecycle,
    getRegisteredHooks,
    LIFECYCLE_HOOKS,
};
