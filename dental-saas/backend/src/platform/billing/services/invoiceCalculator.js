/**
 * invoiceCalculator.js
 * Platform Billing — Invoice Financial Calculator
 *
 * Provides pure, deterministic calculation helpers for PlatformInvoice amounts.
 * These are thin functions over existing model fields — they do NOT write to the DB.
 *
 * Why a separate module?
 *   1. Testability — pure functions with no side effects
 *   2. Consistency — all controllers use the same formulas
 *   3. Auditability — all calculation logic lives in one file
 *
 * The authoritative pricing chain lives in invoiceEngine.service.js.
 * This module is for read-time derived totals, validation, and summaries.
 *
 * PLANE: Platform
 */

"use strict";

// Section 4: Safe rounding utility — prevents floating-point artifacts in all derived totals
const { roundCurrency, toMinorUnits } = require("@utils/money");

// ─── Minor unit conversion ────────────────────────────────────────────────────

/**
 * toMinor — convert decimal amount to minor units (cents, fils, etc.)
 * @param {number} decimal
 * @returns {number}
 */
function toMinor(decimal) {
    return Math.round((decimal ?? 0) * 100);
}

/**
 * fromMinor — convert minor units back to decimal
 * @param {number} minor
 * @returns {number}
 */
function fromMinor(minor) {
    return (minor ?? 0) / 100;
}

// ─── Line item calculations ───────────────────────────────────────────────────

/**
 * computeLineItemAmount
 * Returns quantity * unitPrice rounded to 2 decimal places.
 *
 * @param {object} lineItem  { quantity, unitPrice }
 * @returns {number}
 */
function computeLineItemAmount(lineItem) {
    const qty = Number(lineItem.quantity ?? 1);
    const price = Number(lineItem.unitPrice ?? 0);
    return Math.round(qty * price * 100) / 100;
}

/**
 * computeLineItemsTotal
 * Sums all line item totals from an invoice's lineItems array.
 *
 * @param {object[]} lineItems
 * @returns {number}
 */
function computeLineItemsTotal(lineItems) {
    if (!Array.isArray(lineItems) || lineItems.length === 0) return 0;
    const sum = lineItems.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
    return Math.round(sum * 100) / 100;
}

// ─── Invoice-level calculations ───────────────────────────────────────────────

/**
 * deriveInvoiceSummary
 * Derives a display-ready financial summary from a PlatformInvoice document.
 * Does NOT modify the invoice — returns a plain object.
 *
 * @param {object} invoice  PlatformInvoice lean document
 * @returns {{
 *   subtotal: number,
 *   discount: number,
 *   creditApplied: number,
 *   tax: number,
 *   total: number,
 *   paidAmount: number,
 *   remainingAmount: number
 * }}
 */
function deriveInvoiceSummary(invoice) {
    const subtotal = roundCurrency(Number(invoice.subtotalAmount ?? 0));
    const discount = roundCurrency(
        Number(invoice.couponDiscountAmount ?? 0)
        + Number(invoice.campaignDiscountAmount ?? 0)
    );
    const creditApplied = roundCurrency(Number(invoice.creditApplied ?? 0));
    const tax = roundCurrency(Number(invoice.taxAmount ?? 0));
    const total = roundCurrency(Number(invoice.totalAmount ?? 0));

    // Section 5: paidAmount and remainingAmount must also be rounded
    const paidAmount = roundCurrency(Number(invoice.paidAmount ?? (invoice.status === "paid" ? total : 0)));
    const remainingAmount = roundCurrency(Math.max(0, total - paidAmount));

    return {
        subtotal,
        discount,
        creditApplied,
        tax,
        total,
        paidAmount,
        remainingAmount,
        // Section 9: minor-unit equivalents for ledger / API consumers
        totalMinor: toMinorUnits(total, invoice.currency || "EGP"),
        remainingMinor: toMinorUnits(remainingAmount, invoice.currency || "EGP")
    };
}

/**
 * validateInvoiceLineItemIntegrity
 * Validates that sum(lineItems[].total) === invoice.totalAmount within tolerance.
 *
 * @param {object} invoice  { lineItems, totalAmount }
 * @param {number} [toleranceCents=2]  Allowed floating-point deviation in cents
 * @returns {{ valid: boolean, computed: number, stored: number, deviation: number }}
 */
function validateInvoiceLineItemIntegrity(invoice, toleranceCents = 2) {
    const computed = computeLineItemsTotal(invoice.lineItems || []);
    const stored = Number(invoice.totalAmount ?? 0);
    const deviation = Math.abs(Math.round((computed - stored) * 100));
    return {
        valid: deviation <= toleranceCents,
        computed,
        stored,
        deviationCents: deviation
    };
}

/**
 * buildSyntheticLineItem
 * Creates a synthetic "Platform subscription" line item for invoices
 * that were generated before itemised line items were introduced.
 * Used during data migration and public invoice rendering for legacy invoices.
 *
 * @param {object} invoice  { totalAmount, currency }
 * @returns {object}  lineItem-shaped object (matches lineItemSchema minus _id)
 */
function buildSyntheticLineItem(invoice) {
    const amount = Number(invoice.totalAmount ?? 0);
    return {
        description: "Platform subscription",
        quantity: 1,
        unitPrice: amount,
        unitPriceMinor: toMinor(amount),
        total: amount,
        totalMinor: toMinor(amount),
        type: "plan"
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    toMinor,
    fromMinor,
    computeLineItemAmount,
    computeLineItemsTotal,
    deriveInvoiceSummary,
    validateInvoiceLineItemIntegrity,
    buildSyntheticLineItem
};
