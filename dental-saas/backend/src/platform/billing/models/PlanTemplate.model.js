/**
 * PlanTemplate.model.js
 * Sprint 1 — Hybrid Billing Foundations
 *
 * PlanTemplate is the commercial product definition: the thing the sales team
 * creates and markets. It is immutable once published. Changes create a new
 * PlanVersion, never mutate this document.
 *
 * Relationship:
 *   PlanTemplate 1──* PlanVersion 1──* OrgContract *──1 Organization
 *
 * PLANE: Platform
 * COLLECTION: plantemplates
 */

"use strict";

const mongoose = require("mongoose");

// ─── Global Pricing Block (Phase 1 — pricing decoupling) ────────────────────
// Single USD price list. EG billing is handled at resolve-time (USD → EGP via
// Kashier), not stored per-region. Legacy `regions[]` below is kept for
// backward compatibility with unmigrated templates.
const globalPricingSchema = new mongoose.Schema({
    currency: {
        type: String,
        required: true,
        uppercase: true,
        default: "USD"
    },
    amountMonthly: { type: Number, required: true, min: 0 },
    amountYearly: { type: Number, required: true, min: 0 },
    providerPriceIds: {
        stripe: {
            monthly: { type: String, default: "" },
            yearly: { type: String, default: "" }
        },
        kashier: {
            monthly: { type: String, default: "" },
            yearly: { type: String, default: "" }
        }
    }
}, { _id: false });

// ─── Region Pricing Block ────────────────────────────────────────────────────
// Each PlanTemplate defines pricing per sovereign region.
// ISO country list maps to a billing region for provider price lookup.
const regionPricingSchema = new mongoose.Schema({
    regionCode: {
        type: String,
        required: true,
        uppercase: true,
        enum: ["EU", "US", "MEA", "APAC"]
    },
    countries: [{
        type: String,
        uppercase: true,
        trim: true
    }],
    currency: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    monthly: { type: Number, required: true, min: 0 },
    yearly: { type: Number, required: true, min: 0 },
    biennial: { type: Number, min: 0 },

    // Provider-specific price/plan IDs — kept in template for catalog use.
    // Actual subscription creation reads PlanVersion.providerPriceIds.
    providerPriceIds: {
        stripe: {
            monthly: { type: String },
            yearly: { type: String },
            biennial: { type: String }
        },
        paymob: {
            monthly: { type: String },
            yearly: { type: String },
            biennial: { type: String }
        }
    }
}, { _id: false });

// ─── Module Entitlements ─────────────────────────────────────────────────────
const moduleEntitlementSchema = new mongoose.Schema({
    patients: { type: Boolean, default: true },
    appointments: { type: Boolean, default: true },
    finance: { type: Boolean, default: true },
    inventory: { type: Boolean, default: false },
    lab: { type: Boolean, default: false },
    orthodonticsAdv: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    booking: { type: Boolean, default: false },
    communication: {
        enabled: { type: Boolean, default: false },
        smsQuota: { type: Number, default: 0 },
        whatsappQuota: { type: Number, default: 0 },
        emailQuota: { type: Number, default: 0 }
    }
}, { _id: false });

// ─── Main Schema ─────────────────────────────────────────────────────────────
const planTemplateSchema = new mongoose.Schema(
    {
        // ── Identity ──────────────────────────────────────────────────────────
        name: {
            type: String,
            required: true,
            trim: true
        },
        code: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
            // Unique enforced via index below
        },
        description: {
            type: String,
            default: ""
        },

        // ── Lifecycle ─────────────────────────────────────────────────────────
        // Templates are drafted → published → archived.
        // Once published, fields may NOT be mutated — create a new PlanVersion.
        status: {
            type: String,
            enum: ["draft", "published", "archived"],
            default: "draft"
        },

        // ── Limits ────────────────────────────────────────────────────────────
        limits: {
            maxUsers: { type: Number, required: true, default: 1 },
            maxBranches: { type: Number, required: true, default: 1 }
        },

        // ── Module Entitlements ───────────────────────────────────────────────
        modules: {
            type: moduleEntitlementSchema,
            default: () => ({})
        },

        // ── Pricing ───────────────────────────────────────────────────────────
        // Phase 1 (pricing decoupling): `global` is the new canonical shape.
        // `regions[]` remains for backward compatibility until all templates
        // are migrated via scripts/migratePricingToGlobal.js.
        pricing: {
            baseCurrency: { type: String, default: "USD", uppercase: true },
            // New canonical field — optional during migration window.
            global: { type: globalPricingSchema, default: null },
            // @deprecated — Phase 10. Read-only from this version forward.
            // Scheduled for removal in Phase 11 once auditLegacyPricing.js
            // reports zero unmigrated documents.
            regions: [regionPricingSchema]
        },

        // ── Default Inflation Policy ──────────────────────────────────────────
        // Pre-fills OrgContract.renewalTerms.inflationPercent at provisioning.
        // Never overrides a locked OrgContract.
        inflationPolicy: {
            defaultPercent: { type: Number, default: 0 },
            applyAfterYears: { type: Number, default: 1 }
        },

        // ── Catalog Visibility ────────────────────────────────────────────────
        visibility: {
            hiddenCountries: [{ type: String, uppercase: true }],
            isPublic: { type: Boolean, default: true }
        },

        // ── Trial Config (defaults for new contracts) ─────────────────────────
        trialDays: {
            type: Number,
            default: 14
        },

        // ── Audit ─────────────────────────────────────────────────────────────
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            required: true
        },
        lastModifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser"
        },

        // OAV — Optimistic Atomic Version guard
        version: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true,
        collection: "plantemplates"
    }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
planTemplateSchema.index({ code: 1 }, { unique: true });
planTemplateSchema.index({ status: 1 });
planTemplateSchema.index({ "pricing.regions.countries": 1 }); // Country lookup
planTemplateSchema.index({ "visibility.hiddenCountries": 1 });
planTemplateSchema.index({ createdAt: -1 });

// ─── OAV Pre-Save Hook ───────────────────────────────────────────────────────
planTemplateSchema.pre("save", async function () {
    if (!this.isNew) {
        this.version += 1;
    }
});

const modelName = "PlanTemplate";

module.exports = {
    modelName,
    schema: planTemplateSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, planTemplateSchema),
};
