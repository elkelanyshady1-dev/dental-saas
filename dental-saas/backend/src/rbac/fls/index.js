/**
 * fls/index.js — Field Access Registry Aggregator
 * Phase X.3 — Merges all domain FLS files into a single registry.
 *
 * Preserves the exact same export shape as the original fieldAccessRegistry.js:
 *   { fieldAccess, getResourceTypes, getResourceRoles, hasFullAccess }
 */

"use strict";

const fieldAccess = {
    ...require("./patient.fls"),
    ...require("./billing.fls"),
    ...require("./clinical.fls"),
    ...require("./operational.fls"),
    ...require("./user.fls"),
    ...require("./portal.fls"),
};

// ─── Resource Registry (for introspection) ──────────────────────────────────

function getResourceTypes() {
    return Object.keys(fieldAccess);
}

function getResourceRoles(resourceType) {
    const def = fieldAccess[resourceType];
    return def ? Object.keys(def) : [];
}

function hasFullAccess(resourceType, role) {
    const def = fieldAccess[resourceType]?.[role];
    return Array.isArray(def) && def.length === 1 && def[0] === "*";
}

module.exports = {
    fieldAccess,
    getResourceTypes,
    getResourceRoles,
    hasFullAccess,
};
