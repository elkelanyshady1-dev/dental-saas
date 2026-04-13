/**
 * SubscriptionEngine.service.js
 * v22.0 — Phase 3: Formal Subscription Engine
 *
 * PURPOSE:
 * Owns the full OrgContract lifecycle. Coordinates contract state
 * transitions through the contractStateMachine, delegating atomics to
 * the underlying services.
 *
 * ── Responsibilities ─────────────────────────────────────────────────────────
 *   createContract        → contractEngine.service
 *   replaceContract       → contractEngine.service
 *   activateContract      → contractEngine.service (→ contractActivation.service)
 *   suspendContract       → contractLifecycleService
 *   voidContract          → contractLifecycleService
 *   graceContract         → contractLifecycleService
 *   expireContract        → contractEngine.service
 *   renewContract         → contractRenewal (if available) | stub
 *
 * ── State machine reference ──────────────────────────────────────────────────
 *   Uses contractStateMachine.js (assertValidTransition).
 *   Never mutates OrgContract.contractStatus outside the engine layer.
 *
 * ── Caller hierarchy ─────────────────────────────────────────────────────────
 *   BillingOrchestrator → SubscriptionEngine → underlying services
 *   Controllers should call BillingOrchestrator, not this engine directly.
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact:  None
 *   RBAC impact:      None
 *   Plane isolation:  Platform only
 *   Regression risk:  LOW — additive facade
 *
 * PLANE: Platform
 */

"use strict";

const logger = require("@utils/logger");

// ── Lazy service references ──────────────────────────────────────────────────
// Lazy to avoid circular dependency issues between engine files and services.

let _contractEngine, _contractLifecycle;

function getContractEngine() {
    if (!_contractEngine) _contractEngine = require("../services/contractEngine.service");
    return _contractEngine;
}

function getContractLifecycle() {
    if (!_contractLifecycle) _contractLifecycle = require("../services/contractLifecycleService");
    return _contractLifecycle;
}

// ─── Subscription Engine ──────────────────────────────────────────────────────

const SubscriptionEngine = {

    /**
     * createContract
     * Creates a new OrgContract in "draft" (or "pending_activation") status.
     *
     * @param {object} data           - Contract fields (organizationId, planCode, lockedPrice…)
     * @param {string} actorId        - PlatformUser._id
     * @param {object} [options]
     * @returns {Promise<OrgContract>}
     */
    async createContract(data, actorId, options = {}) {
        logger.info(
            { orgId: data.organizationId, planCode: data.planCode, actorId },
            "[SubscriptionEngine] createContract"
        );
        return getContractEngine().createContract(data, actorId, options);
    },

    /**
     * replaceContract
     * Creates a draft replacement for an existing active contract.
     *
     * @param {string} sourceContractId
     * @param {object} updates         - Fields to override on the new draft
     * @param {string} actorId
     * @param {object} [options]
     * @returns {Promise<OrgContract>}  The new draft contract
     */
    async replaceContract(sourceContractId, updates, actorId, options = {}) {
        logger.info(
            { sourceContractId, actorId },
            "[SubscriptionEngine] replaceContract"
        );
        return getContractEngine().replaceContract(sourceContractId, updates, actorId, options);
    },

    /**
     * activateContract
     * Transitions draft/pending_activation → active after a paid invoice.
     * Handles supersession, module entitlements, org.currentContractId.
     *
     * @param {string} contractId
     * @param {string} invoiceId     - The paid PlatformInvoice._id
     * @param {string} actorId
     * @param {object} [options]
     * @returns {Promise<{ contract, organization }>}
     */
    async activateContract(contractId, invoiceId, actorId, options = {}) {
        logger.info(
            { contractId, invoiceId, actorId },
            "[SubscriptionEngine] activateContract"
        );
        return getContractEngine().activateContract(contractId, invoiceId, actorId, options);
    },

    /**
     * suspendContract
     * Moves a contract to "suspended" status (non-payment, admin action).
     *
     * @param {string} contractId
     * @param {object} [opts]        - { reason, actorId, session }
     * @returns {Promise<OrgContract>}
     */
    async suspendContract(contractId, opts = {}) {
        logger.info(
            { contractId, reason: opts.reason },
            "[SubscriptionEngine] suspendContract"
        );
        return getContractLifecycle().suspendContract(contractId, opts);
    },

    /**
     * voidContract
     * Voids a contract that has no paid invoices (terminal state).
     *
     * @param {string} contractId
     * @param {object} [opts]        - { reason, actorId, session }
     * @returns {Promise<OrgContract>}
     */
    async voidContract(contractId, opts = {}) {
        logger.info(
            { contractId, reason: opts.reason },
            "[SubscriptionEngine] voidContract"
        );
        return getContractLifecycle().voidContract(contractId, opts);
    },

    /**
     * graceContract
     * Moves a contract into grace period (short-term non-payment recovery window).
     *
     * @param {string} contractId
     * @param {object} [opts]
     * @returns {Promise<OrgContract>}
     */
    async graceContract(contractId, opts = {}) {
        logger.info(
            { contractId },
            "[SubscriptionEngine] graceContract"
        );
        return getContractLifecycle().graceContract(contractId, opts);
    },

    /**
     * expireContract
     * Moves a contract to "terminated" status (platform-initiated).
     *
     * @param {string} contractId
     * @param {string} reason
     * @param {string} actorId
     * @param {object} [options]
     * @returns {Promise<OrgContract>}
     */
    async expireContract(contractId, reason, actorId, options = {}) {
        logger.info(
            { contractId, reason, actorId },
            "[SubscriptionEngine] expireContract"
        );
        return getContractEngine().expireContract(contractId, reason, actorId, options);
    },

    /**
     * renewContract
     * Placeholder for the contract renewal flow.
     * In production this should delegate to a contractRenewal.service.
     * Currently stubs as: expire → create replacement → activate.
     *
     * @param {string} contractId     - Contract to renew
     * @param {object} [options]
     * @returns {Promise<{ contract: OrgContract, invoice: object|null }>}
     */
    async renewContract(contractId, options = {}) {
        logger.info(
            { contractId },
            "[SubscriptionEngine] renewContract — delegating to contractEngine.replaceContract"
        );

        // Future: delegate to contractRenewal.service when implemented.
        // stub: throw informative error if called directly without renewal service.
        const renewalServicePath = "../services/contractRenewal.service";
        try {
            const renewal = require(renewalServicePath);
            if (typeof renewal.renewContract === "function") {
                return renewal.renewContract(contractId, options);
            }
        } catch (e) {
            // Renewal service not yet wired — log and throw structured error
        }

        const err = new Error(
            `contractRenewal.service not available. renewContract(${contractId}) cannot be executed.` +
            " Wire contractRenewal.service and register it in the engine."
        );
        err.code = "RENEWAL_SERVICE_NOT_AVAILABLE";
        err.status = 501;
        throw err;
    }
};

module.exports = SubscriptionEngine;
