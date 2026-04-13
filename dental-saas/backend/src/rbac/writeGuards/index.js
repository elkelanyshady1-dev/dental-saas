/**
 * writeGuards/index.js — Write Access Registry Aggregator
 * Phase X.3 — Merges all domain write guard files.
 */
"use strict";

module.exports = {
    ...require("./patient.write"),
    ...require("./billing.write"),
    ...require("./clinical.write"),
    ...require("./operational.write"),
    ...require("./user.write"),        // Staff / User management
};
