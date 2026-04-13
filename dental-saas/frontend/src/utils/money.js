/**
 * money.js
 * Frontend Financial Utility — Currency Display & Rounding
 *
 * Section 3 (frontend): Safe currency helpers for display components.
 * Eliminates floating-point precision artifacts like 3647.0899999999997.
 *
 * Usage:
 *   import { fmtMoney, roundCurrency, toDisplayAmount } from "@/utils/money";
 *
 * PLANE: Platform + Shared
 */

// ── Section 3: Safe rounding ──────────────────────────────────────────────────

/**
 * roundCurrency
 * Rounds a JS float to exactly 2 decimal places using the EPSILON trick.
 * Eliminates artifacts like 3647.0899999999997 → 3647.09.
 *
 * @param {number|string} value
 * @returns {number}
 */
export function roundCurrency(value) {
    return Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
}

/**
 * toMinorUnits
 * Convert a decimal monetary value to integer minor units.
 * e.g. 3647.09 EGP → 364709
 *
 * @param {number|string} amount
 * @returns {number}
 */
export function toMinorUnits(amount) {
    return Math.round(Number(amount ?? 0) * 100);
}

/**
 * fromMinorUnits
 * Convert integer minor units back to a decimal display value.
 * e.g. 364709 → 3647.09
 *
 * @param {number} amountMinor
 * @returns {number}
 */
export function fromMinorUnits(amountMinor) {
    return (amountMinor ?? 0) / 100;
}

// ── Section 6: Display formatting ────────────────────────────────────────────

/**
 * fmtMoney
 * Format a monetary amount for display using Intl.NumberFormat.
 * Input is ALWAYS rounded before formatting — eliminates floating artifacts.
 *
 * Section 6 fix: replaces raw JS number display (which shows 3647.0899999999997)
 * with a correct Intl-formatted string (3647.09 or EGP 3,647.09).
 *
 * @param {number|string} amount   Decimal amount (e.g. 3647.09)
 * @param {string}        currency ISO 4217 currency code (EGP, USD, AED, etc.)
 * @param {string}        [locale] BCP 47 locale string (default: en-US)
 * @returns {string}
 */
export function fmtMoney(amount, currency = "USD", locale = "en-US") {
    const safe = roundCurrency(amount);
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(safe);
    } catch {
        // Fallback for unknown/unsupported currency codes
        return `${currency} ${safe.toFixed(2)}`;
    }
}

/**
 * toDisplayAmount
 * Section 7: Normalize a raw amount for use inside a controlled <input>.
 * Returns a string with exactly 2 decimal places, safe for input defaultValue.
 *
 * Usage:
 *   setAmount(toDisplayAmount(invoice.outstanding))
 *   // "3647.09" instead of "3647.0899999999997"
 *
 * @param {number|string} amount
 * @returns {string}
 */
export function toDisplayAmount(amount) {
    return roundCurrency(amount).toFixed(2);
}

/**
 * safePaymentAmount
 * Section 8: Normalize and validate a payment amount before sending to backend.
 * Returns the rounded value, or throws if the value is not a positive finite number.
 *
 * @param {number|string} amount
 * @returns {number}
 * @throws {Error}
 */
export function safePaymentAmount(amount) {
    const val = roundCurrency(Number(amount));
    if (!isFinite(val) || val <= 0) {
        throw new Error(`Invalid payment amount: ${amount}`);
    }
    return val;
}
