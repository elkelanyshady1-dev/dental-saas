const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        // ─── Duplicate Detection Support ──────────────────────────────────────────
        // Normalized form of `name` with all non-alphanumeric characters removed,
        // lowercased — used for fuzzy duplicate name detection at provisioning time.
        // Populated automatically by the pre-save hook below.
        normalizedName: {
            type: String,
            default: null,
        },

        slug: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // v5.0 — planId REMOVED (audit B-4, 2026-03-04)
        // planId used to point to the legacy shared/models/Plan.model catalog.
        // OrgContract.planVersionId is the authoritative commercial reference.
        // Plan.model is still used for the PUBLIC pricing/plan listing (not stored on org).
        version: {
            type: Number,
            default: 0
        },
        // Sprint 4: billingCountry + billingCurrency moved to OrgContract domain.
        // Optional on org — populated if/when contract is activated.
        billingCountry: { type: String, default: null },  // ISO code — set by OrgContract on activation
        billingCurrency: { type: String, default: null }, // Locked on first contract

        // Sprint 4: regionCode optional at creation — assigned by provisioning or left null for global orgs.
        regionCode: {
            type: String,
            enum: ["EU", "US", "MEA", "APAC", null],
            default: null,
            immutable: false,  // Must allow initial set after creation
            uppercase: true
        },

        // v20.1 Wave4 — ISO country codes are the canonical stored value.
        // display-name mapping is frontend-only (SearchableCountrySelect).
        // Supported countries enforced at HTTP layer (organizationValidator.js).
        country: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            match: [/^[A-Z]{2}$/, "country must be a valid 2-letter ISO 3166-1 alpha-2 code"]
        },

        // ─── Subscription Runtime Object (v9 → Sprint 4 cleaned) ──────────────────────
        //
        // COMMERCIAL FIELDS REMOVED — Sprint 4 DEV REFACTOR (2026-03-03)
        // The following fields are now owned exclusively by OrgContract:
        //   plan (String)           → OrgContract.planCode + org.planId (ObjectId)
        //   customPricing           → OrgContract.pricingOverride
        //   renewalPolicy           → OrgContract.renewalTerms
        //   billingCurrency         → OrgContract.currency
        //   basePriceAtSubscription → OrgContract.lockedPrice
        //   coupon                  → OrgContract.appliedCoupon
        //
        // Remaining fields are RUNTIME STATUS only (read by subscriptionMonitor,
        // orgSubscriptionGuard, and provider integration).
        subscription: {
            // ── Runtime Status ──
            status: {
                type: String,
                enum: ["trial", "active", "suspended", "expired", "canceled", "past_due", "provision_failed"],
                default: "trial",
            },
            trialEndsAt: {
                type: Date,
                default: null,
            },
            currentPeriodStart: {
                type: Date,
                default: null,
            },
            currentPeriodEnd: {
                type: Date,
                default: null,
            },
            gracePeriodEnd: {
                type: Date,
                default: null
            },
            gracePeriodDays: { type: Number, default: 7 },
            autoRenew: {
                type: Boolean,
                default: true,
            },

            // ── Provider Integration (runtime, not commercial) ──
            paymentProvider: {
                type: String,
                enum: ["stripe", "paymob", "paypal"],
                default: "stripe"
            },
            providerCustomerId: { type: String },
            providerSubscriptionId: { type: String },
            lastProviderPaymentId: { type: String, default: null },

            // ── Plan Version Snapshot (for renewal mismatch detection) ──
            planVersion: { type: Number, default: 0 },
            lastPlanChangeAt: { type: Date, default: null },

            // ── Scheduled Plan Change (runtime flag, not commercial terms) ──
            scheduledPlanChange: {
                newPlan: { type: String },
                effectiveDate: { type: Date },
                scheduledAt: { type: Date }
            },

            // ── Sales owner (CRM) ──
            salesOwnerId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "PlatformUser"
            },
        },

        // v20.1 Phase 3 — Trial subdocument REMOVED.
        // Trial state is now unified under subscription.trialEndsAt + subscription.status === "trial".
        // Migration: scripts/migrateTrialToSubscription.js

        // ─── Module Runtime Flags ─────────────────────────────────────────────────
        // ⚠️  SOFT-DEPRECATED (Phase A+, March 2026)
        //
        // These fields are NO LONGER the SSOT for authorization decisions.
        // The authoritative source is now:
        //   req.capabilities  (resolved by unifiedCapabilityMiddleware)
        //   ← PlanVersion.modules × FeatureFlags × admin toggles
        //
        // These org-level flags still exist for:
        //   1. Platform admin UI writes (toggleModule controller)
        //   2. Legacy reads (migration compatibility)
        //   3. Provisioning-time defaults
        //
        // DO NOT USE for new authorization checks. Use req.capabilities instead.
        // Phase B will migrate all reads to a runtime moduleRegistry.
        //
        // Controlled ONLY by Platform Admins / Stripe plan logic.
        // No org-user can self-enable a module through the API.
        // Keys must match MODULE_REGISTRY entries in backend/src/orgRuntime/moduleRegistry.js
        modules: {
            // Core modules — enabled for all active orgs by default
            patients: { type: Boolean, default: true },
            notifications: { type: Boolean, default: true },
            appointments: { type: Boolean, default: true },
            accounting: { type: Boolean, default: true },

            // Plan-gated modules — disabled until plan upgrade authorizes them
            booking: { type: Boolean, default: false },
            analytics: { type: Boolean, default: false },
            inventory: { type: Boolean, default: false },
            orthodontics: { type: Boolean, default: false },
            labs: { type: Boolean, default: false },
        },

        // Timestamp updated whenever any module flag changes (platform-side write)
        modulesUpdatedAt: {
            type: Date,
            default: null,
        },

        // ⚠️  SOFT-DEPRECATED (Phase A+, March 2026)
        //
        // Organization-level feature overrides. Superseded by:
        //   req.capabilities.features  (resolved by unifiedCapabilityMiddleware)
        //
        // This Object is still written by platform admin feature override endpoints
        // but should NOT be read directly for authorization. All authorization
        // reads must go through req.capabilities.
        //
        // Phase B will consolidate this into the runtime module engine.
        //
        // v2.0: Changed from Map to Mixed. Mongoose Map rejects dotted keys
        // (e.g., "patients.view") which are required by the FeatureDefinition
        // registry. Mixed stores a plain JS object with no key restrictions.
        // Access pattern: org.features["patients.view"].enabled
        features: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        appointmentSettings: {
            slotDuration: {
                type: Number,
                default: 15,
                enum: [15, 30, 45, 60],
            },
            workingHours: {
                start: { type: String, default: "08:00" },
                end: { type: String, default: "20:00" },
            },
        },

        // ─── White-label / Tenant Configuration ──────────────────────────────────
        organizationSettings: {
            isPublicLandingEnabled: { type: Boolean, default: false },
            branding: {
                primaryColor: { type: String, default: null },
                logo: { type: String, default: null }, // legacy URL field
            },
            // ── Time & Locale (v1.0) ────────────────────────────────────────────
            // timezone: IANA timezone string (e.g. "Africa/Cairo", "UTC")
            // autoDetectTimezone: if true, frontend uses browser timezone
            timezone: { type: String, default: "Africa/Cairo" },
            autoDetectTimezone: { type: Boolean, default: true },
        },

        // ─── Branding / Logo (S3-backed) ──────────────────────────────────────────
        logoUrl: {
            type: String,
            default: null,
        },
        logoKey: {
            // S3 object key – used for deletion / presigned URL refresh
            type: String,
            default: null,
        },
        // ─── UI Language Preference (v1.8.2) ─────────────────────────────────────
        defaultLanguage: {
            type: String,
            enum: ["en", "ar"],
            default: "en",
        },
        isVerified: {
            type: Boolean,
            default: false,
        },

        // ─── Soft Delete / Archive (Platform Control Plane) ───────────────────────
        // Archived orgs are excluded from the default list.
        // isArchived replaces hard delete — data is never purged.
        isArchived: {
            type: Boolean,
            default: false,
        },
        archivedAt: {
            type: Date,
            default: null,
        },

        // ─── Sprint 1: Hybrid Billing Contract Reference ──────────────────────────
        // Points to the currently active OrgContract document.
        // Populated by contractActivation.service.js when a contract is activated.
        // Legacy subscription subdocument remains authoritative during dual-read period.
        currentContractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            default: null
        },

        // ─── Sprint 1: Trial Timestamps (Hybrid Billing layer) ────────────────────
        // These are the authoritative trial dates for the Hybrid Billing engine.
        // Legacy: subscription.trialEndsAt remains for backward compat.
        // New flow: reads trialStartDate / trialEndDate from here.
        trialStartDate: {
            type: Date,
            default: null
        },
        trialEndDate: {
            type: Date,
            default: null
        },
        // Flag: set to true when the trial has been consumed and cannot be restarted
        trialConsumed: {
            type: Boolean,
            default: false
        },

        // ─── Organisation Contacts ────────────────────────────────────────────────
        // Multiple contacts supported. Mutations via POST/PATCH/DELETE /contacts/* endpoints.
        // Sentinel §4: phone stored as-is (international format). WhatsApp URL built client-side.
        contacts: [{
            role: {
                type: String, trim: true, default: 'owner',
                enum: ['owner', 'it', 'finance', 'operations', 'sales', 'other']
            },
            ownerName: { type: String, trim: true, default: null },
            phone: { type: String, trim: true, default: null },
        }],

        // ─── CRM ────────────────────────────────────────────────────────────────────
        // Lightweight CRM: notes, tags, and follow-up tasks.
        // All mutations go through dedicated PATCH/POST/DELETE /crm/* endpoints.
        crm: {
            notes: [{
                text: { type: String, required: true, trim: true },
                createdBy: { type: String, trim: true, default: null },   // platform user display name
                createdAt: { type: Date, default: Date.now },
            }],
            tags: [{ type: String, trim: true }],
            tasks: [{
                title: { type: String, required: true, trim: true },
                status: { type: String, enum: ['open', 'done'], default: 'open' },
                dueDate: { type: Date, default: null },
            }],
        },

        // ─── Provisioning Error (v2.0 — Per-Org DB Isolation) ─────────────────────
        // Set by organization.service.js if Phase B (org bootstrap) fails after
        // platform entities have been committed. Used by admin dashboard to surface
        // orgs requiring manual re-provisioning.
        provisionError: {
            message: { type: String, default: null },
            phase: { type: String, default: null },
            timestamp: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

organizationSchema.pre("validate", async function () {
    if (!this.slug && this.name) {
        this.slug = this.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-");
    }

    // Auto-derive normalizedName for duplicate detection
    if (this.name) {
        this.normalizedName = this.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
});

// 🛡️ Geopolitical Sovereignty Guard — regionCode is immutable (v31.0 hardened)
// regionCode can only be set once during creation.
// Any subsequent change requires a formal migration procedure:
//   1. Data export from source region DB
//   2. Data import to target region DB
//   3. Token invalidation: User.updateMany({ organizationId }, { $inc: { tokenVersion: 1 } })
//   4. RefreshToken revocation: RefreshToken.updateMany({ organizationId }, { revoked: true })
//   5. Audit event: REGION_MIGRATION_EXECUTED
organizationSchema.pre("save", async function () {
    if (this.isModified("regionCode") && !this.isNew) {
        const logger = require("../utils/logger");
        logger.error({
            event: "REGION_MUTATION_BLOCKED",
            organizationId: this._id,
            oldRegion: this._original?.regionCode,
            attemptedRegion: this.regionCode,
        }, "[Sovereignty] Attempted regionCode mutation BLOCKED — immutable after creation");
        throw new Error("regionCode is immutable. Use formal migration procedure.");
    }
});

// Also block direct findOneAndUpdate bypasses
organizationSchema.pre("findOneAndUpdate", function () {
    const update = this.getUpdate();
    if (update?.regionCode || update?.$set?.regionCode) {
        throw new Error("[Sovereignty] regionCode cannot be changed via findOneAndUpdate. Use formal migration procedure.");
    }
});


// 🛡️ v20.1 Phase 4 — Legacy graceEndsAt regression guard
organizationSchema.pre("save", async function () {
    const sub = this.subscription;
    if (sub && sub._doc && sub._doc.graceEndsAt !== undefined) {
        throw new Error("Legacy field 'graceEndsAt' detected. Use 'gracePeriodEnd' instead.");
    }
});


// ─── Virtual helpers ─────────────────────────────────────────────────────────

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ name: 1 });
organizationSchema.index({ ownerId: 1 });
organizationSchema.index({ "subscription.status": 1 });
// Sprint 4: subscription.plan index removed — plan is now referenced via planId (ObjectId)
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ isArchived: 1 });
organizationSchema.index({ regionCode: 1 });
// Sprint 1 — Hybrid Billing indexes
organizationSchema.index({ currentContractId: 1 }, { sparse: true });
organizationSchema.index({ trialEndDate: 1 }, { sparse: true });
// Duplicate detection index (sparse — null entries excluded)
organizationSchema.index({ normalizedName: 1 }, { sparse: true });
// v20.1 Wave4 — ISO country code index for country-based queries
organizationSchema.index({ country: 1 }, { sparse: true });

const modelName = "Organization";

module.exports = {
    modelName,
    schema: organizationSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, organizationSchema),
};