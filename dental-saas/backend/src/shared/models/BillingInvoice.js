/**
 * src/shared/models/BillingInvoice.js
 *
 * Sprint 6 — TOMBSTONE: BillingInvoice domain removed.
 *
 * This file now re-exports PlatformInvoice as the canonical billing model.
 * All former consumers of BillingInvoice now transparently use PlatformInvoice.
 *
 * Migration:
 *   billinginvoices collection → DROPPED (DEV environment reset)
 *   platforminvoices collection → sole source of truth
 *
 * v9.4.2 (Option A lazy binding):
 *   This proxy used to export the compiled model at require time, which
 *   forced getPlatformModel() to run before platformConnection.init().
 *   Now we expose a Proxy that defers compilation until the first property
 *   access so existing `BillingInvoice.findOne(...)` call sites keep working
 *   without any change.
 */
"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const PlatformInvoiceDef = require("../../platform/billing/models/PlatformInvoice.model");

let _model = null;
function _getModel() {
    if (!_model) _model = getPlatformModel(PlatformInvoiceDef);
    return _model;
}

// Schema-alias keys that consumers destructure at require time. These are
// served from the Def directly (no model binding), so require-time
// destructuring doesn't force platformConnection.get() before init.
const SCHEMA_ALIASES = new Set([
    "billingInvoiceSchema",
    "invoiceSchema",
    "platformInvoiceSchema",
]);

// Proxy defers every property access + construction to the bound model,
// EXCEPT for the schema-alias keys above which short-circuit to the Def.
module.exports = new Proxy(function () {}, {
    get(_target, prop) {
        if (SCHEMA_ALIASES.has(prop)) return PlatformInvoiceDef.schema;
        const m = _getModel();
        const v = m[prop];
        return typeof v === "function" ? v.bind(m) : v;
    },
    set(_target, prop, value) {
        _getModel()[prop] = value;
        return true;
    },
    has(_target, prop) {
        if (SCHEMA_ALIASES.has(prop)) return true;
        return prop in _getModel();
    },
    apply(_target, thisArg, args) {
        return _getModel().apply(thisArg, args);
    },
    construct(_target, args) {
        const Model = _getModel();
        return new Model(...args);
    },
});
