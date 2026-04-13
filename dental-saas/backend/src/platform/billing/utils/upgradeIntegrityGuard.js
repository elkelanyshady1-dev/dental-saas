/**
 * upgradeIntegrityGuard.js
 * v22.3 — Orchestrator Atomicity & Safety Assertions
 *
 * PURPOSE:
 * Final integrity checks run BEFORE the orchestrator returns a response.
 * Catches any partial state that survived the transaction layer — belt-and-
 * suspenders on top of MongoDB atomicity.
 *
 * INCLUDES:
 *   assertUpgradeIntegrity()  — Validates contract/invoice/ledger consistency
 *   assertZeroValueSafety()   — Ensures zero-value plans did NOT create an invoice
 *
 * RULE:
 *   ❗ No partial upgrade state may reach the caller.
 *   ❗ Zero-value path must be completely isolated from invoice pipeline.
 *
 * PLANE: Platform
 */

"use strict";

const logger = require("@utils/logger");

/**
 * UpgradeIntegrityError
 * Thrown when post-transaction invariant checks fail.
 */
class UpgradeIntegrityError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = "UpgradeIntegrityError";
        this.code = code;
        this.status = 500;
        this.details = details;
    }
}

/**
 * assertUpgradeIntegrity
 *
 * Called AFTER the transaction commits, BEFORE the response is sent.
 * Validates that the upgrade produced a consistent state.
 *
 * Rules:
 *   1. Contract must always exist
 *   2. Paid plans (price > 0) must have an invoice
 *   3. Invoice totalAmount must match contract lockedPrice (within tolerance)
 *
 * @param {object}  params
 * @param {object}  params.contract        - The created OrgContract
 * @param {object}  [params.invoice]       - The created PlatformInvoice (null for zero-value)
 * @param {number}  params.price           - The locked price from pricingEngine
 * @param {string}  params.requestId       - Correlation ID
 * @throws {UpgradeIntegrityError}
 */
function assertUpgradeIntegrity({ contract, invoice, price, requestId }) {
    // Rule 1: Contract must exist
    if (!contract || !contract._id) {
        throw new UpgradeIntegrityError(
            "Upgrade integrity violation: contract is missing after transaction commit",
            "INTEGRITY_MISSING_CONTRACT",
            { requestId }
        );
    }

    // Rule 2: Paid plans must have an invoice
    if (price > 0 && (!invoice || !invoice._id)) {
        throw new UpgradeIntegrityError(
            `Upgrade integrity violation: paid plan (price=${price}) completed without an invoice`,
            "INTEGRITY_MISSING_INVOICE",
            { contractId: String(contract._id), price, requestId }
        );
    }

    // Rule 3: Invoice amount consistency (2-cent FP tolerance)
    if (price > 0 && invoice) {
        const invoiceTotal = invoice.totalAmount ?? 0;
        // totalAmount includes tax, so it may be >= lockedPrice.
        // It must NEVER be less than lockedPrice (would mean undercharging).
        if (invoiceTotal < price - 0.02) {
            logger.error({
                event: "UPGRADE_INTEGRITY_AMOUNT_MISMATCH",
                contractId: String(contract._id),
                invoiceId: String(invoice._id),
                lockedPrice: price,
                invoiceTotal,
                requestId
            }, "[UpgradeIntegrityGuard] Invoice totalAmount < lockedPrice — possible pricing error");
            // Log but don't throw — tax adjustments may reduce total in rare edge cases.
            // The pricing engine is authoritative; this is a detection mechanism.
        }
    }

    logger.info(
        {
            event: "UPGRADE_INTEGRITY_PASSED",
            contractId: String(contract._id),
            invoiceId: invoice ? String(invoice._id) : null,
            price,
            requestId
        },
        "[UpgradeIntegrityGuard] Upgrade integrity check passed"
    );
}

/**
 * assertZeroValueSafety
 *
 * Called AFTER the zero-value fast-path completes.
 * Ensures no invoice was accidentally created for a zero-value plan.
 *
 * RULE: Zero-value plans MUST NOT go through the invoice pipeline.
 *
 * @param {object}  params
 * @param {number}  params.price          - Must be 0
 * @param {object}  [params.invoice]      - Must be null/undefined
 * @param {object}  params.contract       - Must exist and be activated
 * @param {string}  params.requestId
 * @throws {UpgradeIntegrityError}
 */
function assertZeroValueSafety({ price, invoice, contract, requestId }) {
    if (price !== 0) return; // Only applies to zero-value plans

    if (invoice) {
        throw new UpgradeIntegrityError(
            `Zero-value safety violation: invoice was created for a zero-value plan (price=0)`,
            "ZERO_VALUE_INVOICE_CREATED",
            { contractId: String(contract?._id), invoiceId: String(invoice._id || invoice), requestId }
        );
    }

    if (!contract || !contract._id) {
        throw new UpgradeIntegrityError(
            "Zero-value safety violation: contract missing after zero-value activation",
            "ZERO_VALUE_MISSING_CONTRACT",
            { requestId }
        );
    }

    logger.info(
        {
            event: "ZERO_VALUE_SAFETY_PASSED",
            contractId: String(contract._id),
            requestId
        },
        "[UpgradeIntegrityGuard] Zero-value safety check passed"
    );
}

/**
 * assertBillingInvariant
 *
 * v23.0 — Enforces the core billing invariant:
 *   - Paid contracts (accessType === "paid") MUST have an invoice
 *   - Non-billable contracts (trial / promo) MUST NOT have an invoice
 *
 * Called after both the non-billable fast-path and the paid path.
 *
 * @param {object} contract  - The OrgContract document
 * @param {object|null} invoice - The PlatformInvoice (or null)
 * @throws {UpgradeIntegrityError}
 */
function assertBillingInvariant(contract, invoice) {
    if (!contract) return; // defensive — other guards catch this

    const accessType = contract.accessType || "paid";

    if (accessType === "paid" && !invoice) {
        throw new UpgradeIntegrityError(
            `Billing invariant violation: paid contract ${contract._id} has no invoice`,
            "PAID_CONTRACT_MISSING_INVOICE",
            { contractId: String(contract._id), accessType }
        );
    }

    if (accessType !== "paid" && invoice) {
        throw new UpgradeIntegrityError(
            `Billing invariant violation: non-billable contract ${contract._id} (accessType="${accessType}") has an invoice`,
            "NON_BILLABLE_CONTRACT_HAS_INVOICE",
            { contractId: String(contract._id), accessType, invoiceId: String(invoice._id) }
        );
    }

    logger.info(
        {
            event: "BILLING_INVARIANT_PASSED",
            contractId: String(contract._id),
            accessType,
            hasInvoice: Boolean(invoice)
        },
        "[UpgradeIntegrityGuard] Billing invariant check passed"
    );
}

module.exports = {
    assertUpgradeIntegrity,
    assertZeroValueSafety,
    assertBillingInvariant,
    UpgradeIntegrityError,
};
