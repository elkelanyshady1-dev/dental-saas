/**
 * accessTypeResolver.js
 * v23.0 — Access Type Abstraction
 *
 * PURPOSE:
 * Single source of truth for resolving a contract's access type
 * based on pricing and trial configuration.
 *
 * Access types:
 *   "paid"  — lockedPrice > 0, requires invoice + payment
 *   "trial" — trialDays > 0, time-limited free access
 *   "promo" — lockedPrice === 0 AND trialDays === 0, indefinite free access
 *
 * NOTE: "grace" is NOT an access type — it is a contractStatus used by the
 * dunning engine when payment is overdue. Do not conflate the two.
 *
 * PLANE: Platform
 */

"use strict";

/**
 * resolveAccessType
 *
 * Determines the access type for a contract being created.
 *
 * @param {object} params
 * @param {number} params.trialDays    - Number of trial days (0 = no trial)
 * @param {number} params.lockedPrice  - The final locked price for the contract
 * @returns {"trial" | "paid" | "promo"}
 */
function resolveAccessType({ trialDays, lockedPrice }) {
    if (lockedPrice === 0 && trialDays === 0) return "promo";
    if (trialDays > 0) return "trial";
    return "paid";
}

module.exports = { resolveAccessType };
