/**
 * plan.controller.js
 * v20.1 Phase 7 — Plan Builder (Versioned + Region-Aware)
 */

"use strict";

const Plan = require("../models/plan.model").default;
const Organization = require("@shared/models/Organization").default;

// Per-org DB model resolution for cross-org aggregation
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("@shared/models/User");
const BranchDef = require("@shared/models/Branch");

const { createAuditRecord } = require("../../../services/auditService");
const { validatePlanCompatibility } = require("@core/subscription/validatePlanCompatibility");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validates no country appears in more than one region block.
 * @param {Array} regions - pricing.regions array
 * @throws Error if duplicate country detected
 */
function validateRegionCountryOverlap(regions) {
    if (!regions || !Array.isArray(regions)) return;
    const seen = new Map();
    for (const region of regions) {
        if (!region.countries) continue;
        for (const country of region.countries) {
            if (seen.has(country)) {
                throw new Error(
                    `Country '${country}' appears in both region '${seen.get(country)}' and '${region.regionCode}'. Each country must belong to exactly one region.`
                );
            }
            seen.set(country, region.regionCode);
        }
    }
}

/**
 * 1️⃣ Create Plan
 */
exports.createPlan = async (req, res) => {
    try {
        const { name, code, description, limits, modules, pricing, visibility, inflationPolicy } = req.body;

        const existing = await Plan.findOne({ code: code.toLowerCase() });
        if (existing) {
            return res.status(400).json({ message: `Plan with code '${code}' already exists.` });
        }

        // v20.1 Phase 7 — Backend country overlap validation
        if (pricing?.regions) {
            validateRegionCountryOverlap(pricing.regions);
        }

        const plan = await Plan.create({
            name,
            code: code.toLowerCase(),
            description,
            limits,
            modules,
            pricing,
            visibility,
            inflationPolicy,
            isActive: true
        });

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "PLAN_CREATED",
            entity: "plan",
            entityId: plan._id,
            details: { name, code: plan.code },
            success: true
        });

        res.status(201).json({ message: "Plan created successfully", plan });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 2️⃣ Update Plan (with OAV)
 * v20.1 Phase 7 — Code immutability enforced, country overlap validated
 */
exports.updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { expectedVersion, ...updates } = req.body;

        if (expectedVersion === undefined) {
            return res.status(400).json({ message: "expectedVersion is required for OAV." });
        }

        const previousStateDoc = await Plan.findById(id);
        if (!previousStateDoc) return res.status(404).json({ message: "Plan not found." });
        const previousState = previousStateDoc.toObject();

        // v20.1 Phase 7 — Code is immutable after creation
        if (updates.code !== undefined && updates.code !== previousState.code) {
            return res.status(400).json({ message: "Plan code is immutable after creation." });
        }
        delete updates.code; // Never allow code in $set regardless

        // v20.1 Phase 7 — Backend country overlap validation
        if (updates.pricing?.regions) {
            validateRegionCountryOverlap(updates.pricing.regions);
        }

        const result = await Plan.findOneAndUpdate(
            { _id: id, version: expectedVersion },
            {
                $set: updates,
                $inc: { version: 1 }
            },
            { new: true }
        );

        if (!result) {
            return res.status(409).json({
                message: "Version conflict. Plan was modified by another user.",
                currentVersion: previousState.version
            });
        }

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "PLAN_UPDATED",
            entity: "plan",
            entityId: id,
            details: { previous: previousState, new: result },
            success: true
        });

        res.json({ message: "Plan updated successfully", plan: result });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 3️⃣ Patch Plan Status
 */
exports.patchPlanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive, expectedVersion } = req.body;

        const previousState = await Plan.findById(id);
        if (!previousState) return res.status(404).json({ message: "Plan not found." });

        const result = await Plan.findOneAndUpdate(
            { _id: id, version: expectedVersion },
            { $set: { isActive }, $inc: { version: 1 } },
            { new: true }
        );

        if (!result) return res.status(409).json({ message: "Conflict or Plan not found." });

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "PLAN_STATUS_CHANGED",
            entity: "plan",
            entityId: id,
            details: {
                previousStatus: previousState.isActive,
                newStatus: isActive,
                name: result.name,
                code: result.code
            },
            success: true
        });

        res.json({ message: `Plan ${isActive ? 'activated' : 'deactivated'}`, plan: result });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 4️⃣ Assign Plan to Organization
 */
exports.assignPlanToOrg = async (req, res) => {
    try {
        const { orgId } = req.params;
        const { planId, expectedVersion } = req.body;

        const planAggregateService = require("../services/platformPlan.aggregate.service");

        const org = await planAggregateService.assignPlan({
            organizationId: orgId,
            newPlanId: planId,
            expectedVersion,
            actorId: req.platformUser._id
        });

        res.json({ message: "Organization plan updated successfully", organization: org });
    } catch (err) {
        if (err.message === "ORGANIZATION_NOT_FOUND" || err.message === "PLAN_NOT_FOUND") {
            return res.status(404).json({ message: err.message });
        }
        if (err.message === "VERSION_CONFLICT") {
            return res.status(409).json({ message: "Version conflict during plan assignment." });
        }
        res.status(500).json({ message: err.message });
    }
};

/**
 * 5️⃣ Get All Plans
 * v20.1 Phase 7 — Supports ?includeInactive=true for admin list
 */
exports.getAllPlans = async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === "true";
        const filter = includeInactive ? {} : { isActive: true };
        const plans = await Plan.find(filter).sort({ createdAt: -1 });

        // Attach usage counts for admin list
        const plansWithUsage = await Promise.all(plans.map(async (plan) => {
            const orgCount = await Organization.countDocuments({ planId: plan._id });
            return { ...plan.toObject(), _orgCount: orgCount };
        }));

        res.json(plansWithUsage);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 6️⃣ Get Plan Usage
 * Cross-org aggregation: counts Users + Branches across all per-org DBs for a plan.
 */
exports.getPlanUsage = async (req, res) => {
    try {
        const { id } = req.params;

        const organizationsCount = await Organization.countDocuments({ planId: id });
        const orgIds = await Organization.find({ planId: id }).distinct("_id");

        // Parallel cross-org aggregation via per-org DB connections
        const counts = await Promise.all(
            orgIds.map(async (orgId) => {
                try {
                    const conn = dbManager.getConnection(String(orgId));
                    try {
                        const UserModel = getModel(conn, UserDef);
                        const BranchModel = getModel(conn, BranchDef);
                        const [users, branches] = await Promise.all([
                            UserModel.countDocuments({ isActive: true }),
                            BranchModel.countDocuments({ isActive: true }),
                        ]);
                        return { users, branches };
                    } finally {
                        try { dbManager.releaseConnection(String(orgId)); } catch (_) {}
                    }
                } catch {
                    return { users: 0, branches: 0 };
                }
            })
        );

        const totalUsers = counts.reduce((sum, c) => sum + c.users, 0);
        const totalBranches = counts.reduce((sum, c) => sum + c.branches, 0);

        res.json({
            planId: id,
            organizationsCount,
            totalUsersAcrossPlan: totalUsers,
            totalBranchesAcrossPlan: totalBranches
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 7️⃣ Get Plan by ID
 * v20.1 Phase 7 — Single plan fetch for edit form
 */
exports.getPlanById = async (req, res) => {
    try {
        const plan = await Plan.findById(req.params.id);
        if (!plan) return res.status(404).json({ message: "Plan not found." });
        res.json(plan);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 8️⃣ Duplicate Plan
 * v20.1 Phase 7 — Clones plan with new code, resets version, clears stripe IDs
 */
exports.duplicatePlan = async (req, res) => {
    try {
        const { newCode } = req.body;
        if (!newCode) return res.status(400).json({ message: "newCode is required." });

        const existing = await Plan.findOne({ code: newCode.toLowerCase() });
        if (existing) return res.status(400).json({ message: `Code '${newCode}' already exists.` });

        const source = await Plan.findById(req.params.id);
        if (!source) return res.status(404).json({ message: "Source plan not found." });

        const cloned = source.toObject();
        delete cloned._id;
        delete cloned.__v;
        delete cloned.createdAt;
        delete cloned.updatedAt;

        cloned.code = newCode.toLowerCase();
        cloned.name = `${cloned.name} (Copy)`;
        cloned.version = 0;
        cloned.isActive = false;

        // Clear Stripe IDs — new plan needs new Stripe products
        if (cloned.pricing?.regions) {
            cloned.pricing.regions = cloned.pricing.regions.map(r => ({
                ...r,
                stripePriceIdMonthly: undefined,
                stripePriceIdYearly: undefined,
                stripePriceIdBiennial: undefined
            }));
        }

        // Clear inflation policy on duplicate to prevent unintentional inheritance
        cloned.inflationPolicy = { defaultPercent: 0, applyAfterYears: 1 };

        const plan = await Plan.create(cloned);

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "PLAN_DUPLICATED",
            entity: "plan",
            entityId: plan._id,
            details: { sourceId: req.params.id, newCode: plan.code },
            success: true
        });

        res.status(201).json({ message: "Plan duplicated successfully", plan });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
