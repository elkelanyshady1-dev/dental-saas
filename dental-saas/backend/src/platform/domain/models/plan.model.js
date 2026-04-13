/**
 * plan.model.js — MIGRATION TOMBSTONE
 *
 * ⛔ THIS FILE MUST NOT REGISTER A MONGOOSE MODEL ⛔
 *
 * The legacy "Plan" collection has been superseded by:
 *   PlanTemplate  →  src/platform/billing/models/PlanTemplate.model.js
 *   PlanVersion   →  src/platform/billing/models/PlanVersion.model.js
 *
 * Registering the "Plan" model at startup triggers the guardian:
 *   NO_LEGACY_PLAN_MODEL_PRESENT → CRITICAL failure → UI refresh loop
 *
 * Migration status: PHASE 7 COMPLETE — plan.model.js is RETIRED.
 *
 * All callers must be migrated to PlanTemplate / PlanVersion.
 *
 * Known callers that still reference this file (track migration progress):
 *   - platformPlan.controller.js          → migrate to PlanTemplate/PlanVersion CRUD
 *   - platformPublicPricing.controller.js → ✅ MIGRATED v6.2 to PlanVersion + PlanTemplate
 *   - platformPlan.aggregate.service.js   → assignPlan is deprecated (use OrgContract flow)
 *   - planCatalog.projection.js           → migrate to PlanTemplate catalog
 *   - StripeProvider.js createCheckoutSession → migrate to PlanVersion.providerPriceIds
 *
 * PLANE: Platform
 */

"use strict";

const PlanTemplate = require("../../billing/models/PlanTemplate.model").default;
const PlanVersion = require("../../billing/models/PlanVersion.model").default;

/**
 * Legacy Plan compatibility shim.
 *
 * Instead of registering a "Plan" Mongoose model, we expose a proxy
 * that delegates to PlanTemplate (for catalog reads) and PlanVersion
 * (for pricing/pricing reads) as a temporary bridge during migration.
 *
 * Methods NOT on this shim throw immediately with a migration message
 * so engineers can identify remaining callers rapidly in logs.
 *
 * REMOVE THIS FILE once all callers are migrated.
 */
const LegacyPlanShim = {

    /**
     * find() — delegates to PlanTemplate for backward-compatible catalog reads.
     * Callers that used Plan.find({ isActive: true }) will get PlanTemplate list.
     */
    find(filter = {}) {
        const templateFilter = {};
        // Map legacy isActive → templateStatus
        if (filter.isActive !== undefined) {
            templateFilter.status = filter.isActive ? "published" : "draft";
        }
        const query = PlanTemplate.find(templateFilter);
        // Fluent chain support (sort, lean, etc.)
        return query;
    },

    findById(id) {
        return PlanTemplate.findById(id);
    },

    findOne(filter = {}) {
        return PlanTemplate.findOne(filter);
    },

    countDocuments(filter = {}) {
        return PlanTemplate.countDocuments(filter);
    },

    /**
     * Mutation methods throw — callers must migrate to PlanTemplate/PlanVersion CRUD.
     * Throwing here lets the server start but loudly fails the specific legacy operation
     * so it can be identified and migrated.
     */
    create() {
        throw new Error(
            "[MIGRATION] plan.model.js: Plan.create() is retired. " +
            "Use platformPlanTemplate.controller.js → POST /api/platform/plan-templates instead."
        );
    },

    findByIdAndUpdate() {
        throw new Error(
            "[MIGRATION] plan.model.js: Plan.findByIdAndUpdate() is retired. " +
            "Use platformPlanVersion.controller.js → PATCH /api/platform/plan-versions/:id instead."
        );
    },

    findOneAndUpdate() {
        throw new Error(
            "[MIGRATION] plan.model.js: Plan.findOneAndUpdate() is retired. " +
            "Use the PlanTemplate/PlanVersion CRUD controllers instead."
        );
    },

    startSession() {
        // Delegate to PlanTemplate's connection (same MongoDB connection)
        return PlanTemplate.startSession();
    }
};

module.exports = LegacyPlanShim;
