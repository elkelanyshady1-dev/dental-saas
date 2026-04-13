/**
 * financialInvariant.service.js
 * Central authority for validating financial record integrity.
 * Phase v8_2_1 Stabilization
 */

"use strict";

class FinancialInvariantService {
    /**
     * Validates an invoice-like object against enterprise financial rules.
     * @param {Object} record - PlatformInvoice or PatientInvoice document
     */
    static validateInvoice(record) {
        const currency = record.currency;
        if (!currency) throw new Error("Financial Invariant Violation: Currency is mandatory");

        const monetaryFields = this._getMonetaryFields(record);

        // 1. Suffix & Type Check
        monetaryFields.forEach(field => {
            if (!field.endsWith("Minor") && field !== "currency" && field !== "status") {
                // We allow legacy decimal fields but they are no longer source of truth
            }

            const value = record[field];
            if (value !== undefined && value !== null) {
                // 2 & 3. Integer & Safe Integer Check
                if (!Number.isInteger(value)) {
                    throw new Error(`Financial Invariant Violation: Field ${field} must be an integer (minor units)`);
                }
                if (!Number.isSafeInteger(value)) {
                    throw new Error(`Financial Invariant Violation: Field ${field} exceeds safe integer range`);
                }
            }
        });

        // Sprint 6: BillingInvoice removed; validate sum for PlatformInvoice
        if (record.constructor.modelName === "PlatformInvoice") {
            this._validateBillingSum(record);
        }

        // 5. Paid Immutability Check
        if (record.status === "paid" && record.isModified && record.isModified()) {
            // This is secondary to the model-level pre-save, but good for defense-in-depth
            const modifiedFields = record.modifiedPaths();
            const hasMonetaryChange = modifiedFields.some(path => path.endsWith("Minor"));
            if (hasMonetaryChange) {
                throw new Error("Financial Invariant Violation: Cannot modify monetary fields on paid invoice");
            }
        }

        return true;
    }

    static _getMonetaryFields(record) {
        return Object.keys(record.toObject ? record.toObject() : record)
            .filter(key => key.endsWith("Minor"));
    }

    static _validateBillingSum(record) {
        const base = record.basePlanAmountMinor || 0;
        const addOn = record.addOnAmountMinor || 0;
        const overage = record.overageAmountMinor || 0;
        const coupon = record.couponDiscountAmountMinor || 0;
        const campaign = record.campaignDiscountAmountMinor || 0;
        const tax = record.taxAmountMinor || 0;
        const total = record.totalAmountMinor || 0;

        const expectedTotal = base + addOn + overage - coupon - campaign + tax;

        if (total !== expectedTotal) {
            throw new Error(`Financial Invariant Violation: Sum mismatch. Expected ${expectedTotal}, got ${total}`);
        }
    }
}

module.exports = FinancialInvariantService;
