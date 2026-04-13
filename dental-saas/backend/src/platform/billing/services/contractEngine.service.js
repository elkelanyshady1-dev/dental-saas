/**
 * contractEngine.service.js
 * Sprint 4 — Clean Contract Domain Service
 *
 * Consolidates the full OrgContract lifecycle into a single domain service.
 * All controllers delegate to this layer for contract mutations.
 *
 * Exported functions:
 *   createContract(data, actorId, options)   → OrgContract (draft)
 *   replaceContract(contractId, data, actorId, options) → OrgContract (draft replacement)
 *   activateContract(contractId, invoiceId, actorId, options) → { contract, organization }
 *   expireContract(contractId, reason, actorId, options) → OrgContract (terminated)
 *
 * Pricing rules:
 *   ALL pricing is read from OrgContract fields.
 *   No org.subscription fields are used.
 *   No hardcoded pricing logic — prices come from the contract's lockedPrice.
 *
 * PLANE: Platform
 * COLLECTION: orgcontracts
 */

"use strict";

const mongoose = require("mongoose");
const OrgContract = require("../models/OrgContract.model").default;
const Organization = require("@shared/models/Organization").default;
const PlanVersion = require("../models/PlanVersion.model").default;
const logger = require("@utils/logger");
const { assertValidTransition } = require("./contractStateMachine");

// Delegate activation to the existing activateContract service (Sprint 1)
// which handles module entitlements, supersession, and org.currentContractId update.
const { activateContract: _activateContract, ContractActivationError } = require("./contractActivation.service");
// Sprint 8: BillingTimeline projection
const { emitBillingTimelineEvent } = require("./billingTimeline.service");

// ─── Custom Errors ────────────────────────────────────────────────────────────

class ContractEngineError extends Error {
    constructor(message, code, statusCode = 400) {
        super(message);
        this.name = "ContractEngineError";
        this.code = code;
        this.status = statusCode;
    }
}

// ─── Immutable fields for active contracts ────────────────────────────────────
const IMMUTABLE_ACTIVE_FIELDS = new Set([
    "lockedPrice", "currency", "planVersionId",
    "planCode", "planVersionTag", "effectiveFrom", "trialDays"
]);

function assertNoImmutableChange(updates) {
    const violations = Object.keys(updates).filter(k => IMMUTABLE_ACTIVE_FIELDS.has(k));
    if (violations.length > 0) {
        throw new ContractEngineError(
            `Cannot modify immutable fields on an active contract: ${violations.join(", ")}`,
            "IMMUTABLE_FIELD_VIOLATION"
        );
    }
}

// ─── CREATE CONTRACT ──────────────────────────────────────────────────────────

/**
 * createContract
 *
 * Creates a new OrgContract in "draft" status.
 * Does NOT activate — activation requires a paid PlatformInvoice.
 *
 * @param {object} data
 *   @param {ObjectId} data.organizationId
 *   @param {ObjectId} [data.planVersionId]
 *   @param {string}   data.planCode
 *   @param {string}   [data.planVersionTag]
 *   @param {number}   data.lockedPrice
 *   @param {string}   data.currency            - ISO currency code (USD, EGP, etc.)
 *   @param {Date}     data.effectiveFrom
 *   @param {Date}     [data.effectiveTo]
 *   @param {number}   [data.trialDays]
 *   @param {boolean}  [data.autoRenew]
 *   @param {object}   [data.renewalTerms]
 *   @param {object}   [data.pricingOverride]
 *   @param {object}   [data.appliedCoupon]
 *   @param {number}   [data.gracePeriodDays]
 *   @param {ObjectId} [data.salesOwnerId]
 * @param {ObjectId} actorId      - PlatformUser creating the contract
 * @param {object}   [options]
 *   @param {mongoose.ClientSession} [options.session]
 * @returns {Promise<OrgContract>}
 */
async function createContract(data, actorId, options = {}) {
    const { session } = options;

    const {
        organizationId, planVersionId, planCode, planVersionTag,
        lockedPrice, currency, effectiveFrom, effectiveTo,
        trialDays = 0, autoRenew = true, renewalTerms,
        pricingOverride, appliedCoupon, gracePeriodDays = 7,
        salesOwnerId,
        // Pass-through fields from provisioning / activation callers
        source = null,
        paymentProvider = null,
        billingInterval = "monthly",
        pricingSnapshot = null,
        trialStartDate = null,
        trialEndDate: dataTrialEndDate = null,
        metadata = undefined,   // optional Map or plain object for audit traceability
        // v3.0: Invoice-first lifecycle — caller may set status directly.
        // When provided, TDS routing and draft duplicate guard are bypassed.
        // ONLY the BillingOrchestrator upgrade flow should use this.
        initialStatus = null,
        // v23.0: Access type — MUST be persisted to prevent Mongoose default overriding
        // the orchestrator's resolved value. Omitting this field → default "paid" → split-brain.
        accessType = null,
    } = data;

    // Validate: org must exist
    const org = await Organization.findById(organizationId)
        .select("_id name isArchived")
        .session(session || null);
    if (!org) {
        throw new ContractEngineError(`Organization ${organizationId} not found`, "ORG_NOT_FOUND", 404);
    }
    if (org.isArchived) {
        throw new ContractEngineError(`Organization ${organizationId} is archived`, "ORG_ARCHIVED");
    }

    // Validate: only one draft per org allowed (prevent duplicates)
    // Skip this check when initialStatus is provided — the caller manages its own duplicate guard.
    if (!initialStatus) {
        const existingDraft = await OrgContract.findOne({
            organizationId,
            contractStatus: "draft"
        }).session(session || null);
        if (existingDraft) {
            throw new ContractEngineError(
                `Organization already has a draft contract (${existingDraft._id}). Activate or terminate it first.`,
                "DUPLICATE_DRAFT"
            );
        }
    }

    // ── Status resolution ────────────────────────────────────────────────────────
    // v3.0: When initialStatus is provided (upgrade flow), use it directly.
    // This bypasses TDS pending_activation routing — the orchestrator owns status assignment.
    //
    // When NOT provided (legacy/provisioning callers): run TDS routing to determine
    // whether to use "draft" or "pending_activation" (trial end scheduling).

    let resolvedStatus = "draft";
    let resolvedEffectiveFrom = effectiveFrom || new Date();

    if (initialStatus) {
        // ── Direct status creation (invoice-first upgrade path) ──────────────────
        resolvedStatus = initialStatus;
        resolvedEffectiveFrom = effectiveFrom || new Date();
        logger.info(
            { organizationId, initialStatus },
            "[ContractEngine] Contract created with explicit initialStatus — TDS routing bypassed"
        );
    } else {
        // ── TDS: Pending Activation Routing ─────────────────────────────────────
        // If a paid contract (trialDays === 0) is created while an active trial is
        // still running, route it to pending_activation instead of draft.
        // effectiveFrom is set to the trial's end date — it will auto-activate then.
        // Trial contracts themselves (trialDays > 0) are never pending_activation.
        const isPaidContract = trialDays === 0;

        if (isPaidContract) {
            const now = new Date();
            const activeTrial = await OrgContract.findOne({
                organizationId,
                contractStatus: "active",
                trialDays: { $gt: 0 },
                trialEndDate: { $gt: now }
            }).select("_id trialEndDate").session(session || null);

            if (activeTrial) {
                // Check no pending_activation already exists — DB index enforces uniqueness,
                // but give a clean error message before hitting the Mongo duplicate key error.
                const existingPending = await OrgContract.findOne({
                    organizationId,
                    contractStatus: "pending_activation"
                }).session(session || null);
                if (existingPending) {
                    throw new ContractEngineError(
                        `Organization already has a pending_activation contract (${existingPending._id}). Cancel it first.`,
                        "DUPLICATE_PENDING"
                    );
                }

                resolvedStatus = "pending_activation";
                resolvedEffectiveFrom = activeTrial.trialEndDate; // starts when trial ends

                logger.info(
                    { organizationId, trialEndDate: activeTrial.trialEndDate },
                    "[ContractEngine] Active trial found — paid contract set to pending_activation"
                );
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Resolve planVersionTag if planVersionId provided but tag omitted
    // Also validates plan version eligibility for contract creation.
    let resolvedTag = planVersionTag;
    if (planVersionId) {
        const pv = await PlanVersion.findById(planVersionId)
            .select("versionTag status visibility")
            .lean();

        if (!pv) {
            throw new ContractEngineError(
                `PlanVersion ${planVersionId} not found`,
                "PLAN_VERSION_NOT_FOUND",
                404
            );
        }

        // ── Eligibility matrix ───────────────────────────────────────────────────
        // Allowed:  ACTIVE + PUBLIC, ACTIVE + SALES, DEPRECATED + SALES
        // Rejected: DRAFT (any visibility), INTERNAL (any status)
        // ─────────────────────────────────────────────────────────────────────
        if (pv.status === "draft") {
            throw new ContractEngineError(
                `PlanVersion ${planVersionId} is still in draft status and cannot be used for contracts. ` +
                `Publish the version first.`,
                "PLAN_VERSION_NOT_PUBLISHED"
            );
        }

        if (pv.visibility === "internal") {
            throw new ContractEngineError(
                `PlanVersion ${planVersionId} has visibility="internal" and is not available for org contracts. ` +
                `Only public and sales-visibility plans may be attached to contracts.`,
                "PLAN_NOT_AVAILABLE_FOR_CONTRACTS"
            );
        }

        if (pv.status === "deprecated" && pv.visibility !== "sales") {
            throw new ContractEngineError(
                `PlanVersion ${planVersionId} is deprecated and visibility="${pv.visibility}". ` +
                `Deprecated plans are only allowed for sales-managed contracts (visibility=sales). ` +
                `Use an active plan version or change the plan's visibility to "sales" first.`,
                "DEPRECATED_PUBLIC_PLAN_NOT_ALLOWED"
            );
        }

        resolvedTag = pv.versionTag || "UNKNOWN";
    }

    const contractData = {
        organizationId,
        planVersionId: planVersionId || null,
        planCode,
        planVersionTag: resolvedTag || "MANUAL",
        contractStatus: resolvedStatus,
        // v23.0: accessType MUST be explicit here.
        // Without this line, Mongoose uses default: "paid" and the invariant guard crashes
        // for promo contracts because contract.accessType !== what the orchestrator resolved.
        accessType: accessType || "paid",
        lockedPrice: accessType === "promo" ? 0 : lockedPrice,  // hard-enforce 0 for promo
        currency: currency.toUpperCase(),
        effectiveFrom: resolvedEffectiveFrom,
        effectiveTo: effectiveTo || null,
        trialDays,
        trialStartDate: trialStartDate || (trialDays > 0 ? new Date() : null),
        trialEndDate: dataTrialEndDate || (trialDays > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + trialDays); return d; })() : null),
        autoRenew,
        gracePeriodDays,
        renewalTerms: renewalTerms || { inflationPercent: 0, autoRenew, interval: "monthly" },
        pricingOverride: pricingOverride || null,
        appliedCoupon: appliedCoupon || null,
        creditBalance: 0,
        salesOwnerId: salesOwnerId || null,
        createdBy: actorId,
        // Pass-through fields
        source: source || null,
        paymentProvider: paymentProvider || null,
        billingInterval: billingInterval || "monthly",
        pricingSnapshot: pricingSnapshot || null,
        // metadata: if caller provides a Map pass it through; if plain object convert
        ...(metadata ? { metadata: metadata instanceof Map ? metadata : new Map(Object.entries(metadata)) } : {}),
    };

    // ── CONTRACT_TIMELINE_OVERLAP pre-creation guard ─────────────────────────
    // Prevents creating a contract whose effectiveFrom falls within an existing
    // contract's coverage window. The guardian catches this at startup, but
    // this guard prevents the corruption from being written in the first place.
    //
    // Scope: non-terminal statuses only (draft, active, pending_activation,
    //        pending_payment, ready — anything that represents a committed
    //        or upcoming coverage period).
    // Skipped: when initialStatus is provided (orchestrator upgrade flow manages
    //          its own timeline via atomic session supersession).
    if (!initialStatus && resolvedEffectiveFrom) {
        const TERMINAL_STATUSES = ["superseded", "terminated", "expired", "canceled", "void"];
        const overlappingContract = await OrgContract.findOne({
            organizationId,
            contractStatus: { $nin: TERMINAL_STATUSES },
            effectiveTo: { $ne: null, $gt: resolvedEffectiveFrom }
        }).select("_id contractStatus effectiveFrom effectiveTo").session(session || null);

        if (overlappingContract) {
            throw new ContractEngineError(
                `CONTRACT_TIMELINE_OVERLAP: New contract effectiveFrom (${resolvedEffectiveFrom.toISOString()}) ` +
                `falls within existing contract ${overlappingContract._id} ` +
                `(status: ${overlappingContract.contractStatus}, ` +
                `effectiveTo: ${overlappingContract.effectiveTo.toISOString()}). ` +
                `Supersede or terminate the existing contract first.`,
                "CONTRACT_TIMELINE_OVERLAP"
            );
        }
    }

    const opts = session ? { session } : {};
    const [contract] = await OrgContract.create([contractData], opts);

    // v23.0: Debug log — confirm accessType is what the orchestrator resolved.
    // This log MUST show the correct value (e.g. "promo") not the Mongoose default.
    logger.info(
        {
            contractId: contract._id,
            organizationId,
            planCode,
            lockedPrice: contract.lockedPrice,
            accessType: contract.accessType,      // ← MUST match what was passed in
            status: resolvedStatus,
            actorId
        },
        "[DEBUG] Contract created"
    );

    // v23.0: Hard assert — catch any future regression where accessType silently reverts.
    if (accessType && contract.accessType !== accessType) {
        throw new Error(
            `ACCESS_TYPE_PERSISTENCE_FAILED: expected="${accessType}" got="${contract.accessType}" ` +
            `contractId=${contract._id}`
        );
    }

    return contract;
}


// ─── REPLACE CONTRACT ─────────────────────────────────────────────────────────

/**
 * replaceContract
 *
 * Creates a draft replacement for an existing active contract.
 * Commercial fields from body override the source contract's values.
 *
 * Enforcement:
 *   - Source must be active
 *   - Only one pending draft replacement per org at a time
 *
 * The old contract is NOT superseded here — supersession happens
 * inside activateContract when the new draft is activated.
 *
 * @param {ObjectId|string} sourceContractId
 * @param {object} updates   - Fields to override on the new draft
 * @param {ObjectId} actorId
 * @param {object} [options]
 * @returns {Promise<OrgContract>}  The new draft contract
 */
async function replaceContract(sourceContractId, updates, actorId, options = {}) {
    const { session } = options;

    const source = await OrgContract.findById(sourceContractId).session(session || null);
    if (!source) {
        throw new ContractEngineError(`Contract ${sourceContractId} not found`, "CONTRACT_NOT_FOUND", 404);
    }
    if (source.contractStatus !== "active") {
        throw new ContractEngineError(
            `Only active contracts can be replaced (current status: ${source.contractStatus})`,
            "INVALID_SOURCE_STATUS"
        );
    }

    // Guard: one pending replacement per org
    const existingDraft = await OrgContract.findOne({
        organizationId: source.organizationId,
        contractStatus: "draft"
    }).session(session || null);
    if (existingDraft) {
        throw new ContractEngineError(
            `A pending draft replacement already exists (${existingDraft._id})`,
            "DUPLICATE_DRAFT"
        );
    }

    const newContractData = {
        // Inherit all commercial fields from the source contract
        organizationId: source.organizationId,
        planVersionId: updates.planVersionId || source.planVersionId,
        planCode: updates.planCode || source.planCode,
        planVersionTag: updates.planVersionTag || source.planVersionTag,
        lockedPrice: updates.lockedPrice !== undefined ? updates.lockedPrice : source.lockedPrice,
        currency: updates.currency ? updates.currency.toUpperCase() : source.currency,
        effectiveFrom: updates.effectiveFrom || new Date(),
        effectiveTo: updates.effectiveTo || null,
        trialDays: updates.trialDays !== undefined ? updates.trialDays : 0,
        autoRenew: updates.autoRenew !== undefined ? updates.autoRenew : source.autoRenew,
        gracePeriodDays: updates.gracePeriodDays || source.gracePeriodDays,
        renewalTerms: updates.renewalTerms || source.renewalTerms?.toObject?.() || source.renewalTerms,
        pricingOverride: updates.pricingOverride || source.pricingOverride?.toObject?.() || source.pricingOverride,
        appliedCoupon: updates.appliedCoupon !== undefined ? updates.appliedCoupon : (source.appliedCoupon?.toObject?.() || source.appliedCoupon),
        salesOwnerId: updates.salesOwnerId || source.salesOwnerId,
        creditBalance: 0,  // fresh contract starts with no credit

        // Replacement linkage
        contractStatus: "draft",
        previousContractId: source._id,
        createdBy: actorId
    };

    const opts = session ? { session } : {};
    const [replacement] = await OrgContract.create([newContractData], opts);

    logger.info(
        { replacementId: replacement._id, sourceContractId, organizationId: source.organizationId, actorId },
        "[ContractEngine] Replacement draft created"
    );

    // Sprint 8: BillingTimeline — UPGRADE_APPLIED (non-blocking)
    // Emitted when a replacement draft is created (marks the upgrade intent).
    // The actual supersession happens inside activateContract — this event covers the initiation.
    setImmediate(async () => {
        await emitBillingTimelineEvent({
            organizationId: String(source.organizationId),
            contractId: String(replacement._id),
            eventType: "UPGRADE_APPLIED",
            source: "system",
            payload: {
                sourceContractId: String(sourceContractId),
                newContractId: String(replacement._id),
                actorId: actorId ? String(actorId) : null
            }
        });
    });

    return replacement;
}

// ─── ACTIVATE CONTRACT ────────────────────────────────────────────────────────

/**
 * activateContract
 *
 * Delegates to contractActivation.service.js which handles:
 *   - Draft → Active transition
 *   - Superseding the previous active contract
 *   - Applying module entitlements to the organization
 *   - Setting org.currentContractId
 *   - Emitting audit events
 *
 * @param {ObjectId|string} contractId
 * @param {ObjectId|string} invoiceId    - The PlatformInvoice that triggered activation
 * @param {ObjectId|string} actorId
 * @param {object} [options]
 * @returns {Promise<{ contract: OrgContract, organization: Organization }>}
 */
async function activateContract(contractId, invoiceId, actorId, options = {}) {
    try {
        return await _activateContract(contractId, invoiceId, {
            activatedBy: actorId,
            session: options.session,
            skipInvoiceCheck: options.skipInvoiceCheck,   // ← v22.2: pass through for upgrade flow
            correlationId: options.correlationId,
        });
    } catch (err) {
        if (err instanceof ContractActivationError) {
            throw new ContractEngineError(err.message, err.code);
        }
        throw err;
    }
}

// ─── EXPIRE / TERMINATE CONTRACT ──────────────────────────────────────────────

/**
 * expireContract
 *
 * Moves a contract to "terminated" status.
 * Allowed from: draft, active.
 * Sets terminatedAt and terminatedBy.
 *
 * @param {ObjectId|string} contractId
 * @param {string} reason        - Human-readable reason for audit trail
 * @param {ObjectId|string} actorId
 * @param {object} [options]
 *   @param {mongoose.ClientSession} [options.session]
 * @returns {Promise<OrgContract>}
 */
async function expireContract(contractId, reason, actorId, options = {}) {
    const { session } = options;

    const contract = await OrgContract.findById(contractId).session(session || null);
    if (!contract) {
        throw new ContractEngineError(`Contract ${contractId} not found`, "CONTRACT_NOT_FOUND", 404);
    }

    if (contract.contractStatus === "terminated") {
        return contract; // Idempotent
    }

    // State machine guard — replaces manual if-checks.
    // assertValidTransition throws CONTRACT_INVALID_TRANSITION for:
    //   superseded → terminated (terminal state — immutable historical record)
    //   expired    → terminated (already terminal)
    assertValidTransition(contract.contractStatus, "terminated");

    // Capture pre-mutation status for the org.currentContractId cleanup below
    const wasActive = ["active", "draft"].includes(contract.contractStatus);

    contract.contractStatus = "terminated";
    contract.terminatedBy = actorId;
    contract.terminatedAt = new Date();
    if (reason) {
        contract.metadata.set("terminationReason", reason);
    }

    const opts = session ? { session } : {};
    await contract.save(opts);

    // If this was the active contract, clear org.currentContractId
    if (wasActive) {
        await Organization.findByIdAndUpdate(
            contract.organizationId,
            { $set: { currentContractId: null } },
            { ...opts, new: false }
        );
    }

    logger.info(
        { contractId, organizationId: contract.organizationId, reason, actorId },
        "[ContractEngine] Contract expired/terminated"
    );

    // Sprint 8: BillingTimeline — CONTRACT_CANCELLED (non-blocking)
    // Only emit when an active/draft contract is terminated (genuine cancellation).
    if (wasActive) {
        setImmediate(async () => {
            await emitBillingTimelineEvent({
                organizationId: String(contract.organizationId),
                contractId: String(contractId),
                eventType: "CONTRACT_CANCELLED",
                source: "system",
                payload: {
                    reason: reason || null,
                    actorId: actorId ? String(actorId) : null
                }
            });
        });
    }

    return contract;
}

// ─── Exported surface ─────────────────────────────────────────────────────────

module.exports = {
    createContract,
    replaceContract,
    activateContract,
    expireContract,
    ContractEngineError
};
