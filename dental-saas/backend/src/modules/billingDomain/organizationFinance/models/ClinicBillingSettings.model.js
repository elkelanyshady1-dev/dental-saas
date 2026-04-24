/**
 * BillingSettings.model.js — Org-level clinic billing configuration (Phase 2 D3)
 *
 * Singleton per-org-DB: exactly one document per database. Stores:
 *   - default currency + supported currencies
 *   - tax rates (VAT/GST — multi-rate support via array)
 *   - invoice numbering scheme (prefix, padding, reset cadence)
 *   - invoice template (clinic identity, footer, terms)
 *   - enabled payment methods
 *   - discount policy defaults
 *
 * Version-tracked (optimistic concurrency) so PATCH flows can surface 409
 * VERSION_CONFLICT via the billingDomain error mapper.
 *
 * NOT SaaS-subscription billing. This is patient/clinic-internal billing config.
 */

"use strict";

const mongoose = require("mongoose");

// ISO 4217 — the most commonly used subset. Kept as a soft allow-list so that
// the validator (Zod) is the authoritative surface. Add as needed.
const SUPPORTED_CURRENCIES = ["AED", "SAR", "QAR", "KWD", "BHD", "OMR", "EGP", "USD", "EUR", "GBP", "INR", "PKR"];
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "insurance", "wallet"];
const NUMBERING_RESET_CADENCES = ["never", "yearly", "monthly"];
const taxRateSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    maxlength: 32
  },
  // "VAT_5", "GST_18"
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  // "VAT 5%"
  percent: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  _id: false
});
const numberingSchemeSchema = new mongoose.Schema({
  prefix: {
    type: String,
    default: "INV",
    trim: true,
    maxlength: 16
  },
  padding: {
    type: Number,
    default: 6,
    min: 1,
    max: 12
  },
  nextSequence: {
    type: Number,
    default: 1,
    min: 1
  },
  resetCadence: {
    type: String,
    enum: NUMBERING_RESET_CADENCES,
    default: "yearly"
  },
  lastResetAt: {
    type: Date,
    default: null
  }
}, {
  _id: false
});
const invoiceTemplateSchema = new mongoose.Schema({
  clinicName: {
    type: String,
    trim: true,
    maxlength: 200
  },
  headerLine: {
    type: String,
    trim: true,
    maxlength: 500
  },
  footerText: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  paymentTerms: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  logoUrl: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  showTaxBreakdown: {
    type: Boolean,
    default: true
  }
}, {
  _id: false
});
const discountPolicySchema = new mongoose.Schema({
  maxDiscountPercent: {
    type: Number,
    default: 25,
    min: 0,
    max: 100
  },
  requireReasonAbovePercent: {
    type: Number,
    default: 10,
    min: 0,
    max: 100
  },
  allowLineItemDiscounts: {
    type: Boolean,
    default: true
  }
}, {
  _id: false
});
const billingSettingsSchema = new mongoose.Schema({
  // Singleton anchor — exactly one doc per DB. Enforced via unique index
  // declared via schema.index() below. Do NOT add `unique: true` here —
  // Mongoose treats field-level + schema-level as two separate indexes
  // and logs a duplicate warning on boot.
  singletonKey: {
    type: String,
    default: "org-billing-settings",
    immutable: true
  },
  defaultCurrency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    default: "AED",
    enum: SUPPORTED_CURRENCIES
  },
  supportedCurrencies: {
    type: [String],
    default: ["AED"],
    validate: {
      validator: arr => Array.isArray(arr) && arr.length >= 1 && arr.every(c => SUPPORTED_CURRENCIES.includes(c)),
      message: "supportedCurrencies must be a non-empty subset of SUPPORTED_CURRENCIES"
    }
  },
  taxRates: {
    type: [taxRateSchema],
    default: [],
    validate: {
      validator(arr) {
        // At most one default tax rate
        const defaults = arr.filter(t => t.isDefault).length;
        return defaults <= 1;
      },
      message: "At most one taxRate may be marked isDefault"
    }
  },
  numberingScheme: {
    type: numberingSchemeSchema,
    default: () => ({})
  },
  invoiceTemplate: {
    type: invoiceTemplateSchema,
    default: () => ({})
  },
  paymentMethods: {
    type: [String],
    default: ["cash", "card"],
    validate: {
      validator: arr => Array.isArray(arr) && arr.length >= 1 && arr.every(m => PAYMENT_METHODS.includes(m)),
      message: "paymentMethods must be a non-empty subset of PAYMENT_METHODS"
    }
  },
  discountPolicy: {
    type: discountPolicySchema,
    default: () => ({})
  },
  // ── Quotation Numbering (Patient Quotations) ──────────────────────────
  quotationNumberingScheme: {
    type: numberingSchemeSchema,
    default: () => ({
      prefix: "QUO",
      padding: 6,
      nextSequence: 1,
      resetCadence: "yearly"
    })
  },
  quotationDefaults: {
    defaultExpiryDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365
    }
  },
  // Phase 2 D4 — Automated invoice email dispatch
  // When true, invoice.created triggers async PDF render + email to patient.
  // PDF attachment is opt-in (smaller mailboxes, some providers strip).
  emailInvoiceOnCreate: {
    type: Boolean,
    default: false
  },
  includeInvoicePdfAttachment: {
    type: Boolean,
    default: true
  },
  // Optimistic concurrency — PATCH requires expectedVersion
  version: {
    type: Number,
    default: 0
  },
  // Audit
  updatedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  minimize: false,
  collection: "billingsettings"
});
billingSettingsSchema.index({
  singletonKey: 1
}, {
  unique: true
});
const modelName = "ClinicBillingSettings";
module.exports = {
  modelName,
  schema: billingSettingsSchema,
  SUPPORTED_CURRENCIES,
  PAYMENT_METHODS,
  NUMBERING_RESET_CADENCES
};