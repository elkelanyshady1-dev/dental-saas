/**
 * featureRegistryDb.controller.js — Feature Registry HTTP Handlers
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * Platform-only controller for the Feature Registry admin page.
 * All handlers require platformProtect + MANAGE_PLATFORM_SETTINGS.
 *
 * PLANE: Platform. Must not be imported from org context.
 */

"use strict";

const service = require("../services/featureRegistryDb.service");
const logger = require("@utils/logger");

// ─── GET /feature-registry ─────────────────────────────────────────────────

/**
 * Get the full feature registry (modules + features + stats).
 */
async function getRegistry(req, res) {
    const registry = await service.getFullRegistry();
    return res.json({ success: true, data: registry });
}

// ─── GET /feature-registry/modules ──────────────────────────────────────────

/**
 * List all module definitions.
 */
async function listModules(req, res) {
    const modules = await service.listModules();
    return res.json({ success: true, data: modules });
}

// ─── GET /feature-registry/features ─────────────────────────────────────────

/**
 * List all feature definitions, optionally filtered by module.
 */
async function listFeatures(req, res) {
    const { module: moduleKey } = req.query;
    const features = await service.listFeatures(moduleKey);
    return res.json({ success: true, data: features });
}

// ─── PUT /feature-registry/module/:id ───────────────────────────────────────

/**
 * Update a module definition by ID.
 */
async function updateModule(req, res) {
    const { id } = req.params;
    const updated = await service.updateModule(id, req.body);

    logger.info(
        {
            event: "CRITICAL_MUTATION",
            action: "feature_registry.module.update",
            moduleId: id,
            moduleKey: updated.key,
            operatorId: req.user?._id || req.user?.id,
        },
        "[FeatureRegistry] Module updated by platform operator"
    );

    return res.json({ success: true, data: updated });
}

// ─── PATCH /feature-registry/module/:id/toggle ──────────────────────────────

/**
 * Toggle module enabled state.
 */
async function toggleModule(req, res) {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
        return res.status(400).json({ success: false, error: "enabled must be a boolean" });
    }

    const updated = await service.toggleModule(id, enabled);

    logger.info(
        {
            event: "CRITICAL_MUTATION",
            action: "feature_registry.module.toggle",
            moduleId: id,
            moduleKey: updated.key,
            enabled,
            operatorId: req.user?._id || req.user?.id,
        },
        `[FeatureRegistry] Module ${enabled ? "enabled" : "disabled"}`
    );

    return res.json({ success: true, data: updated });
}

// ─── PUT /feature-registry/feature/:id ──────────────────────────────────────

/**
 * Update a feature definition by ID.
 */
async function updateFeature(req, res) {
    const { id } = req.params;
    const updated = await service.updateFeature(id, req.body);

    logger.info(
        {
            event: "CRITICAL_MUTATION",
            action: "feature_registry.feature.update",
            featureId: id,
            featureKey: updated.key,
            operatorId: req.user?._id || req.user?.id,
        },
        "[FeatureRegistry] Feature updated by platform operator"
    );

    return res.json({ success: true, data: updated });
}

// ─── POST /feature-registry/matrix ──────────────────────────────────────────

/**
 * Bulk update plan assignments for a feature or module (matrix toggle).
 *
 * Body: { type: "feature"|"module", key: string, plans: { basic, pro, enterprise } }
 */
async function updateMatrix(req, res) {
    const { type, key, plans } = req.body;

    if (!type || !key || !plans) {
        return res.status(400).json({
            success: false,
            error: "type, key, and plans are required",
        });
    }

    if (!["feature", "module"].includes(type)) {
        return res.status(400).json({
            success: false,
            error: "type must be 'feature' or 'module'",
        });
    }

    let updated;
    if (type === "feature") {
        updated = await service.updateFeaturePlans(key, plans);
    } else {
        updated = await service.updateModulePlans(key, plans);
    }

    logger.info(
        {
            event: "CRITICAL_MUTATION",
            action: "feature_registry.matrix.update",
            type,
            key,
            plans,
            operatorId: req.user?._id || req.user?.id,
        },
        "[FeatureRegistry] Matrix plan assignment updated"
    );

    return res.json({ success: true, data: updated });
}

// ─── POST /feature-registry/seed ────────────────────────────────────────────

/**
 * Manually trigger registry seeding (idempotent).
 */
async function seedRegistry(req, res) {
    const { seedFeatureRegistry } = require("../services/featureRegistrySeeder");
    const result = await seedFeatureRegistry();

    logger.info(
        {
            event: "CRITICAL_MUTATION",
            action: "feature_registry.seed",
            ...result,
            operatorId: req.user?._id || req.user?.id,
        },
        "[FeatureRegistry] Manual seed triggered"
    );

    return res.json({ success: true, data: result });
}

module.exports = {
    getRegistry,
    listModules,
    listFeatures,
    updateModule,
    toggleModule,
    updateFeature,
    updateMatrix,
    seedRegistry,
};
