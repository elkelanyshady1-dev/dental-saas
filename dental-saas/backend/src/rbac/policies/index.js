/**
 * policies/index.js — Policy Registry Aggregator
 * Phase X.3 — Merges all domain policy files into a single registry.
 *
 * This is the ONLY file consumers should import.
 * Preserves the exact same export shape as the original policyRegistry.js:
 *   { policies, helpers }
 */

"use strict";

const policies = {
    ...require("./patient.policy"),
    ...require("./appointment.policy"),
    ...require("./billing.policy"),
    ...require("./clinical.policy"),
    ...require("./user.policy"),
    ...require("./portal.policy"),
    ...require("./support.policy"),
    ...require("./recall.policy"),
    ...require("./inventory.policy"),
    ...require("./documents.policy"),
};

module.exports = {
    policies,
    // Re-export condition helpers for consumers that need custom policies
    helpers: require("../policyConditions"),
};
