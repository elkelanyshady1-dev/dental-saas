/**
 * subscriptionRenewal.service.js
 * Phase 3 — shared renewal eligibility helper.
 *
 * Used by both the manual (Kashier) and provider-driven (Stripe) paths so
 * renewal eligibility is not decided by each caller on the fly.
 *
 * A subscription is RENEWABLE when it is currently open (`active`), has
 * lapsed naturally (`expired`), or is recovering from a failed auto-charge
 * (`past_due`). Every other state (`canceled`, `suspended`, `trial`,
 * `provision_failed`) needs a dedicated flow first — a renewal attempt
 * must not silently paper over it.
 *
 * PLANE: Platform / Billing
 */

"use strict";

const RENEWABLE_STATUSES = new Set(["active", "expired", "past_due"]);

/**
 * canRenewSubscription
 * @param {object} subscription - org.subscription subdoc (or equivalent).
 * @returns {boolean}
 */
function canRenewSubscription(subscription) {
    if (!subscription) return false;
    return RENEWABLE_STATUSES.has(subscription.status);
}

module.exports = {
    canRenewSubscription,
    RENEWABLE_STATUSES,
};
