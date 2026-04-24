/**
 * migrateScopePhaseC.js — Phase C: Backfill `scope` field on existing User documents
 *
 * Existing users have `hasFullBranchAccess` + `branchAccess[]` but no `scope`
 * subdocument. This migration derives scope from those legacy fields:
 *
 *   hasFullBranchAccess: true  → scope: { type: "org",    branchIds: [] }
 *   hasFullBranchAccess: false → scope: { type: "branch", branchIds: branchAccess }
 *   no branchAccess + false    → scope: { type: "org",    branchIds: [] }  (safe default)
 *
 * WHAT IT DOES:
 *   1. Connects to ALL per-org databases (dental_org_<orgId>)
 *   2. For each org, finds users without a scope.type field
 *   3. Derives scope from hasFullBranchAccess / branchAccess
 *   4. Writes scope to each user document
 *
 * SAFE: Idempotent — skips users that already have scope.type set.
 * ROLLBACK: db.users.updateMany({}, { $unset: { scope: "" } })
 *
 * RUN: node backend/scripts/migrateScopePhaseC.js
 */

"use strict";

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const PLATFORM_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const ORG_DB_PREFIX = process.env.ORG_DB_PREFIX || "dental_org_";

async function main() {
    console.log("[migrateScopePhaseC] Connecting to platform DB...");
    await mongoose.connect(PLATFORM_URI);

    // Get all org IDs from the platform DB
    const orgs = await mongoose.connection.db
        .collection("organizations")
        .find({}, { projection: { _id: 1 } })
        .toArray();

    console.log(`[migrateScopePhaseC] Found ${orgs.length} organizations.`);

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const org of orgs) {
        const dbName = `${ORG_DB_PREFIX}${org._id}`;
        let orgConn;

        try {
            orgConn = mongoose.createConnection(
                PLATFORM_URI.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`),
            );
            await orgConn.asPromise();

            const usersCol = orgConn.db.collection("users");

            // Find users without scope.type set (migration target)
            const users = await usersCol
                .find({ "scope.type": { $exists: false } })
                .project({ _id: 1, hasFullBranchAccess: 1, branchAccess: 1 })
                .toArray();

            if (users.length === 0) {
                totalSkipped++;
                continue;
            }

            const bulkOps = users.map((user) => {
                const isOrgScope =
                    user.hasFullBranchAccess === true ||
                    (!user.branchAccess || user.branchAccess.length === 0);

                const scope = isOrgScope
                    ? { type: "org", branchIds: [] }
                    : { type: "branch", branchIds: user.branchAccess };

                return {
                    updateOne: {
                        filter: { _id: user._id },
                        update: { $set: { scope } },
                    },
                };
            });

            const result = await usersCol.bulkWrite(bulkOps);
            const updated = result.modifiedCount || 0;
            totalUpdated += updated;

            console.log(
                `[migrateScopePhaseC] ${dbName}: ${updated}/${users.length} users updated`,
            );
        } catch (err) {
            console.error(
                `[migrateScopePhaseC] ERROR on ${dbName}: ${err.message}`,
            );
        } finally {
            if (orgConn) await orgConn.close();
        }
    }

    console.log(
        `[migrateScopePhaseC] Done. Updated: ${totalUpdated}, Orgs skipped (already migrated): ${totalSkipped}`,
    );

    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error("[migrateScopePhaseC] Fatal:", err);
    process.exit(1);
});
