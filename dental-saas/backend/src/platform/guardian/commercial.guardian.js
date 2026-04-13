/**
 * commercial.guardian.js
 * Platform Guardian Layer — Contract Lifecycle Guard
 *
 * Wraps contract lifecycle operations with pre-condition enforcement.
 * All wrappers throw DomainViolation (from contractResolver) on invariant breach.
 *
 * Wrapped operations:
 *   - guardActivateContract(contractId, invoiceId, actorId, options)
 *   - guardReplaceContract(sourceContractId, updates, actorId, options)
 *   - guardTerminateContract(contractId, reason, actorId, options)
 *   - guardRenewContract(contractId, actorId, options)
 *
 * Pre-conditions blocked:
 *   ❌ Overlapping active contracts (>1 active per org before activation)
 *   ❌ Renewal of expired/suspended or autoRenew=false contracts
 *   ❌ Activation without required fields (planCode, currency, lockedPrice)
 *   ❌ Replacement of a non-active contract
 *   ❌ Termination of an already-superseded contract
 *
 * PLANE: Platform
 * IMPORT BOUNDARY: Only imports from platform billing domain. No org-plane imports.
 */

"use strict";

const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
const { guardianLogger, incrementMetric } = require("./observability.guardian");

// Lazy-load to avoid circular dependency issues at startup
const getOrgContract = () => getPlatformConnection().models["OrgContract"];

// Re-use DomainViolation from the resolver — consistent error contract
const { DomainViolation } = require("../billing/services/contractResolver.service");

// ─── Pre-Condition Validators ─────────────────────────────────────────────────

/**
 * assertNoOverlappingActiveContracts
 * Before activating a new contract: verify the org doesn't already have
 * 2+ active contracts (which would create a duplicate-active invariant violation).
 *
 * Note: activateContract itself supersedes the existing active one — so 1 active
 * is fine (will be superseded). Only 2+ is a problem (means a previous supersession
 * failed silently).
 */
async function assertNoOverlappingActiveContracts(organizationId, session) {
    const OrgContract = getOrgContract();
    if (!OrgContract) return;

    const count = await OrgContract.countDocuments({
        organizationId,
        contractStatus: "active"
    });

    if (count > 1) {
        incrementMetric("commercialBlockedEvents");
        throw new DomainViolation(
            `Organization ${organizationId} already has ${count} active contracts. ` +
            "Terminating overlapping contracts before activation is required.",
            "MULTIPLE_ACTIVE_CONTRACTS_PRE_ACTIVATION"
        );
    }
}

/**
 * assertContractHasRequiredFields
 * Validates the contract document has all fields needed for safe activation.
 */
function assertContractHasRequiredFields(contract) {
    const missing = [];
    if (!contract.planCode) missing.push("planCode");
    if (!contract.currency) missing.push("currency");
    if (contract.lockedPrice == null) missing.push("lockedPrice");
    if (!contract.organizationId) missing.push("organizationId");

    if (missing.length > 0) {
        incrementMetric("commercialBlockedEvents");
        throw new DomainViolation(
            `Contract ${contract._id} is missing required fields for activation: ${missing.join(", ")}`,
            "MISSING_REQUIRED_CONTRACT_FIELDS"
        );
    }
}

/**
 * assertRenewalEligible
 * Before renewing: verify the contract is in a state that allows renewal.
 */
function assertRenewalEligible(contract) {
    if (!["active", "draft"].includes(contract.contractStatus)) {
        incrementMetric("commercialBlockedEvents");
        throw new DomainViolation(
            `Contract ${contract._id} is not eligible for renewal (status: "${contract.contractStatus}"). ` +
            "Only active or draft contracts can be renewed.",
            "RENEWAL_INELIGIBLE_STATUS"
        );
    }

    if (contract.autoRenew === false) {
        incrementMetric("commercialBlockedEvents");
        throw new DomainViolation(
            `Contract ${contract._id} has autoRenew=false — renewal is disabled by contract terms.`,
            "AUTO_RENEW_DISABLED"
        );
    }
}

// ─── Guarded Wrappers ─────────────────────────────────────────────────────────

/**
 * guardActivateContract
 *
 * Wraps the contractEngine.activateContract with pre-conditions:
 *   - No overlapping active contracts for the org
 *   - Contract has all required fields
 *
 * @param {Function} activateFn    - contractEngine.activateContract
 * @param {string}   contractId
 * @param {string}   invoiceId
 * @param {string}   actorId
 * @param {object}   [options]
 * @returns {Promise<{ contract, organization }>}
 */
async function guardActivateContract(activateFn, contractId, invoiceId, actorId, options = {}) {
    const OrgContract = getOrgContract();

    // Load the draft contract to check pre-conditions
    const contract = OrgContract
        ? await OrgContract.findById(contractId).session(options.session || null).lean()
        : null;

    if (contract) {
        // Pre-condition 1: required fields
        assertContractHasRequiredFields(contract);

        // Pre-condition 2: no org already has 2+ active contracts
        await assertNoOverlappingActiveContracts(contract.organizationId, options.session);
    }

    guardianLogger.info(
        { contractId, invoiceId, actorId, preConditions: "passed" },
        "Commercial Guardian: activateContract pre-conditions passed"
    );

    return activateFn(contractId, invoiceId, actorId, options);
}

/**
 * guardReplaceContract
 *
 * Wraps contractEngine.replaceContract.
 * Pre-condition: source contract must be active (engine already checks, guardian adds logging).
 *
 * @param {Function} replaceFn
 * @param {string}   sourceContractId
 * @param {object}   updates
 * @param {string}   actorId
 * @param {object}   [options]
 * @returns {Promise<OrgContract>}
 */
async function guardReplaceContract(replaceFn, sourceContractId, updates, actorId, options = {}) {
    const OrgContract = getOrgContract();

    if (OrgContract) {
        const source = await OrgContract.findById(sourceContractId).session(options.session || null).lean();
        if (source && source.contractStatus !== "active") {
            incrementMetric("commercialBlockedEvents");
            throw new DomainViolation(
                `Commercial Guardian blocked replaceContract: source contract ${sourceContractId} ` +
                `is "${source.contractStatus}", not "active". Only active contracts can be replaced.`,
                "REPLACE_NON_ACTIVE_CONTRACT"
            );
        }
    }

    guardianLogger.info(
        { sourceContractId, actorId, preConditions: "passed" },
        "Commercial Guardian: replaceContract pre-conditions passed"
    );

    return replaceFn(sourceContractId, updates, actorId, options);
}

/**
 * guardTerminateContract
 *
 * Wraps contractEngine.expireContract.
 * Pre-condition: superseded contracts cannot be re-terminated (immutable history).
 *
 * @param {Function} terminateFn
 * @param {string}   contractId
 * @param {string}   reason
 * @param {string}   actorId
 * @param {object}   [options]
 * @returns {Promise<OrgContract>}
 */
async function guardTerminateContract(terminateFn, contractId, reason, actorId, options = {}) {
    const OrgContract = getOrgContract();

    if (OrgContract) {
        const contract = await OrgContract.findById(contractId).session(options.session || null).lean();
        if (contract && contract.contractStatus === "superseded") {
            incrementMetric("commercialBlockedEvents");
            throw new DomainViolation(
                `Commercial Guardian blocked termination of superseded contract ${contractId}. ` +
                "Superseded contracts are immutable historical records.",
                "TERMINATE_SUPERSEDED_CONTRACT"
            );
        }
    }

    guardianLogger.info(
        { contractId, reason, actorId },
        "Commercial Guardian: terminateContract pre-conditions passed"
    );

    return terminateFn(contractId, reason, actorId, options);
}

/**
 * guardRenewContract
 *
 * Wraps a renewal function with eligibility pre-conditions.
 * For use when a renewal service is added.
 *
 * @param {Function} renewFn
 * @param {string}   contractId
 * @param {string}   actorId
 * @param {object}   [options]
 * @returns {Promise<any>}
 */
async function guardRenewContract(renewFn, contractId, actorId, options = {}) {
    const OrgContract = getOrgContract();

    if (OrgContract) {
        const contract = await OrgContract.findById(contractId).session(options.session || null).lean();
        if (contract) {
            assertRenewalEligible(contract);
        }
    }

    guardianLogger.info(
        { contractId, actorId },
        "Commercial Guardian: renewContract pre-conditions passed"
    );

    return renewFn(contractId, actorId, options);
}

// ─── Module Export ────────────────────────────────────────────────────────────

module.exports = {
    guardActivateContract,
    guardReplaceContract,
    guardTerminateContract,
    guardRenewContract,
    // Export pre-condition validators for testing
    _validators: {
        assertNoOverlappingActiveContracts,
        assertContractHasRequiredFields,
        assertRenewalEligible
    }
};
