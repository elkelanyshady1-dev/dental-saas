/**
 * tenantModelWrapper.js — Scoped Query Wrapper for Platform-DB Models
 * Phase 5 — Runtime Enforcement Layer (Tenant Isolation Hardening)
 *
 * PURPOSE:
 * Platform-plane models (OrgContract, OrgAddOn, PlatformInvoice, etc.) live
 * in the shared platform database and store data for ALL organizations. Unlike
 * per-org DB models (where the database IS the isolation), platform models
 * MUST include organizationId in every query to prevent cross-tenant leakage.
 *
 * This wrapper creates a scoped model proxy that auto-injects organizationId
 * into all query operations, making it impossible to accidentally query
 * across tenants.
 *
 * WHEN TO USE:
 *   - Org-plane code querying platform-DB models (e.g., reading own contract)
 *   - Portal-plane code querying platform-DB models (e.g., reading invoices)
 *
 * WHEN NOT TO USE:
 *   - Platform-admin code that legitimately queries across all orgs
 *   - Per-org DB models (database isolation already guarantees scoping)
 *   - Background jobs that operate on all orgs (use direct model access)
 *
 * INVARIANTS:
 *   1. organizationId is injected as a non-overridable filter condition
 *   2. The original model is NOT mutated — a proxy is returned
 *   3. Supports: find, findOne, findById, countDocuments, aggregate
 *   4. Throws if organizationId is missing (fail-closed)
 *
 * @module shared/security/tenantModelWrapper
 */

"use strict";

/**
 * Create a tenant-scoped proxy for a platform-DB Mongoose model.
 *
 * @param {import("mongoose").Model} Model - The Mongoose model to scope
 * @param {string} organizationId - The tenant's organization ID (from req.context)
 * @returns {TenantScopedModel} A proxy that auto-injects organizationId
 * @throws {Error} If organizationId is falsy
 *
 * @example
 * const OrgContract = require("@shared/models/billingModels").OrgContractDef.default;
 * const scopedContract = scopeToTenant(OrgContract, req.context.organizationId);
 * const contract = await scopedContract.findOne({ status: "active" }).lean();
 * // Internally: OrgContract.findOne({ status: "active", organizationId: "<orgId>" })
 */
function scopeToTenant(Model, organizationId) {
    if (!organizationId) {
        throw new Error(
            `[tenantModelWrapper] FAIL-CLOSED: organizationId is required to scope ${Model.modelName || "model"}. ` +
            "This prevents cross-tenant data leakage on platform-DB models."
        );
    }

    const orgId = String(organizationId);

    return {
        /**
         * Scoped find — injects organizationId into filter.
         */
        find(filter = {}, ...args) {
            return Model.find({ ...filter, organizationId: orgId }, ...args);
        },

        /**
         * Scoped findOne — injects organizationId into filter.
         */
        findOne(filter = {}, ...args) {
            return Model.findOne({ ...filter, organizationId: orgId }, ...args);
        },

        /**
         * Scoped findById — adds organizationId as an AND condition.
         * Uses findOne internally since findById doesn't accept compound filters.
         */
        findById(id, ...args) {
            return Model.findOne({ _id: id, organizationId: orgId }, ...args);
        },

        /**
         * Scoped findOneAndUpdate — injects organizationId into filter.
         */
        findOneAndUpdate(filter = {}, update, options) {
            return Model.findOneAndUpdate(
                { ...filter, organizationId: orgId },
                update,
                options
            );
        },

        /**
         * Scoped findByIdAndUpdate — adds organizationId as an AND condition.
         */
        findByIdAndUpdate(id, update, options) {
            return Model.findOneAndUpdate(
                { _id: id, organizationId: orgId },
                update,
                options
            );
        },

        /**
         * Scoped countDocuments — injects organizationId into filter.
         */
        countDocuments(filter = {}) {
            return Model.countDocuments({ ...filter, organizationId: orgId });
        },

        /**
         * Scoped aggregate — prepends a $match stage with organizationId.
         */
        aggregate(pipeline = []) {
            const scopedPipeline = [
                { $match: { organizationId: orgId } },
                ...pipeline,
            ];
            return Model.aggregate(scopedPipeline);
        },

        /**
         * Scoped create — injects organizationId into document(s).
         * Supports single doc, array of docs, and options with session.
         */
        create(docs, options) {
            if (Array.isArray(docs)) {
                const scoped = docs.map((d) => ({ ...d, organizationId: orgId }));
                return Model.create(scoped, options);
            }
            return Model.create({ ...docs, organizationId: orgId }, options);
        },

        /**
         * Scoped updateOne — injects organizationId into filter.
         */
        updateOne(filter = {}, update, options) {
            return Model.updateOne(
                { ...filter, organizationId: orgId },
                update,
                options
            );
        },

        /**
         * Scoped updateMany — injects organizationId into filter.
         */
        updateMany(filter = {}, update, options) {
            return Model.updateMany(
                { ...filter, organizationId: orgId },
                update,
                options
            );
        },

        /**
         * Scoped deleteOne — injects organizationId into filter.
         */
        deleteOne(filter = {}) {
            return Model.deleteOne({ ...filter, organizationId: orgId });
        },

        /**
         * Scoped deleteMany — injects organizationId into filter.
         */
        deleteMany(filter = {}) {
            return Model.deleteMany({ ...filter, organizationId: orgId });
        },

        /** Expose the underlying model name for debugging. */
        get modelName() {
            return Model.modelName;
        },

        /** Expose the underlying model for escape-hatch scenarios (documented). */
        get _unscopedModel() {
            return Model;
        },
    };
}

module.exports = { scopeToTenant };
