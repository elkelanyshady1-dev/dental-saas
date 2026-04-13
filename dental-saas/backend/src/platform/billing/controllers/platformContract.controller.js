/**
 * platformContract.controller.js
 * Sprint 2 — Contract Engine (Parallel Mode)
 *
 * Handles OrgContract lifecycle:
 *   POST   /contracts              → createContract
 *   PATCH  /contracts/:id/status   → updateContractStatus
 *   POST   /contracts/:id/replace  → replaceContract
 *   POST   /contracts/:id/upload-document → uploadContractDocument
 *
 * Enforcement rules:
 *   - Immutable commercial fields (lockedPrice, planVersionId, currency) enforced when active
 *   - Only one active contract per org (enforced by partial unique index + service)
 *   - Only one pending scheduled change per org
 *
 * PLANE: Platform
 * CAPABILITY: MANAGE_SUBSCRIPTIONS
 */

"use strict";

const mongoose = require("mongoose");
const OrgContract = require("@billing/models/OrgContract.model").default;
const PlanVersion = require("@billing/models/PlanVersion.model").default;
const Organization = require("@shared/models/Organization").default;
const logger = require("@utils/logger");

// Audit service — consistent with platform audit patterns
let auditLog;
try {
    auditLog = require("../../../domain/services/platformAudit.service").log;
} catch {
    auditLog = async (e) => logger.info(e, "[ContractController][AuditFallback]");
}

// Pricing engine — THE only place contract prices are computed
const { computePrice } = require("../pricing/pricingEngine.service");

// ─── Immutable fields that cannot be changed once a contract is active ────────
const IMMUTABLE_ACTIVE_FIELDS = [
    "lockedPrice",
    "currency",
    "planVersionId",
    "planCode",
    "planVersionTag",
    "effectiveFrom",
    "trialDays"
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasImmutableChange(body) {
    return IMMUTABLE_ACTIVE_FIELDS.some(field => field in body);
}

// ─── POST /contracts ──────────────────────────────────────────────────────────

/**
 * createContract
 * Creates a new OrgContract in "draft" status for an organization.
 * Does not activate it — activation requires a paid PlatformInvoice.
 *
 * REVENUE SAFETY: lockedPrice from req.body is treated as an overridePrice
 * input to computePrice(). The engine validates, resolves providerPriceId,
 * and returns the auditable snapshot. Raw body prices are NEVER trusted.
 */
exports.createContract = async (req, res) => {
    try {
        const {
            organizationId,
            planVersionId,
            effectiveFrom,
            effectiveTo = null,
            trialDays = 0,
            autoRenew = true,
            gracePeriodDays = 7,
            lockedPrice,
            currency,
            billingInterval = "monthly",
            renewalTerms = {},
            pricingOverride = {},
            appliedCoupon = null,
            salesOwnerId = null
        } = req.body;

        const actorId = req.platformUser?._id;

        // ── Validate required fields ───────────────────────────────────────────
        if (!organizationId || !planVersionId || !lockedPrice || !currency || !effectiveFrom) {
            return res.status(400).json({
                success: false,
                error: "organizationId, planVersionId, lockedPrice, currency, effectiveFrom are required"
            });
        }

        // ── Validate org exists ────────────────────────────────────────────────
        const org = await Organization.findById(organizationId);
        if (!org) {
            return res.status(404).json({ success: false, error: "Organization not found" });
        }

        // ── Validate PlanVersion exists and is active ──────────────────────────
        const planVersion = await PlanVersion.findById(planVersionId);
        if (!planVersion) {
            return res.status(404).json({ success: false, error: "PlanVersion not found" });
        }
        if (planVersion.status !== "active") {
            return res.status(400).json({
                success: false,
                error: `PlanVersion is not active (status: ${planVersion.status}). Only active plan versions can be contracted.`
            });
        }

        // ── Guard: no duplicate pending scheduled changes ─────────────────────
        const existingDraft = await OrgContract.findOne({
            organizationId,
            contractStatus: "draft"
        });
        if (existingDraft) {
            return res.status(409).json({
                success: false,
                error: "Organization already has a pending draft contract. Finalize or cancel it first.",
                existingContractId: existingDraft._id
            });
        }

        // ── Compute price via Pricing Engine (REVENUE SAFETY) ─────────────────
        // req.body.lockedPrice is passed as overridePrice — the engine validates it,
        // resolves providerPriceId, and builds the audit snapshot.
        const pricing = await computePrice({
            planVersion: planVersion.toObject ? planVersion.toObject() : planVersion,
            billingInterval,
            country: org.country,
            provider: "manual",
            overridePrice: lockedPrice,
            overrideCurrency: currency,
            organizationId,
        });

        // ── Create contract ────────────────────────────────────────────────────
        const contract = new OrgContract({
            organizationId,
            planVersionId,
            planCode: planVersion.templateCode,
            planVersionTag: planVersion.versionTag,
            contractStatus: "draft",
            effectiveFrom: new Date(effectiveFrom),
            effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
            trialDays,
            trialStartDate: trialDays > 0 ? new Date(effectiveFrom) : null,
            trialEndDate: trialDays > 0
                ? (() => {
                    const d = new Date(effectiveFrom);
                    d.setDate(d.getDate() + trialDays);
                    return d;
                })()
                : null,
            lockedPrice: pricing.finalPrice,
            currency: pricing.currency,
            billingInterval: pricing.billingInterval,
            providerPriceId: pricing.providerPriceId,
            pricingSnapshot: pricing.snapshot,
            autoRenew,
            gracePeriodDays,
            renewalTerms,
            pricingOverride,
            appliedCoupon,
            salesOwnerId,
            createdBy: actorId
        });

        await contract.save();

        logger.info(
            {
                contractId: contract._id, organizationId, planCode: contract.planCode,
                lockedPrice: pricing.finalPrice, currency: pricing.currency, actorId
            },
            "[ContractController] Contract created via PricingEngine"
        );

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_CREATED",
                    organizationId,
                    actorId,
                    metadata: {
                        contractId: contract._id,
                        planCode: contract.planCode,
                        planVersionTag: contract.planVersionTag,
                        lockedPrice: pricing.finalPrice,
                        currency: pricing.currency,
                        trialDays
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[ContractController] Audit log failed (non-fatal)");
            }
        });

        return res.status(201).json({
            success: true,
            data: contract,
            message: "Contract created in draft status. Generate and pay an invoice to activate."
        });

    } catch (err) {
        logger.error({ err }, "[ContractController] createContract failed");
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                error: "Duplicate active contract constraint violated"
            });
        }
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── POST /contracts/sales ────────────────────────────────────────────────────

/**
 * createSalesContract
 * Creates a custom-price sales contract for an organization.
 *
 * Differences from createContract:
 *   1. customPrice overrides any catalog price
 *   2. source = "sales" tag applied
 *   3. durationMonths determines effectiveTo (no open-ended)
 *   4. If org is in active trial → status = pending_activation, effectiveFrom = trial.effectiveTo
 *   5. Otherwise → status = draft (follow standard activate flow)
 *   6. PlanVersions with visibility="sales" are accessible here (bypasses public filter)
 *   7. Enforcement: max 1 pending_activation per org (existing unique partial index)
 *
 * Caller MUST then: generate invoice → pay → activate (if not pending).
 *
 * PLANE: Platform
 * CAPABILITY: MANAGE_SUBSCRIPTIONS
 */
exports.createSalesContract = async (req, res) => {
    try {
        const {
            organizationId,
            planVersionId,
            customPrice,
            currency,
            billingInterval = "monthly",
            provider = "manual",
            coupon,
            taxRate,
            durationMonths = 12,
            trialDays,
            autoRenew = false,
            gracePeriodDays = 7,
            salesOwnerId = null,
            notes = ""
        } = req.body;

        const actorId = req.platformUser?._id;

        // ── Validate required fields ───────────────────────────────────────────
        if (!organizationId || !planVersionId || customPrice == null || !currency) {
            return res.status(400).json({
                success: false,
                error: "organizationId, planVersionId, customPrice, and currency are required"
            });
        }
        if (typeof customPrice !== "number" || customPrice < 0) {
            return res.status(400).json({
                success: false,
                error: "customPrice must be a non-negative number"
            });
        }
        if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) {
            return res.status(400).json({
                success: false,
                error: "durationMonths must be an integer between 1 and 120"
            });
        }

        // ── Validate org ───────────────────────────────────────────────────────
        const org = await Organization.findById(organizationId);
        if (!org || org.isArchived) {
            return res.status(404).json({ success: false, error: "Organization not found or archived" });
        }

        // ── Validate PlanVersion (active; visibility gate bypassed here — sales+public allowed) ──
        const planVersion = await PlanVersion.findById(planVersionId);
        if (!planVersion) {
            return res.status(404).json({ success: false, error: "PlanVersion not found" });
        }
        if (planVersion.status !== "active") {
            return res.status(400).json({
                success: false,
                error: `PlanVersion is not active (status: ${planVersion.status})`
            });
        }

        // ── Guard: no duplicate pending_activation ─────────────────────────────
        const existingPending = await OrgContract.findOne({
            organizationId,
            contractStatus: "pending_activation"
        });
        if (existingPending) {
            return res.status(409).json({
                success: false,
                error: "Organization already has a pending_activation contract. " +
                    "It must activate or be canceled before creating a new sales contract.",
                existingContractId: existingPending._id
            });
        }

        // Guard: no duplicate sales draft per org
        const existingSalesDraft = await OrgContract.findOne({
            organizationId,
            contractStatus: "draft",
            source: "sales"
        });
        if (existingSalesDraft) {
            return res.status(409).json({
                success: false,
                error: "Organization already has a sales draft contract. Cancel or finalize it first.",
                existingContractId: existingSalesDraft._id
            });
        }

        // ── Determine lifecycle state based on trial ───────────────────────────
        // TDS: If org has an active trial contract, the new paid contract must be PENDING.
        // effectiveFrom = trial's effectiveTo so it activates when trial ends via trialActivation.job.
        const activeTrial = await OrgContract.findOne({
            organizationId,
            contractStatus: "active",
            trialDays: { $gt: 0 }
        });

        const now = new Date();
        let newContractStatus = "draft";
        let effectiveFrom = now;

        if (activeTrial && activeTrial.effectiveTo) {
            newContractStatus = "pending_activation";
            effectiveFrom = activeTrial.effectiveTo;
        }

        // effectiveTo = effectiveFrom + durationMonths
        const effectiveTo = new Date(effectiveFrom);
        effectiveTo.setMonth(effectiveTo.getMonth() + durationMonths);

        // ── Compute price via Pricing Engine ──────────────────────────────────
        // Sales contracts always use overridePrice path:
        //   - Passes customPrice as overridePrice (sales-negotiated price)
        //   - Skips coupon/tax but still resolves providerPriceId
        //   - org.country is the ISO country code for region resolution
        const pricing = await computePrice({
            planVersion: planVersion.toObject ? planVersion.toObject() : planVersion,
            billingInterval,
            country: org.country,
            provider,
            overridePrice: customPrice,
            overrideCurrency: currency,
            organizationId,
        });

        // ── Create contract ────────────────────────────────────────────────────
        const contract = new OrgContract({
            organizationId,
            planVersionId,
            planCode: planVersion.templateCode,
            planVersionTag: planVersion.versionTag,
            contractStatus: newContractStatus,
            effectiveFrom,
            effectiveTo,
            trialDays: typeof trialDays === "number" ? trialDays : 0,
            lockedPrice: pricing.finalPrice,          // from engine — never raw customPrice
            currency: pricing.currency,               // from engine — validated
            billingInterval: pricing.billingInterval, // from engine — locked cadence
            providerPriceId: pricing.providerPriceId, // from engine — null for manual
            pricingSnapshot: pricing.snapshot,        // from engine — audit trail
            autoRenew,
            gracePeriodDays,
            salesManaged: true,
            salesOwnerId: salesOwnerId || actorId,
            source: "sales",
            createdBy: actorId,
            metadata: notes ? new Map([["salesNotes", notes]]) : undefined
        });

        await contract.save();

        logger.info(
            {
                contractId: contract._id,
                organizationId,
                newContractStatus,
                lockedPrice: pricing.finalPrice,
                currency: pricing.currency,
                regionCode: pricing.regionCode,
                providerPriceId: pricing.providerPriceId,
                durationMonths,
                trialActive: !!activeTrial,
                actorId
            },
            "[ContractController] Sales contract created via PricingEngine"
        );

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "SALES_CONTRACT_CREATED",
                    organizationId,
                    actorId,
                    metadata: {
                        contractId: contract._id,
                        planCode: contract.planCode,
                        planVersionTag: contract.planVersionTag,
                        customPrice,
                        currency: contract.currency,
                        durationMonths,
                        contractStatus: newContractStatus,
                        scheduledForTrialEnd: !!activeTrial
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[ContractController] Audit log failed (non-fatal)");
            }
        });

        const message = activeTrial
            ? `Sales contract scheduled. Will activate on ${effectiveFrom.toISOString()} when trial ends.`
            : "Sales contract created in draft. Generate invoice and record payment to activate.";

        return res.status(201).json({
            success: true,
            data: contract,
            scheduledForTrialEnd: !!activeTrial,
            trialEndsAt: activeTrial?.effectiveTo?.toISOString() || null,
            message
        });

    } catch (err) {
        logger.error({ err }, "[ContractController] createSalesContract failed");
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                error: "Duplicate contract constraint violated (unique_pending_contract_per_org index)"
            });
        }
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── PATCH /contracts/:id/status ─────────────────────────────────────────────

/**
 * updateContractStatus
 * Allowed transitions from API (activation itself is via activateContract service):
 *   draft → terminated
 *   active → terminated   (with terminationReason)
 *
 * Activation (draft → active) is performed by the invoice payment flow,
 * NOT directly via this endpoint.
 */
exports.updateContractStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { contractStatus, terminationReason } = req.body;
        const actorId = req.platformUser?._id;

        if (!contractStatus) {
            return res.status(400).json({ success: false, error: "contractStatus is required" });
        }

        // Only allow termination via this endpoint
        if (!["terminated"].includes(contractStatus)) {
            return res.status(400).json({
                success: false,
                error: "Only 'terminated' status can be set via this endpoint. Activation is performed by the payment flow."
            });
        }

        const contract = await OrgContract.findById(id);
        if (!contract) {
            return res.status(404).json({ success: false, error: "Contract not found" });
        }

        // Immutability guard: already terminated/superseded contracts cannot be modified
        if (["terminated", "superseded"].includes(contract.contractStatus)) {
            return res.status(409).json({
                success: false,
                error: `Contract is already ${contract.contractStatus} and cannot be modified`
            });
        }

        // Guard: if active contract is being terminated, log prominent warning
        if (contract.contractStatus === "active") {
            logger.warn(
                { contractId: id, organizationId: contract.organizationId, actorId },
                "[ContractController] Active contract being terminated"
            );
        }

        const prevStatus = contract.contractStatus;
        contract.contractStatus = "terminated";
        contract.terminatedBy = actorId;
        contract.terminatedAt = new Date();
        contract.terminationReason = terminationReason || null;

        await contract.save();

        // If active contract terminated → clear org's currentContractId
        if (prevStatus === "active") {
            await Organization.findByIdAndUpdate(contract.organizationId, {
                $set: { currentContractId: null }
            });
        }

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_TERMINATED",
                    organizationId: contract.organizationId,
                    actorId,
                    metadata: {
                        contractId: contract._id,
                        previousStatus: prevStatus,
                        terminationReason: terminationReason || null
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[ContractController] Audit log failed (non-fatal)");
            }
        });

        return res.json({
            success: true,
            data: contract,
            message: "Contract terminated"
        });

    } catch (err) {
        logger.error({ err }, "[ContractController] updateContractStatus failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── POST /contracts/:id/replace ─────────────────────────────────────────────

/**
 * replaceContract
 * Creates a replacement draft contract for an existing active contract.
 * The old contract is NOT immediately superseded — that happens on activation
 * of the new contract via contractActivation.service.js.
 *
 * Enforcement: only one pending draft replacement per org at a time.
 * Commercial fields passed in body override the source contract's values.
 */
exports.replaceContract = async (req, res) => {
    try {
        const { id } = req.params;
        const actorId = req.platformUser?._id;

        const sourceContract = await OrgContract.findById(id);
        if (!sourceContract) {
            return res.status(404).json({ success: false, error: "Source contract not found" });
        }

        if (!["active", "draft"].includes(sourceContract.contractStatus)) {
            return res.status(400).json({
                success: false,
                error: `Cannot replace a contract in status "${sourceContract.contractStatus}"`
            });
        }

        // Guard: only one pending draft per org
        const existingDraft = await OrgContract.findOne({
            organizationId: sourceContract.organizationId,
            contractStatus: "draft",
            _id: { $ne: id }
        });
        if (existingDraft) {
            return res.status(409).json({
                success: false,
                error: "Organization already has a pending draft contract. Finalize or cancel it first.",
                existingContractId: existingDraft._id
            });
        }

        // ── Validate new PlanVersion if provided ───────────────────────────────
        const {
            planVersionId = sourceContract.planVersionId,
            effectiveFrom = sourceContract.effectiveFrom,
            effectiveTo = sourceContract.effectiveTo,
            lockedPrice = sourceContract.lockedPrice,
            currency = sourceContract.currency,
            billingInterval = sourceContract.billingInterval || "monthly",
            autoRenew = sourceContract.autoRenew,
            gracePeriodDays = sourceContract.gracePeriodDays,
            trialDays = 0,     // Replacements don't restart trials by default
            renewalTerms = sourceContract.renewalTerms,
            pricingOverride = sourceContract.pricingOverride,
            appliedCoupon = sourceContract.appliedCoupon,
            salesOwnerId = sourceContract.salesOwnerId
        } = req.body;

        let planVersion = await PlanVersion.findById(planVersionId);
        if (!planVersion) {
            return res.status(404).json({ success: false, error: "PlanVersion not found" });
        }
        if (planVersion.status !== "active") {
            return res.status(400).json({
                success: false,
                error: `PlanVersion is not active (status: ${planVersion.status})`
            });
        }

        // ── Compute price via Pricing Engine (REVENUE SAFETY) ─────────────────
        const org = await Organization.findById(sourceContract.organizationId)
            .select("country billingCountry").lean();
        const pricing = await computePrice({
            planVersion: planVersion.toObject ? planVersion.toObject() : planVersion,
            billingInterval,
            country: org?.billingCountry || org?.country,
            provider: "manual",
            overridePrice: lockedPrice,
            overrideCurrency: currency,
            organizationId: sourceContract.organizationId,
        });

        // ── Create replacement draft ───────────────────────────────────────────
        const replacement = new OrgContract({
            organizationId: sourceContract.organizationId,
            planVersionId,
            planCode: planVersion.templateCode,
            planVersionTag: planVersion.versionTag,
            contractStatus: "draft",
            effectiveFrom: new Date(effectiveFrom),
            effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
            lockedPrice: pricing.finalPrice,
            currency: pricing.currency,
            billingInterval: pricing.billingInterval,
            providerPriceId: pricing.providerPriceId,
            pricingSnapshot: pricing.snapshot,
            autoRenew,
            gracePeriodDays,
            trialDays,
            renewalTerms,
            pricingOverride,
            appliedCoupon,
            salesOwnerId,
            createdBy: actorId,
            previousContractId: sourceContract._id,
            // Traceability
            supersededById: null  // will be filled on activation
        });

        await replacement.save();

        logger.info(
            {
                replacementId: replacement._id,
                sourceContractId: id,
                organizationId: sourceContract.organizationId,
                lockedPrice: pricing.finalPrice,
                currency: pricing.currency,
                actorId
            },
            "[ContractController] Replacement contract created via PricingEngine"
        );

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_REPLACED",
                    organizationId: sourceContract.organizationId,
                    actorId,
                    metadata: {
                        sourceContractId: id,
                        replacementContractId: replacement._id,
                        planCode: replacement.planCode,
                        planVersionTag: replacement.planVersionTag,
                        lockedPrice,
                        currency: replacement.currency
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[ContractController] Audit log failed (non-fatal)");
            }
        });

        return res.status(201).json({
            success: true,
            data: replacement,
            message: "Replacement contract created in draft status. Generate and pay an invoice to activate and supersede the source contract."
        });

    } catch (err) {
        logger.error({ err }, "[ContractController] replaceContract failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── POST /contracts/:id/upload-document ─────────────────────────────────────

/**
 * uploadContractDocument
 * Attaches a reference to an external signed document (URL / S3 key).
 * Does not handle actual file upload — that is the caller's responsibility
 * (pre-signed S3 URL pattern). This endpoint records the metadata only.
 */
exports.uploadContractDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const actorId = req.platformUser?._id;
        const { documentUrl, documentKey, documentLabel = "Signed Contract" } = req.body;

        if (!documentUrl && !documentKey) {
            return res.status(400).json({
                success: false,
                error: "documentUrl or documentKey is required"
            });
        }

        const contract = await OrgContract.findById(id);
        if (!contract) {
            return res.status(404).json({ success: false, error: "Contract not found" });
        }

        if (contract.contractStatus === "terminated") {
            return res.status(409).json({
                success: false,
                error: "Cannot attach documents to a terminated contract"
            });
        }

        // Store in metadata map
        contract.metadata = contract.metadata || new Map();
        contract.metadata.set("signedDocument", {
            documentUrl: documentUrl || null,
            documentKey: documentKey || null,
            documentLabel,
            uploadedAt: new Date(),
            uploadedBy: actorId
        });

        await contract.save();

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_DOCUMENT_UPLOADED",
                    organizationId: contract.organizationId,
                    actorId,
                    metadata: {
                        contractId: contract._id,
                        documentLabel,
                        documentKey: documentKey || null
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[ContractController] Audit log failed (non-fatal)");
            }
        });

        return res.json({
            success: true,
            message: "Contract document reference saved",
            data: { contractId: contract._id, documentLabel }
        });

    } catch (err) {
        logger.error({ err }, "[ContractController] uploadContractDocument failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── PATCH /contracts/:id/auto-renew ─────────────────────────────────────────

/**
 * setAutoRenew
 * Allows platform users to toggle autoRenew and salesManaged on an active contract.
 *
 * body: { autoRenew: boolean, salesManaged?: boolean }
 *
 * Business rules:
 *   - Only "active" contracts may be modified
 *   - Terminated/superseded/expired contracts are immutable
 *   - Setting autoRenew=false flags contract for expiry at period end (no charge)
 *   - Setting salesManaged=true switches renewal from auto-charge to invoice-only
 */
exports.setAutoRenew = async (req, res) => {
    try {
        const { id } = req.params;
        const actorId = req.platformUser?._id;
        const { autoRenew, salesManaged } = req.body;

        if (typeof autoRenew !== "boolean") {
            return res.status(400).json({ success: false, error: "autoRenew (boolean) is required" });
        }

        const contract = await OrgContract.findById(id);
        if (!contract) {
            return res.status(404).json({ success: false, error: "Contract not found" });
        }

        if (!["active", "draft"].includes(contract.contractStatus)) {
            return res.status(409).json({
                success: false,
                error: `Cannot modify autoRenew on contract in status "${contract.contractStatus}"`
            });
        }

        const prevAutoRenew = contract.autoRenew;
        const prevSalesManaged = contract.salesManaged;

        contract.autoRenew = autoRenew;
        if (typeof salesManaged === "boolean") {
            contract.salesManaged = salesManaged;
        }

        await contract.save();

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_AUTO_RENEW_UPDATED",
                    organizationId: contract.organizationId,
                    actorId,
                    metadata: {
                        contractId: contract._id,
                        prevAutoRenew,
                        newAutoRenew: autoRenew,
                        prevSalesManaged,
                        newSalesManaged: contract.salesManaged
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[ContractController] Audit log failed (non-fatal)");
            }
        });

        return res.json({
            success: true,
            data: {
                contractId: contract._id,
                autoRenew: contract.autoRenew,
                salesManaged: contract.salesManaged
            },
            message: `autoRenew set to ${autoRenew}`
        });

    } catch (err) {
        logger.error({ err }, "[ContractController] setAutoRenew failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── PATCH /contracts/:id/cancel ─────────────────────────────────────────────

/**
 * cancelContract
 * Customer or platform operator cancels an active subscription.
 *
 * Effect:
 *   - Sets contractStatus = "canceled"
 *   - Sets autoRenew = false
 *   - Does NOT immediately terminate — contract remains accessible until effectiveTo
 *   - Renewal engine will see contractStatus="canceled" and expire at period end
 *
 * body: { cancellationReason?: string }
 */
exports.cancelContract = async (req, res) => {
    try {
        const { id } = req.params;
        const actorId = req.platformUser?._id;
        const { cancellationReason = null } = req.body || {};

        const contract = await OrgContract.findById(id);
        if (!contract) {
            return res.status(404).json({ success: false, error: "Contract not found" });
        }

        if (!["active", "draft"].includes(contract.contractStatus)) {
            return res.status(409).json({
                success: false,
                error: `Cannot cancel a contract in status "${contract.contractStatus}"`
            });
        }

        contract.contractStatus = "canceled";
        contract.autoRenew = false;
        contract.terminatedBy = actorId;
        contract.terminatedAt = new Date();
        contract.terminationReason = cancellationReason || "customer_cancellation";

        await contract.save();

        // Clear org.currentContractId if it still points to this (now canceled) contract.
        // Prevents ORG_CURRENT_CONTRACT_POINTER_INTEGRITY violation on next Guardian run.
        await Organization.updateOne(
            { _id: contract.organizationId, currentContractId: contract._id },
            { $set: { currentContractId: null } }
        );

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_CANCELED",
                    organizationId: contract.organizationId,
                    actorId,
                    metadata: {
                        contractId: contract._id,
                        cancellationReason,
                        effectiveTo: contract.effectiveTo
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[ContractController] Audit log failed (non-fatal)");
            }
        });

        return res.json({
            success: true,
            data: {
                contractId: contract._id,
                contractStatus: contract.contractStatus,
                effectiveTo: contract.effectiveTo
            },
            message: "Contract canceled. Access continues until period end."
        });

    } catch (err) {
        logger.error({ err, stack: err.stack }, "[ContractController] cancelContract failed");
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            ...(process.env.NODE_ENV !== "production" && { detail: err.message })
        });
    }
};


// ─── GET /contracts/:contractId/chain ─────────────────────────────────────────

/**
 * getContractChain
 * Sprint 8.1 — Contract Chain Debugging API
 *
 * Returns the full contract chain starting from the given contractId.
 *
 * Direction modes:
 *   ?direction=forward  (default) — walks supersededById
 *     root → supersededBy → supersededBy … (trial → paid → upgrade)
 *   ?direction=backward            — walks previousContractId
 *     root ← previousContractId ← previousContractId … (same chain, reversed)
 *
 * Safety: chain depth is capped at MAX_CHAIN_DEPTH (50) to prevent runaway
 * traversal caused by data corruption or circular references.
 *
 * READ-ONLY — no contract is mutated.
 *
 * PLANE: Platform
 * CAPABILITY: VIEW_ORGANIZATIONS
 */
const MAX_CHAIN_DEPTH = 50;

exports.getContractChain = async (req, res) => {
    try {
        const { contractId } = req.params;
        const { direction = "forward" } = req.query;

        if (!mongoose.Types.ObjectId.isValid(contractId)) {
            return res.status(400).json({
                success: false,
                error: "CONTRACT_ID_INVALID",
                message: "contractId must be a valid ObjectId"
            });
        }

        const validDirections = ["forward", "backward"];
        if (!validDirections.includes(direction)) {
            return res.status(400).json({
                success: false,
                error: "INVALID_DIRECTION",
                message: "direction must be 'forward' or 'backward'"
            });
        }

        // Load the root contract
        const root = await OrgContract.findById(contractId).lean();
        if (!root) {
            return res.status(404).json({
                success: false,
                error: "CONTRACT_NOT_FOUND",
                message: `No contract found with id '${contractId}'`
            });
        }

        const chain = [];
        let current = root;
        let depth = 0;

        // Walk the chain — direction determines which pointer to follow
        while (current && depth < MAX_CHAIN_DEPTH) {
            chain.push({
                contractId: String(current._id),
                planCode: current.planCode,
                planVersionTag: current.planVersionTag,
                contractStatus: current.contractStatus,
                effectiveFrom: current.effectiveFrom,
                effectiveTo: current.effectiveTo ?? null,
                lockedPrice: current.lockedPrice,
                currency: current.currency,
                billingInterval: current.billingInterval ?? null,
                source: current.source ?? null,
                trialDays: current.trialDays ?? 0,
            });

            const nextId = direction === "backward"
                ? current.previousContractId
                : current.supersededById;

            if (!nextId) break;

            current = await OrgContract.findById(nextId).lean();
            depth++;
        }

        const truncated = depth >= MAX_CHAIN_DEPTH;
        if (truncated) {
            logger.warn(
                { contractId, direction, depth },
                "[ContractController] getContractChain hit depth limit — chain may be circular or corrupt"
            );
        }

        return res.json({
            success: true,
            contractId,
            direction,
            chainLength: chain.length,
            truncated,
            chain
        });

    } catch (err) {
        logger.error({ err }, "[ContractController] getContractChain failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

