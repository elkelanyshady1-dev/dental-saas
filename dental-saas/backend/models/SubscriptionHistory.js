const mongoose = require("mongoose");

/**
 * SubscriptionHistory — immutable audit trail of every subscription lifecycle event.
 * Written on: create, upgrade, extend, suspend, reactivate, expire.
 */
const subscriptionHistorySchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        plan: {
            type: String,
            enum: ["basic", "pro", "enterprise"],
            required: true,
        },

        status: {
            type: String,
            enum: ["trial", "active", "suspended", "expired"],
            required: true,
        },

        periodStart: {
            type: Date,
            default: null,
        },

        periodEnd: {
            type: Date,
            default: null,
        },

        trialEndsAt: {
            type: Date,
            default: null,
        },

        // Who triggered this change (platform user ID)
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        // Human-readable reason / notes
        notes: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }   // createdAt = when event happened
);

// Records must never be deleted — enforce at model level
subscriptionHistorySchema.pre("deleteOne", function (next) {
    next(new Error("SubscriptionHistory records are immutable"));
});
subscriptionHistorySchema.pre("findOneAndDelete", function (next) {
    next(new Error("SubscriptionHistory records are immutable"));
});

subscriptionHistorySchema.index({ organizationId: 1 });
subscriptionHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model("SubscriptionHistory", subscriptionHistorySchema);
