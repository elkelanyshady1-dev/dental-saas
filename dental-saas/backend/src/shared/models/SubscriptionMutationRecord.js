/**
 * SubscriptionMutationRecord.js — Shared Re-export Proxy
 * 
 * The canonical model lives in platform/billing/models/.
 * This proxy allows organization-plane code to import it
 * via the shared layer without violating plane isolation.
 */
module.exports = require("../../platform/billing/models/SubscriptionMutationRecord.model").default;
