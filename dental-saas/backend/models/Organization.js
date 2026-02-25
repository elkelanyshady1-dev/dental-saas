const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
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
        country: {
            type: String,
            required: true,
            trim: true,
            enum: [
                "Egypt",
                "Saudi Arabia",
                "UAE",
                "Kuwait",
                "Qatar",
                "Bahrain",
                "Oman",
                "UK",
                "USA"
            ]
        },
        countryCode: {
            type: String
        },

        // ─── Enterprise Subscription Object ──────────────────────────────────────
        subscription: {
            plan: {
                type: String,
                enum: ["basic", "pro", "enterprise"],
                default: "basic",
            },
            status: {
                type: String,
                enum: ["trial", "active", "suspended", "expired"],
                default: "trial",
            },
            trialEndsAt: {
                type: Date,
                default: null,
            },
            trialStartDate: {
                type: Date,
                default: null,
            },
            tier: {
                type: String,
                enum: ["trial", "basic", "pro", "enterprise"],
                default: "trial",
            },
            currentPeriodStart: {
                type: Date,
                default: null,
            },
            currentPeriodEnd: {
                type: Date,
                default: null,
            },
            autoRenew: {
                type: Boolean,
                default: false,
            },

            // ── Phase 1: Enterprise Grace Period ──
            gracePeriodDays: { type: Number, default: 7 },
            graceEndsAt: Date,
            basePriceAtSubscription: Number,
            creditBalance: { type: Number, default: 0 },

            // ── Phase 10: Scheduled Plan Changes ──
            scheduledPlanChange: {
                newPlan: { type: String },
                effectiveDate: { type: Date },
                scheduledAt: { type: Date }
            },

            // ── Phase 3: Renewal Pricing Rules ──
            customPricing: {
                isCustom: { type: Boolean, default: false },
                price: { type: Number, default: 0 }
            },
            renewalPolicy: {
                inflationPercent: { type: Number, default: 0 }
            },

            // ── Phase 4: Coupon Engine ──
            coupon: {
                code: String,
                discountType: { type: String, enum: ["percentage", "fixed"] },
                discountValue: Number,
                validUntil: Date,
                maxUses: Number,
                usedCount: { type: Number, default: 0 },
                planRestriction: String,
            },

            // ── Phase 5: Payment Platform Abstraction ──
            paymentProvider: {
                provider: { type: String, enum: ["manual", "stripe"], default: "manual" },
                customerId: String,
                subscriptionId: String,
                lastPaymentIntentId: String,
            }
        },

        modules: {
            orthodontics: { type: Boolean, default: false },
            inventory: { type: Boolean, default: false },
            labs: { type: Boolean, default: false },
            analytics: { type: Boolean, default: false },
            accounting: { type: Boolean, default: true },
            appointments: { type: Boolean, default: true },
            patients: { type: Boolean, default: true },
        },

        features: {
            type: Map,
            of: {
                enabled: { type: Boolean, default: false },
                overridden: { type: Boolean, default: false }
            },
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
                logo: { type: String, default: null }, // URL
            },
        },
        isVerified: {
            type: Boolean,
            default: false,
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
});

// ─── Virtual helpers ─────────────────────────────────────────────────────────
// Backward-compat virtuals so legacy code reading .subscriptionPlan / .subscriptionStatus
// doesn't blow up immediately. Remove after all callers are migrated.
organizationSchema.virtual("subscriptionPlan").get(function () {
    return this.subscription?.plan;
});
organizationSchema.virtual("subscriptionStatus").get(function () {
    return this.subscription?.status;
});

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ name: 1 });
organizationSchema.index({ ownerId: 1 });
organizationSchema.index({ "subscription.status": 1 });
organizationSchema.index({ "subscription.plan": 1 });
organizationSchema.index({ isActive: 1 });

module.exports = mongoose.model("Organization", organizationSchema);