/**
 * contractActivation.service.js
 * Sprint 1 — Hybrid Billing Foundations
 *
 * activateContract(contractId, invoiceId, options)
 *
 * This service transitions an OrgContract from "draft" to "active" after
 * confirming that the associated invoice has been paid.
 *
 * Responsibilities:
 *   1. Validate invoice status = paid
 *   2. Validate contract status = draft (idempotency guard)
 *   3. Transition contract → active (OAV-protected)
 *   4. Supersede previous active contract if one exists
 *   5. Update Organization runtime fields (currentContractId, subscription.status)
 *   6. Apply module entitlements from PlanVersion
 *   7. Emit structured audit events
 *
 * NOT YET wired to a controller — Sprint 1 service layer only.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const Organization = require("@shared/models/Organization").default;
const OrgContract = require("../models/OrgContract.model").default;
const PlatformInvoice = require("../models/PlatformInvoice.model").default;
const PlanVersion = require("../models/PlanVersion.model").default;
const { writeLedgerEntry } = require("../models/BillingLedger.model");
const logger = require("@utils/logger");
const { assertValidTransition } = require("./contractStateMachine");
// Sprint 2: Entitlement engine
const OrganizationEntitlement = require("../models/OrganizationEntitlement.model").default;
const BillingAuditLog = require("../models/BillingAuditLog.model").default;
// Sprint 8: BillingTimeline projection
const { emitBillingTimelineEvent } = require("./billingTimeline.service");
// Sprint 3: Correlation ID for distributed tracing
const { randomUUID } = require("crypto");
// v23.0: Platform billing EventBus events (TASK-AUTH-LIFECYCLE-HARDENING Phase 2)
const eventBus = require("@core/eventBus");
const Events = require("@core/domainEvents");

// ─── Audit Service ────────────────────────────────────────────────────────────
// Uses the existing platform audit service to ensure consistent audit log format.
let auditService;
try {
    auditService = require("../../domain/services/platformAudit.service");
} catch {
    // Graceful fallback if audit service not yet wired
    auditService = {
        log: async (event) => logger.info(event, "[ContractActivation][AuditFallback]")
    };
}

// ─── Errors ───────────────────────────────────────────────────────────────────
class ContractActivationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "ContractActivationError";
        this.code = code;
    }
}

// ─── Access-Type Helper ──────────────────────────────────────────────────────
// Determines whether a contract requires invoice-backed activation.
// Non-billable contracts (trial, promo) skip invoice pipeline entirely.
function isBillableContract(contract) {
    return contract.accessType === "paid";
}

// ─── Helper: Apply entitlements from PlanVersion → Organization.modules ───────
async function applyModuleEntitlements(org, planVersion) {
    const mods = planVersion.modules || {};

    // Map PlanVersion module names to Organization.modules keys
    const mappings = {
        patients: "patients",
        appointments: "appointments",
        finance: "accounting",    // PlanVersion uses "finance", Org uses "accounting"
        inventory: "inventory",
        lab: "labs",
        orthodonticsAdv: "orthodontics",
        analytics: "analytics",
        booking: "booking",
        // "notifications" always remains enabled — not plan-gated
    };

    let changed = false;
    for (const [versionField, orgField] of Object.entries(mappings)) {
        const shouldEnable = Boolean(mods[versionField]);
        if (org.modules[orgField] !== shouldEnable) {
            org.modules[orgField] = shouldEnable;
            changed = true;
        }
    }

    if (changed) {
        org.modulesUpdatedAt = new Date();
    }

    return changed;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * activateContract
 *
 * v3.0 — Invoice-first lifecycle:
 *   Activation is ONLY permitted after invoice.status === "paid".
 *   The primary activation path is: pending_payment → active.
 *
 * @param {string|ObjectId} contractId   - The OrgContract._id to activate
 * @param {string|ObjectId|null} invoiceId - The PlatformInvoice._id that triggered activation.
 *   REQUIRED for invoice-first path (pending_payment → active).
 *   May be null for legacy scheduled-activation (skipInvoiceCheck=true, pending_activation path only).
 * @param {object} options
 * @param {string|ObjectId} [options.activatedBy]   - PlatformUser._id performing activation
 * @param {mongoose.ClientSession} [options.session] - Existing session for transaction chaining
 * @param {string} [options.correlationId]           - Distributed trace ID
 * @param {boolean} [options.skipInvoiceCheck=false] - ONLY for legacy scheduler (pending_activation
 *   scheduled contracts). For all invoice-first (pending_payment) contracts, invoice MUST be paid.
 *
 * @returns {Promise<{ contract: OrgContract, organization: Organization }>}
 */
async function activateContract(contractId, invoiceId, options = {}) {
    const {
        activatedBy = null,
        session: externalSession = null,
        correlationId: incomingCorrelationId,
        skipInvoiceCheck = false   // DEPRECATED — kept for backward compat; prefer accessType on contract
    } = options;
    const correlationId = incomingCorrelationId || randomUUID();

    const useExternalSession = Boolean(externalSession);
    const session = externalSession || await mongoose.startSession();

    if (!useExternalSession) {
        session.startTransaction();
    }

    try {
        // ── Step 1: Load and validate Invoice ────────────────────────────────
        // Section 11: Invoice MUST be paid before contract can activate.
        // skipInvoiceCheck is reserved for legacy pending_activation scheduler path.
        let invoice = null;
        if (!skipInvoiceCheck) {
            if (!invoiceId) {
                throw new ContractActivationError(
                    `invoiceId is required for contract activation (invoice-first lifecycle). ` +
                    `Use skipInvoiceCheck=true only for legacy scheduler (pending_activation contracts).`,
                    "INVOICE_ID_REQUIRED"
                );
            }
            invoice = await PlatformInvoice.findById(invoiceId).session(session);
            if (!invoice) {
                throw new ContractActivationError(
                    `Invoice ${invoiceId} not found`,
                    "INVOICE_NOT_FOUND"
                );
            }
            // Section 11: INVOICE_NOT_PAID guard — hard invariant
            if (invoice.status !== "paid") {
                throw new ContractActivationError(
                    `Cannot activate contract: Invoice ${invoiceId} is not paid (status: "${invoice.status}"). ` +
                    `Contract activation requires invoice.status = "paid".`,
                    "INVOICE_NOT_PAID"
                );
            }
        }

        // ── Step 2: Load and validate Contract ───────────────────────────────
        const contract = await OrgContract.findById(contractId).session(session);
        if (!contract) {
            throw new ContractActivationError(
                `OrgContract ${contractId} not found`,
                "CONTRACT_NOT_FOUND"
            );
        }

        // Idempotency guard — already active contracts are a no-op
        if (contract.contractStatus === "active") {
            logger.info(
                { contractId, invoiceId, correlationId },
                "[ContractActivation] Contract already active — idempotent no-op"
            );
            if (!useExternalSession) await session.abortTransaction();
            return { contract, organization: await Organization.findById(contract.organizationId) };
        }

        // State machine guard.
        // Throws CONTRACT_INVALID_TRANSITION if the current status does not allow → active.
        // Valid sources (v3.0): pending_payment, pending_activation, draft (trial contracts)
        assertValidTransition(contract.contractStatus, "active");

        // TDS: effectiveFrom guard ONLY applies to legacy pending_activation (scheduled future-date).
        // For pending_payment contracts: effectiveFrom is already past by the time payment arrives.
        // Skipping the date check for pending_payment prevents false CANNOT_ACTIVATE_BEFORE_EFFECTIVE_DATE.
        if (contract.contractStatus !== "pending_payment" &&
            contract.effectiveFrom && contract.effectiveFrom > new Date()) {
            throw new ContractActivationError(
                `Cannot activate contract ${contractId} before its effective date (${contract.effectiveFrom.toISOString()})`,
                "CANNOT_ACTIVATE_BEFORE_EFFECTIVE_DATE"
            );
        }

        // Invoice must belong to same org as contract (only when invoice was loaded)
        if (invoice && String(invoice.organizationId) !== String(contract.organizationId)) {
            throw new ContractActivationError(
                `Invoice ${invoiceId} belongs to org ${invoice.organizationId}, not ${contract.organizationId}`,
                "ORG_MISMATCH"
            );
        }

        // ── Step 3: Load PlanVersion (for module entitlement application) ────
        const planVersion = await PlanVersion.findById(contract.planVersionId).session(session);
        if (!planVersion) {
            throw new ContractActivationError(
                `PlanVersion ${contract.planVersionId} not found for contract ${contractId}`,
                "PLAN_VERSION_NOT_FOUND"
            );
        }

        // ── Step 4: Load Organization ─────────────────────────────────────────
        const org = await Organization.findById(contract.organizationId).session(session);
        if (!org) {
            throw new ContractActivationError(
                `Organization ${contract.organizationId} not found`,
                "ORG_NOT_FOUND"
            );
        }

        // ── Step 5: Supersede existing active contract (if any) ───────────────
        const previousContract = await OrgContract.findOne({
            organizationId: contract.organizationId,
            contractStatus: "active",
            _id: { $ne: contractId }
        }).session(session);

        if (previousContract) {
            // Guard: active → superseded is the only permitted transition here.
            // Throws if previousContract is already superseded (double-activation race).
            assertValidTransition(previousContract.contractStatus, "superseded");
            previousContract.contractStatus = "superseded";
            previousContract.supersededById = contract._id;
            previousContract.supersededAt = new Date();
            // ── Deterministic timeline close ───────────────────────────────────
            // Stamps the new contract's effectiveFrom as the closing boundary of
            // this contract's billing coverage period. This ensures:
            //   • Zero overlap (prev ends exactly when next begins)
            //   • Zero gap (adjacent coverage periods)
            //   • CONTRACT_TIMELINE_INTEGRITY guardian overlap detection passes
            //   • Accurate MRR/ARR calculations from contract timelines
            //
            // Previously used new Date() which caused overlaps when effectiveFrom
            // was set before the activation moment (e.g., ~10 min race condition).
            previousContract.effectiveTo = contract.effectiveFrom;
            await previousContract.save({ session });

            logger.info(
                { previousContractId: previousContract._id, newContractId: contractId },
                "[ContractActivation] Previous contract superseded"
            );
        }

        // ── Step 6: Activate contract ─────────────────────────────────────────
        const now = new Date();
        contract.contractStatus = "active";
        contract.activatingInvoiceId = invoice?._id || null;
        contract.activatedBy = activatedBy;
        // effectiveFrom already set at draft creation; only update if null
        if (!contract.effectiveFrom) contract.effectiveFrom = now;
        // Sprint 8: Sync nextBillingDate = effectiveTo for scheduler queries
        if (contract.effectiveTo) {
            contract.nextBillingDate = contract.effectiveTo;
        }

        await contract.save({ session });

        // ── Step 7: Update Organization runtime ───────────────────────────────
        // Update currentContractId (new Hybrid Billing field)
        org.currentContractId = contract._id;

        // Activate subscription status (mirrors existing subscription field for
        // backward compat — legacy services still read subscription.status)
        if (org.subscription.status !== "active") {
            org.subscription.status = "active";
        }

        // Sprint 6: Period dates live in OrgContract.effectiveFrom / effectiveTo only.
        // org.subscription is retained only for org.subscription.status (runtime auth guard).
        // No writes to subscription.currentPeriodEnd or subscription.currentPeriodStart.

        // Apply module entitlements from PlanVersion
        await applyModuleEntitlements(org, planVersion);

        await org.save({ session });

        // ── Step 8: Link invoice to contract (only when invoice exists) ────────
        if (invoice && !invoice.contractId) {
            invoice.contractId = contract._id;
            await invoice.save({ session });
        }

        // ── Step 9: Upsert OrganizationEntitlement ─────────────────────────────────
        // MUST be inside the transaction — an activation with no entitlement record
        // leaves the org in a broken state (features appear unlocked at DB level but
        // module guards fail at the entitlement check). Crash between commit and
        // setImmediate is eliminated by running this before commitTransaction().
        //
        // Uses upsert + $set (not $setOnInsert) so that re-activation of a contract
        // (e.g. after a plan change) refreshes the entitlement from the new PlanVersion.
        try {
            await OrganizationEntitlement.findOneAndUpdate(
                {
                    organizationId: org._id,
                    effectiveUntil: null
                },
                {
                    $set: {
                        contractId: contract._id,
                        planVersionId: planVersion._id,
                        modules: planVersion.modules || {},
                        limits: planVersion.limits || {},
                        source: "plan",
                        effectiveFrom: new Date(),
                        createdBy: activatedBy || null
                    },
                    $setOnInsert: {
                        organizationId: org._id,
                        addons: [],
                        effectiveUntil: null
                    }
                },
                { upsert: true, new: true, session }
            );

            // Entitlement audit log — inside the same transaction
            await BillingAuditLog.create([{
                organizationId: org._id,
                contractId: contract._id,
                eventType: "ENTITLEMENT_CREATED_FROM_PLAN",
                performedBy: activatedBy ? String(activatedBy) : "system",
                metadata: {
                    planVersionId: planVersion._id,
                    planCode: contract.planCode,
                    planVersionTag: contract.planVersionTag
                }
            }], { session });

            logger.info(
                { contractId: contract._id, orgId: org._id },
                "[ContractActivation] OrganizationEntitlement provisioned (in-transaction)"
            );
        } catch (entitlementErr) {
            // Entitlement failure IS fatal here — we are inside the transaction so
            // throwing will trigger abortTransaction() in the catch block below.
            // This is deliberate: we would rather fail activation than activate
            // an org with no entitlements.
            logger.error(
                { err: entitlementErr, contractId, orgId: org._id, correlationId },
                "[ContractActivation] Entitlement provisioning failed — aborting transaction"
            );
            throw entitlementErr;
        }

        // ── Step 10: Commit ───────────────────────────────────────────────────────────────
        if (!useExternalSession) {
            await session.commitTransaction();
        }

        logger.info(
            {
                contractId: contract._id,
                organizationId: org._id,
                planCode: contract.planCode,
                planVersionTag: contract.planVersionTag,
                invoiceId: invoice?._id || null,
                accessType: contract.accessType || "unknown",
                activatedBy,
                correlationId
            },
            "[ContractActivation] Contract activated successfully"
        );

        // ── Step 11: Emit audit events (post-commit, non-blocking) ─────────────────
        // Only lightweight, eventually-consistent events remain here.
        // Entitlements and BillingAuditLog are now in the transaction (Step 9).
        setImmediate(async () => {
            try {
                await auditService.log({
                    action: "CONTRACT_ACTIVATED",
                    organizationId: org._id,
                    actorId: activatedBy,
                    metadata: {
                        contractId: contract._id,
                        planCode: contract.planCode,
                        planVersionTag: contract.planVersionTag,
                        lockedPrice: contract.lockedPrice,
                        currency: contract.currency,
                        accessType: contract.accessType || null,
                        previousContractId: previousContract?._id || null,
                        activatingInvoiceId: invoice?._id || null
                    }
                });

                await auditService.log({
                    action: "MODULE_ENTITLEMENTS_APPLIED",
                    organizationId: org._id,
                    actorId: activatedBy,
                    metadata: {
                        contractId: contract._id,
                        planVersionId: planVersion._id,
                        modules: org.modules
                    }
                });

                // v23.0: Emit EventBus domain event for contract activation
                eventBus.emit(Events.CONTRACT_ACTIVATED, {
                    organizationId: org._id,
                    contractId: contract._id,
                    planCode: contract.planCode,
                    planVersionTag: contract.planVersionTag,
                    lockedPrice: contract.lockedPrice,
                    currency: contract.currency,
                    activatedBy: activatedBy || null,
                    correlationId
                }, "contractActivation.service");

                // BillingTimeline events
                setImmediate(async () => {
                    await emitBillingTimelineEvent({
                        organizationId: org._id,
                        contractId: contract._id,
                        eventType: "CONTRACT_ACTIVATED",
                        source: "system",
                        payload: {
                            planCode: contract.planCode,
                            planVersionTag: contract.planVersionTag,
                            lockedPrice: contract.lockedPrice,
                            currency: contract.currency,
                            activatedBy: activatedBy || null,
                            correlationId
                        }
                    });

                    if (contract.trialDays > 0) {
                        await emitBillingTimelineEvent({
                            organizationId: org._id,
                            contractId: contract._id,
                            eventType: "TRIAL_STARTED",
                            source: "system",
                            payload: {
                                trialDays: contract.trialDays,
                                trialStartDate: contract.trialStartDate,
                                trialEndDate: contract.trialEndDate
                            }
                        });
                    }
                });

                await writeLedgerEntry({
                    eventType: "contract.activated",
                    organizationId: org._id,
                    contractId: contract._id,
                    invoiceId: invoice?._id || null,
                    provider: contract.paymentProvider || "internal",
                    amount: contract.lockedPrice,
                    currency: contract.currency,
                    source: "contractActivation",
                    // 'user' when a platform user explicitly triggered activation;
                    // 'system' when triggered by payment webhook or automated job.
                    actorType: activatedBy ? "user" : "system",
                    metadata: {
                        planCode: contract.planCode,
                        planVersionTag: contract.planVersionTag,
                        activatedBy,
                        previousContractId: previousContract?._id || null,
                        correlationId
                    }
                });

            } catch (auditErr) {
                // Audit failure must never break the activation response
                logger.error(
                    { err: auditErr, contractId },
                    "[ContractActivation] Audit logging failed (non-fatal)"
                );
            }
        });

        return { contract, organization: org };

    } catch (err) {
        if (!useExternalSession) {
            try { await session.abortTransaction(); } catch (_) { /* ignore */ }
        }

        logger.error(
            { err, contractId, invoiceId },
            "[ContractActivation] Activation failed — transaction aborted"
        );
        throw err;
    } finally {
        if (!useExternalSession) {
            session.endSession();
        }
    }
}

module.exports = {
    activateContract,
    ContractActivationError
};
