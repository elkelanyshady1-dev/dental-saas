const Organization = require("../models/Organization");
const SubscriptionHistory = require("../models/SubscriptionHistory");
const logger = require("./logger");

/**
 * migrateSubscriptions — runs once at server startup.
 *
 * For any org that still has the old flat `subscriptionPlan` / `subscriptionStatus`
 * fields (or simply has no `subscription` sub-document), this migration:
 *   1. Builds the nested subscription object from legacy values.
 *   2. Sets a trialEndsAt if the org is still on trial (createdAt + 14 days).
 *   3. Saves the org without touching anything else.
 *   4. Writes an initial SubscriptionHistory record for first-time migrated orgs.
 *
 * Safe to run repeatedly — skips orgs that already have subscription.status set.
 */
async function migrateSubscriptions() {
    try {
        // Find orgs that have never been migrated (subscription.status not set)
        const orgs = await Organization.find({
            "subscription.status": { $exists: false },
        });

        if (orgs.length === 0) {
            logger.info({ service: "Migration", action: "migration_skipped" }, "Subscription migration: all organizations already migrated.");
            return;
        }

        logger.info({ service: "Migration", action: "migration_start", count: orgs.length }, "Migrating organization(s) to nested schema...");

        for (const org of orgs) {
            const now = new Date();

            // Read legacy flat fields from raw document — they no longer exist in
            // the Mongoose schema, so we access via _doc to get MongoDB raw data.
            const rawDoc = org._doc || org.toObject({ virtuals: false });
            const legacyPlan = rawDoc.subscriptionPlan || "basic";
            const legacyStatus = rawDoc.subscriptionStatus || "trial";

            const trialEndsAt = legacyStatus === "trial"
                ? new Date(new Date(org.createdAt).getTime() + 14 * 24 * 60 * 60 * 1000)
                : null;

            org.subscription = {
                plan: legacyPlan,
                status: legacyStatus,
                trialEndsAt,
                currentPeriodStart: legacyStatus === "active" ? org.createdAt : null,
                currentPeriodEnd: null,
                autoRenew: false,
            };

            await org.save();

            // Write first history record for audit trail
            await SubscriptionHistory.create({
                organizationId: org._id,
                plan: org.subscription.plan,
                status: org.subscription.status,
                trialEndsAt: org.subscription.trialEndsAt,
                periodStart: org.subscription.currentPeriodStart,
                periodEnd: null,
                changedBy: null,
                notes: "Migrated from legacy flat subscription fields",
            });

            logger.info({ service: "Migration", action: "org_migrated", orgName: org.name, legacyStatus }, "Migrated organization");
        }

        logger.info({ service: "Migration", action: "migration_complete" }, "Subscription migration complete.");
    } catch (err) {
        logger.error({ err, service: "Migration", action: "migration_failed" }, "Subscription migration failed");
        // Do NOT throw — migration failures should not crash the server.
    }
}

module.exports = migrateSubscriptions;
