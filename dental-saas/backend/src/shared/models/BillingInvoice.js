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
 * IMPORTANT: Legacy callers will continue to function because PlatformInvoice
 * has a compatible field set (status, organizationId, providerPaymentId, etc.).
 * Any field that existed in BillingInvoice but not in PlatformInvoice was
 * legacy-only and is intentionally NOT migrated.
 */
"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const PlatformInvoiceDef = require("../../platform/billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
module.exports = PlatformInvoice;

// Compat alias: consumers that destructure { billingInvoiceSchema } or { invoiceSchema }
// now receive the platformInvoiceSchema under those names.
// This prevents import-destructure errors in files that were not yet refactored.
const {
  platformInvoiceSchema
} = (() => {
  const mongoose = require("mongoose");
  // PlatformInvoice.schema is the Mongoose schema object on the model
  return {
    platformInvoiceSchema: PlatformInvoice.schema
  };
})();
module.exports.billingInvoiceSchema = platformInvoiceSchema;
module.exports.invoiceSchema = platformInvoiceSchema;
module.exports.platformInvoiceSchema = platformInvoiceSchema;