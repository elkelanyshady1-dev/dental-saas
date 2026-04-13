/**
 * orgBilling.contract.js — Org Billing Bridge Contract
 * @rls-bridge-contract — Contract definition only. ZERO DB access.
 *
 * Defines the DTO shapes that the org-facing billing bridge may return.
 * Bridge services MUST map platform models to these shapes —
 * raw Mongoose documents MUST NEVER cross the bridge boundary.
 *
 * INVARIANTS:
 *   ✔ No platform-internal IDs exposed (e.g., Stripe customer IDs)
 *   ✔ No schema metadata (_v, __v, version, etc.)
 *   ✔ organizationId is NEVER in the output (caller already knows it)
 *   ✔ All dates are ISO strings
 *   ✔ All amounts are in minor units (integer cents/piastres)
 *
 * PLANE: Bridge layer (Org → Platform read-only)
 *
 * @module specs/contracts/bridges/orgBilling.contract
 */

"use strict";

const OrgBillingContract = Object.freeze({

    // ── getActiveSubscription ────────────────────────────────────────
    // Returns the org's current subscription state.
    // Source: OrgContract (active) + PlanVersion + EntitlementResolver
    getActiveSubscription: {
        input: ["organizationId"],
        output: {
            planName:        "string",          // e.g. "Professional"
            planTier:        "string",          // e.g. "professional"
            status:          "active | trial | canceled | past_due | expired",
            billingInterval: "monthly | yearly | biennial",
            currentPeriodStart: "date",         // ISO string
            currentPeriodEnd:   "date",         // ISO string (= renewal date)
            trialEnd:        "date | null",     // ISO string or null
            features:        "string[]",        // entitlement feature keys
            currency:        "string",          // e.g. "USD"
            amountMinor:     "number",          // locked price in minor units
        },
    },

    // ── getInvoiceHistory ────────────────────────────────────────────
    // Returns paginated platform invoices for this org.
    // Source: PlatformInvoice (filtered by organizationId)
    getInvoiceHistory: {
        input: ["organizationId", "page?", "limit?"],
        output: [{
            id:          "string",              // PlatformInvoice._id
            invoiceNo:   "string",              // Human-readable number
            amount:      "number",              // Minor units
            currency:    "string",
            status:      "paid | unpaid | failed | refunded | void",
            periodStart: "date",
            periodEnd:   "date",
            createdAt:   "date",
            pdfUrl:      "string | null",       // Pre-signed URL or null
        }],
    },

    // ── getUsageQuotas ───────────────────────────────────────────────
    // Returns entitlement-based usage vs limits.
    // Source: EntitlementResolver + OrgContract capabilities
    getUsageQuotas: {
        input: ["organizationId"],
        output: [{
            feature:     "string",              // e.g. "maxUsers", "maxBranches"
            displayName: "string",              // e.g. "Staff Members"
            used:        "number",
            limit:       "number",              // -1 = unlimited
            unit:        "string",              // e.g. "users", "GB", "branches"
        }],
    },

    // ── createPortalSession ──────────────────────────────────────────
    // Creates a Stripe Customer Portal session for payment method management.
    // Source: Stripe API via paymentProviderFactory
    createPortalSession: {
        input: ["organizationId"],
        output: {
            portalUrl:   "string",              // Redirect URL
            expiresAt:   "date",                // Session expiry
        },
    },
});

module.exports = { OrgBillingContract };
