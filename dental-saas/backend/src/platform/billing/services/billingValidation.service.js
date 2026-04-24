/**
 * billingValidation.service.js
 * Phase 2 Hardening — Task 2: payment ↔ contract integrity.
 *
 * Payment webhooks carry provider-reported `amount` and `currency`. Before we
 * act on them (activate, extend, refund, etc.) we MUST confirm they match the
 * contract the checkout was opened against. Without this check a spoofed or
 * mis-routed webhook could silently activate an arbitrary subscription.
 *
 * `contract.amountMinor` is preferred when present. OrgContract does not
 * store minor units today (only `lockedPrice` in decimal units) so we
 * derive it — `contracts schema` is intentionally NOT touched.
 *
 * Currency comparison is case-insensitive.
 *
 * PLANE: Platform / Billing
 */

"use strict";

function _expectedAmountMinor(contract) {
    if (!contract) return null;
    if (typeof contract.amountMinor === "number") return contract.amountMinor;
    if (typeof contract.lockedPrice === "number") {
        return Math.round(contract.lockedPrice * 100);
    }
    return null;
}

function _expectedCurrency(contract) {
    if (!contract) return null;
    const raw = contract.currency || contract.lockedCurrency || null;
    return raw ? String(raw).toUpperCase() : null;
}

/**
 * assertPaymentMatchesContract
 * Throws when a webhook-reported payment does not match the contract it
 * claims to be for.
 *
 * @param {object} params
 * @param {number} params.amount    - Provider-reported amount in MINOR units.
 * @param {string} params.currency  - Provider-reported ISO 4217 currency.
 * @param {object} params.contract  - OrgContract document (populated).
 *
 * @throws {Error} with `.code` one of:
 *   - CONTRACT_REQUIRED
 *   - AMOUNT_MISMATCH
 *   - CURRENCY_MISMATCH
 */
function assertPaymentMatchesContract({ amount, currency, contract } = {}) {
    if (!contract) {
        throw Object.assign(
            new Error("CONTRACT_REQUIRED"),
            { code: "CONTRACT_REQUIRED" }
        );
    }

    const expectedAmount = _expectedAmountMinor(contract);
    if (expectedAmount === null || typeof amount !== "number") {
        throw Object.assign(
            new Error(`AMOUNT_MISMATCH: contract has no resolvable amount`),
            { code: "AMOUNT_MISMATCH", expected: expectedAmount, actual: amount }
        );
    }
    if (amount !== expectedAmount) {
        throw Object.assign(
            new Error(`AMOUNT_MISMATCH: payment=${amount}, contract=${expectedAmount}`),
            { code: "AMOUNT_MISMATCH", expected: expectedAmount, actual: amount }
        );
    }

    const expectedCurrency = _expectedCurrency(contract);
    const actualCurrency = currency ? String(currency).toUpperCase() : null;
    if (!expectedCurrency || !actualCurrency) {
        throw Object.assign(
            new Error("CURRENCY_MISMATCH: missing currency on payment or contract"),
            { code: "CURRENCY_MISMATCH", expected: expectedCurrency, actual: actualCurrency }
        );
    }
    if (actualCurrency !== expectedCurrency) {
        throw Object.assign(
            new Error(`CURRENCY_MISMATCH: payment=${actualCurrency}, contract=${expectedCurrency}`),
            { code: "CURRENCY_MISMATCH", expected: expectedCurrency, actual: actualCurrency }
        );
    }
}

module.exports = {
    assertPaymentMatchesContract,
};
