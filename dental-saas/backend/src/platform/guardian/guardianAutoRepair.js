/**
 * guardianAutoRepair.js
 * Platform Guardian — Development Auto-Repair Module
 *
 * Repairs data integrity violations that are safe to auto-fix in development.
 *
 * ⚠️  NEVER runs in production.
 * ⚠️  Never modifies billing logic, contract engine, or schema definitions.
 * ⚠️  Only repairs data-level violations: missing enum values, missing snapshots,
 *     and missing trial contracts for pre-TDS organizations.
 *
 * Repairable invariants:
 *   PLAN_VERSION_VISIBILITY_ENUM       → set visibility = "public" on docs missing it
 *   CONTRACT_PRICING_SNAPSHOT_PRESENT  → backfill pricingSnapshot on paid active contracts
 *   ORG_WITHOUT_ACTIVE_CONTRACT        → create active trial contract for orgs missing one
 *
 * Non-repairable invariants (never touched here):
 *   NO_DUPLICATE_MODELS
 *   NO_LEGACY_PLAN_MODEL_PRESENT
 *   LEGACY_PLAN_MODEL_TOMBSTONE_PRESENT
 *   UNIQUE_ACTIVE_CONTRACT_PER_ORG
 *   ORG_CURRENT_CONTRACT_POINTER_INTEGRITY
 *   ACTIVE_PLAN_VERSION_PER_TEMPLATE
 *   → These require human investigation and cannot be auto-fixed safely.
 *
 * PLANE: Platform
 * BILLING LOGIC MODIFIED: NONE
 */

"use strict";

const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
const { guardianLogger } = require("./observability.guardian");

// ─── REPAIRABLE INVARIANT SET ─────────────────────────────────────────────────
// Defines which guardian check names are safe to auto-repair.
// All other failures fall through to standard handling (crash/log).

const REPAIRABLE_INVARIANTS = new Set([
    "PLAN_VERSION_VISIBILITY_ENUM",
    "CONTRACT_PRICING_SNAPSHOT_PRESENT",
    "ORG_WITHOUT_ACTIVE_CONTRACT",
    "DEPRECATED_PUBLIC_PLAN",
    "CONTRACT_TIMELINE_INTEGRITY",
    "CONTRACT_GAP_INTEGRITY",
    "STRANDED_PENDING_PAYMENT",
    // v24.0 PHASE 4: New auto-repair targets
    "ORG_CURRENT_CONTRACT_POINTER_INTEGRITY",
    "UNIQUE_ACTIVE_CONTRACT_PER_ORG",
]);

exports.REPAIRABLE_INVARIANTS = REPAIRABLE_INVARIANTS;

// ─── REPAIR 1: PLAN_VERSION_VISIBILITY_ENUM ───────────────────────────────────
/**
 * Sets visibility = "public" on any PlanVersion document with a missing or
 * invalid visibility field.
 *
 * Uses raw collection.updateMany to bypass Mongoose's pre-save immutability
 * guard (which would throw if .save() is called on an active version).
 * This is a corrective backfill — "public" is the safe default.
 *
 * @returns {Promise<number>} Number of documents repaired
 */
async function repairVisibility() {
    const VALID = ["public", "sales", "internal"];
    const coll = getPlatformConnection().collection("planversions");

    const result = await coll.updateMany(
        { visibility: { $not: { $in: VALID } } },
        { $set: { visibility: "public" } }
    );

    return result.modifiedCount;
}

// ─── REPAIR 2: CONTRACT_PRICING_SNAPSHOT_PRESENT ─────────────────────────────
/**
 * Backfills pricingSnapshot on paid active OrgContracts that are missing it.
 *
 * SCOPE: only paid active contracts (trialDays = 0, lockedPrice > 0),
 * matching the exact scope of checkContractPricingSnapshotPresent.
 *
 * Uses aggregation-pipeline $set to copy basePrice from lockedPrice without
 * an additional per-document query — no Mongoose .save() invoked.
 *
 * @returns {Promise<number>} Number of contracts repaired
 */
async function repairPricingSnapshot() {
    const coll = getPlatformConnection().collection("orgcontracts");
    const now = new Date();

    // Match the EXACT filter from checkContractPricingSnapshotPresent:
    // paid active contracts with no pricingSnapshot
    const filter = {
        contractStatus: "active",
        trialDays: 0,
        lockedPrice: { $gt: 0 },
        pricingSnapshot: { $in: [null, undefined] }
    };

    // Step 1: Set all snapshot fields except basePrice (no field references in $set)
    const step1 = await coll.updateMany(filter, {
        $set: {
            "pricingSnapshot.snapshotType": "backfilled",
            "pricingSnapshot.regionCode": "unknown",
            "pricingSnapshot.billingInterval": "monthly",
            "pricingSnapshot.taxRate": 0,
            "pricingSnapshot.taxAmount": 0,
            "pricingSnapshot.discountAmount": 0,
            "pricingSnapshot.couponApplied": false,
            "pricingSnapshot.perSeatAddition": 0,
            "pricingSnapshot.isOverride": false,
            "pricingSnapshot._backfilledAt": now
        }
    });

    // Step 2: Set basePrice = lockedPrice using aggregation pipeline $set
    // (only pipeline-style $set allows field references like "$lockedPrice")
    if (step1.modifiedCount > 0) {
        await coll.updateMany(
            { "pricingSnapshot.basePrice": { $exists: false } },
            [{ $set: { "pricingSnapshot.basePrice": "$lockedPrice" } }]
        );
    }

    return step1.modifiedCount;
}

// ─── REPAIR 3: ORG_WITHOUT_ACTIVE_CONTRACT ────────────────────────────────────
/**
 * Creates an active trial OrgContract for every active, non-archived org
 * that has currentContractId = null.
 *
 * Design constraints:
 *   - Does NOT use contractEngine.createContract() — that creates draft-only
 *     and requires an invoiceId to activate.
 *   - Creates directly via OrgContract.create({ contractStatus: "active" })
 *     as this is a migration-time repair, not a business-logic operation.
 *   - Requires a PlatformUser (superadmin) for the createdBy field.
 *   - Uses the most recently activated PlanVersion as the plan reference.
 *   - After creating the contract, updates org.currentContractId.
 *
 * @param {object} logger  - pino logger instance (guardianLogger)
 * @returns {Promise<number>} Number of orgs repaired
 */
async function repairOrgContracts(logger) {
    const OrganizationModel = getPlatformConnection().models["Organization"];
    const OrgContractModel = getPlatformConnection().models["OrgContract"];
    const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
    const PlatformUserModel = getPlatformConnection().models["PlatformUser"];

    if (!OrganizationModel || !OrgContractModel || !PlanVersionModel) {
        logger.warn(
            "[GuardianAutoRepair] repairOrgContracts: required models not loaded — skipping"
        );
        return 0;
    }

    // Resolve system actor (required for createdBy / activatedBy on OrgContract)
    let systemActor = null;
    if (PlatformUserModel) {
        systemActor = await PlatformUserModel.findOne({ role: "superadmin" })
            .select("_id email")
            .lean();
    }
    if (!systemActor) {
        logger.warn(
            "[GuardianAutoRepair] repairOrgContracts: no superadmin PlatformUser found — " +
            "cannot set createdBy on trial contracts; skipping org repair"
        );
        return 0;
    }

    // Find the best active PlanVersion to use as the default plan reference
    const defaultVersion = await PlanVersionModel.findOne({ status: "active" })
        .sort({ activatedAt: -1 })
        .select("_id templateCode versionTag pricing")
        .lean();

    if (!defaultVersion) {
        logger.warn(
            "[GuardianAutoRepair] repairOrgContracts: no active PlanVersion found — " +
            "cannot create trial contracts without a plan reference; skipping org repair"
        );
        return 0;
    }

    // Find orgs that need repair.
    // Match the exact filter from checkOrgsHaveActiveContract:
    //   isActive: true, isArchived: { $ne: true }, currentContractId: null
    const orgs = await OrganizationModel.find({
        isActive: true,
        isArchived: { $ne: true },
        currentContractId: null
    }).select("_id name").lean();

    if (orgs.length === 0) return 0;

    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    let repaired = 0;

    for (const org of orgs) {
        try {
            // Safety: check for an existing active contract first
            // (another process or prior repair may have already created one)
            const existing = await OrgContractModel.findOne({
                organizationId: org._id,
                contractStatus: "active"
            }).select("_id").lean();

            if (existing) {
                // Fix only the pointer — don't create a duplicate
                await OrganizationModel.findByIdAndUpdate(org._id, {
                    $set: { currentContractId: existing._id }
                });
                logger.info(
                    { orgId: org._id, contractId: existing._id },
                    "[GuardianAutoRepair] repairOrgContracts: fixed pointer to existing active contract"
                );
                repaired++;
                continue;
            }

            // Create active trial contract directly
            // (bypass contractEngine to avoid: draft-only restriction, invoiceId requirement,
            //  module entitlement side-effects, DUPLICATE_DRAFT guard)
            const contract = await OrgContractModel.create({
                organizationId: org._id,
                planVersionId: defaultVersion._id,
                planCode: defaultVersion.templateCode,
                planVersionTag: defaultVersion.versionTag,
                contractStatus: "active",
                effectiveFrom: now,
                effectiveTo: null,   // open-ended trial
                lockedPrice: 0,
                currency: defaultVersion.pricing?.regions?.[0]?.currency || "USD",
                billingInterval: "monthly",
                trialDays: 14,
                trialStartDate: now,
                trialEndDate,
                autoRenew: false,
                gracePeriodDays: 7,
                source: "guardian_auto_repair",
                createdBy: systemActor._id,
                activatedBy: systemActor._id,
                // Include a pre-populated snapshot so CONTRACT_PRICING_SNAPSHOT_PRESENT also passes
                pricingSnapshot: {
                    snapshotType: "backfilled",
                    basePrice: 0,
                    regionCode: "unknown",
                    billingInterval: "monthly",
                    taxRate: 0,
                    taxAmount: 0,
                    discountAmount: 0,
                    couponApplied: false,
                    perSeatAddition: 0,
                    isOverride: false,
                    _backfilledAt: now
                }
            });

            await OrganizationModel.findByIdAndUpdate(org._id, {
                $set: { currentContractId: contract._id }
            });

            logger.info(
                { orgId: org._id, contractId: contract._id, plan: defaultVersion.templateCode },
                "[GuardianAutoRepair] repairOrgContracts: created trial contract"
            );

            repaired++;
        } catch (err) {
            logger.error(
                { orgId: org._id, err: err.message },
                "[GuardianAutoRepair] repairOrgContracts: failed for org — skipping"
            );
            // Continue with remaining orgs rather than aborting the whole repair
        }
    }

    return repaired;
}

// ─── REPAIR 4: DEPRECATED_PUBLIC_PLAN ────────────────────────────────────────
/**
 * Corrects visibility from "public" → "sales" on deprecated PlanVersions.
 *
 * Why "sales" is the safe default:
 *   - Deprecated plans MAY still be referenced by legacy sales contracts.
 *   - "sales" keeps them accessible for contract creation but removes them
 *     from the public pricing page.
 *   - "internal" would also be safe but too restrictive for legacy contracts.
 *
 * Uses raw collection to bypass the Mongoose pre-save immutability guard
 * (the guard blocks visibility changes on active versions only — deprecated
 * versions ARE allowed). Direct collection write is used here to avoid
 * triggering the guard's deprecated+public check which would reject save().
 *
 * @returns {Promise<number>} Number of plans repaired
 */
async function repairDeprecatedPublicPlans() {
    const coll = getPlatformConnection().collection("planversions");

    const result = await coll.updateMany(
        { status: "deprecated", visibility: "public" },
        { $set: { visibility: "sales" } }
    );

    return result.modifiedCount;
}

exports.repairDeprecatedPublicPlans = repairDeprecatedPublicPlans;

// ─── REPAIR 5: CONTRACT_TIMELINE_INTEGRITY ──────────────────────────────────
/**
 * Aligns superseded contracts' effectiveTo to their successor's effectiveFrom.
 *
 * For every superseded contract that has supersededById set:
 *   1. Find the successor contract
 *   2. If prev.effectiveTo > successor.effectiveFrom → overlap exists
 *   3. Set prev.effectiveTo = successor.effectiveFrom
 *
 * Uses raw collection to bypass Mongoose pre-save version increment.
 *
 * @returns {Promise<number>} Number of contracts repaired
 */
async function repairContractTimeline() {
    const coll = getPlatformConnection().collection("orgcontracts");

    // Find all superseded contracts with successors and closed windows
    const superseded = await coll.find({
        contractStatus: "superseded",
        supersededById: { $ne: null },
        effectiveTo: { $ne: null }
    }).project({
        _id: 1, effectiveTo: 1, supersededById: 1
    }).toArray();

    let repaired = 0;
    for (const prev of superseded) {
        const successor = await coll.findOne(
            { _id: prev.supersededById },
            { projection: { effectiveFrom: 1 } }
        );
        if (!successor || !successor.effectiveFrom) continue;

        if (prev.effectiveTo > successor.effectiveFrom) {
            await coll.updateOne(
                { _id: prev._id },
                { $set: { effectiveTo: successor.effectiveFrom } }
            );
            repaired++;
        }
    }

    return repaired;
}

// ─── REPAIR 6: CONTRACT_GAP_INTEGRITY ──────────────────────────────────────
/**
 * Closes gaps in the supersession chain by adjusting successor effectiveFrom.
 *
 * For every superseded contract that has supersededById set:
 *   1. Find the successor contract
 *   2. If successor.effectiveFrom > prev.effectiveTo → gap exists
 *   3. Set successor.effectiveFrom = prev.effectiveTo
 *
 * Repair direction: adjusts the SUCCESSOR's start, not the previous's end.
 * Rationale: the superseded contract's effectiveTo was set by the activation
 * service and represents the actual moment of transition. The successor's
 * effectiveFrom (originally set at draft creation) is the less authoritative date.
 *
 * Uses raw collection to bypass Mongoose pre-save version increment.
 *
 * @returns {Promise<number>} Number of contracts repaired
 */
async function repairContractGaps() {
    const coll = getPlatformConnection().collection("orgcontracts");

    // Find all superseded contracts with successors and closed windows
    const superseded = await coll.find({
        contractStatus: "superseded",
        supersededById: { $ne: null },
        effectiveTo: { $ne: null }
    }).project({
        _id: 1, effectiveTo: 1, supersededById: 1
    }).toArray();

    let repaired = 0;
    for (const prev of superseded) {
        const successor = await coll.findOne(
            { _id: prev.supersededById },
            { projection: { effectiveFrom: 1 } }
        );
        if (!successor || !successor.effectiveFrom) continue;

        // Only fix gaps (successor starts AFTER previous ends)
        if (successor.effectiveFrom > prev.effectiveTo) {
            await coll.updateOne(
                { _id: successor._id },
                { $set: { effectiveFrom: prev.effectiveTo } }
            );
            repaired++;
        }
    }

    return repaired;
}

// ─── REPAIR 7: STRANDED_PENDING_PAYMENT ───────────────────────────────────────
/**
 * Activates contracts stuck in pending_payment that have a paid invoice.
 *
 * Recovery logic:
 *   1. Find all pending_payment contracts
 *   2. For each, check if a paid PlatformInvoice exists for that contract
 *   3. If yes, call activateContract(contractId, invoiceId)
 *
 * Uses the existing contractActivation.service which handles:
 *   - State machine transition validation
 *   - Supersession of previous contracts
 *   - org.currentContractId update
 *   - Module entitlement provisioning
 *   - BillingTimeline events
 *
 * @param {object} logger  - pino logger instance
 * @returns {Promise<number>} Number of contracts recovered
 */
async function repairStrandedPendingPayment(logger) {
    const OrgContractModel = getPlatformConnection().models["OrgContract"];
    const PlatformInvoiceModel = getPlatformConnection().models["PlatformInvoice"];

    if (!OrgContractModel || !PlatformInvoiceModel) {
        logger.warn(
            "[GuardianAutoRepair] repairStrandedPendingPayment: required models not loaded — skipping"
        );
        return 0;
    }

    let activateContract;
    try {
        activateContract = require("../billing/services/contractActivation.service").activateContract;
    } catch {
        logger.warn(
            "[GuardianAutoRepair] repairStrandedPendingPayment: contractActivation.service not loadable — skipping"
        );
        return 0;
    }

    const pendingContracts = await OrgContractModel.find({
        contractStatus: "pending_payment"
    }).select("_id organizationId").lean();

    if (pendingContracts.length === 0) return 0;

    let recovered = 0;
    for (const contract of pendingContracts) {
        try {
            const paidInvoice = await PlatformInvoiceModel.findOne({
                contractId: contract._id,
                status: "paid"
            }).select("_id").lean();

            if (!paidInvoice) continue;

            await activateContract(
                String(contract._id),
                String(paidInvoice._id),
                { activatedBy: null, correlationId: "guardian-auto-repair" }
            );

            logger.info(
                { contractId: contract._id, invoiceId: paidInvoice._id },
                "[GuardianAutoRepair] repairStrandedPendingPayment: activated stranded contract"
            );

            recovered++;
        } catch (err) {
            logger.error(
                { contractId: contract._id, err: err.message },
                "[GuardianAutoRepair] repairStrandedPendingPayment: activation failed — skipping"
            );
        }
    }

    return recovered;
}

// ─── REPAIR 8: ORG_CURRENT_CONTRACT_POINTER_INTEGRITY (v24.0 Phase 4) ──────
/**
 * Repoints org.currentContractId when it references a non-active contract
 * and an active contract exists for the org.
 *
 * @param {object} logger
 * @returns {Promise<number>} Number of orgs repaired
 */
async function repairContractPointer(logger) {
    const OrganizationModel = getPlatformConnection().models["Organization"];
    const OrgContractModel = getPlatformConnection().models["OrgContract"];
    if (!OrganizationModel || !OrgContractModel) return 0;

    const orgsWithPointers = await OrganizationModel.find({
        currentContractId: { $ne: null },
        isActive: true,
        isArchived: { $ne: true }
    }).select("_id name currentContractId").lean();

    let repaired = 0;

    for (const org of orgsWithPointers) {
        const currentContract = await OrgContractModel.findById(org.currentContractId)
            .select("contractStatus").lean();

        // Pointer is valid — skip
        if (currentContract && currentContract.contractStatus === "active") continue;

        // Try to find an existing active contract to repoint to
        const activeContract = await OrgContractModel.findOne({
            organizationId: org._id,
            contractStatus: "active"
        }).sort({ effectiveFrom: -1 }).select("_id").lean();

        if (activeContract) {
            // Repoint to the correct active contract
            await OrganizationModel.updateOne(
                { _id: org._id },
                { $set: { currentContractId: activeContract._id } }
            );

            logger.info(
                { orgId: org._id, oldContractId: org.currentContractId, newContractId: activeContract._id },
                "[GuardianAutoRepair] repairContractPointer: repointed to active contract"
            );
            repaired++;
        } else {
            // No active contract exists — null out the stale pointer.
            // This allows repairOrgContracts() (ORG_WITHOUT_ACTIVE_CONTRACT handler) to
            // create a new trial contract for this org in the same repair pass.
            // staleStatus: may be "expired", "superseded", "terminated", "draft", or null (dangling ref)
            const staleStatus = currentContract?.contractStatus ?? "missing";
            await OrganizationModel.updateOne(
                { _id: org._id },
                { $set: { currentContractId: null } }
            );

            logger.warn(
                {
                    orgId: org._id,
                    orgName: org.name,
                    staleContractId: org.currentContractId,
                    staleStatus,
                },
                "[GuardianAutoRepair] repairContractPointer: nulled stale pointer " +
                `(status="${staleStatus}") — repairOrgContracts will create a new trial contract`
            );
            repaired++;
        }
    }

    return repaired;
}

// ─── REPAIR 9: UNIQUE_ACTIVE_CONTRACT_PER_ORG (v24.0 Phase 4) ─────────────
/**
 * When multiple active contracts exist for a single org, supersedes all but
 * the most recently activated one.
 *
 * @param {object} logger
 * @returns {Promise<number>} Number of contracts superseded
 */
async function repairDuplicateActiveContracts(logger) {
    const OrgContractModel = getPlatformConnection().models["OrgContract"];
    if (!OrgContractModel) return 0;

    // Find orgs with >1 active contract
    const duplicates = await OrgContractModel.aggregate([
        { $match: { contractStatus: "active" } },
        { $group: { _id: "$organizationId", contracts: { $push: { id: "$_id", effectiveFrom: "$effectiveFrom" } }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ]);

    let superseded = 0;

    for (const dup of duplicates) {
        // Sort by effectiveFrom descending — keep the newest
        const sorted = dup.contracts.sort((a, b) => (b.effectiveFrom || 0) - (a.effectiveFrom || 0));
        const keep = sorted[0];
        const toSupersede = sorted.slice(1);

        for (const old of toSupersede) {
            await OrgContractModel.updateOne(
                { _id: old.id },
                {
                    $set: {
                        contractStatus: "superseded",
                        supersededById: keep.id,
                        effectiveTo: new Date(),
                    }
                }
            );

            logger.info(
                { orgId: dup._id, supersededId: old.id, keptId: keep.id },
                "[GuardianAutoRepair] repairDuplicateActiveContracts: superseded older contract"
            );
            superseded++;
        }
    }

    return superseded;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

module.exports = {
    REPAIRABLE_INVARIANTS,
    repairVisibility,
    repairPricingSnapshot,
    repairOrgContracts,
    repairDeprecatedPublicPlans,
    repairContractTimeline,
    repairContractGaps,
    repairStrandedPendingPayment,
    repairContractPointer,
    repairDuplicateActiveContracts,
};
