require("module-alias/register");
"use strict";

const mongoose = require("mongoose");
const InventoryTransaction = require("../src/modules/inventoryDomain/models/inventoryTransaction.model");
const CaseCostSnapshot = require("../src/modules/inventoryDomain/models/caseCostSnapshot.model");
const AuditLog = require("../src/models/AuditLog");

/**
 * Rebuild CaseCostSnapshots (v3.5)
 * Deterministic recalculation engine directly from InventoryTransaction logs.
 * 
 * Usage:
 * node scripts/rebuild-case-cost-snapshots.js
 * node scripts/rebuild-case-cost-snapshots.js --verify-only
 * node scripts/rebuild-case-cost-snapshots.js --org=<id>
 */
async function rebuild({ verifyOnly = false, specificOrgId = null } = {}) {
    console.log(`\n======================================================`);
    console.log(`Starting CaseCostSnapshot Rebuild Engine (v3.5)`);
    console.log(`Mode: ${verifyOnly ? "VERIFY ONLY (No Writes)" : "EXECUTE (Write Mode)"}`);
    console.log(`======================================================\n`);

    const cutoff = new Date();
    console.log(`[Rebuild Engine] High-water mark cutoff: ${cutoff.toISOString()}`);
    console.log(`[Rebuild Engine] Processing transactions up to this cutoff only.\n`);

    // Fetch organizations
    let orgQuery = {};
    if (specificOrgId) {
        orgQuery = { _id: specificOrgId };
    }

    // Try mapping directly or via the model since organizations exist at the platform root
    const orgs = await mongoose.model("Organization").find(orgQuery).select('_id').lean();

    if (orgs.length === 0) {
        console.log("No organizations found to process.");
        return;
    }

    let globalCasesRebuilt = 0;
    let globalCost = 0;
    let globalDriftDetected = 0;
    let globalErrors = 0;
    const startTime = Date.now();

    for (const org of orgs) {
        const organizationId = org._id;
        console.log(`\n\t-------------------------------------------------`);
        console.log(`\tProcessing Organization: ${organizationId}`);

        try {
            // STEP 1 - Aggregate InventoryTransactions safely
            const costStats = await InventoryTransaction.aggregate([
                {
                    $match: {
                        organizationId,
                        type: "OUT",
                        reason: "STAGE_COMPLETED_CONSUMPTION",
                        createdAt: { $lte: cutoff }
                    }
                },
                {
                    $group: {
                        _id: "$caseId",
                        totalInventoryCost: {
                            // $unitCost may be missing in old records; default to 0 to prevent NaN
                            $sum: { $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }] }
                        }
                    }
                }
            ]);

            console.log(`\t[Org ${organizationId}] Found ${costStats.length} active clinical cases with inventory costs.`);

            let orgDriftCount = 0;

            if (verifyOnly) {
                // STEP 2a - Verification Mode (No Writes)
                const existingSnapshots = await CaseCostSnapshot.find({ organizationId }).lean();
                const snapshotMap = new Map(existingSnapshots.map(s => [s.caseId.toString(), s]));

                for (const stat of costStats) {
                    const caseIdStr = stat._id.toString();
                    const existing = snapshotMap.get(caseIdStr);
                    const calculatedCost = stat.totalInventoryCost || 0;

                    if (!existing) {
                        console.log(`\t[Drift] Case ${caseIdStr} missing snapshot! (Calculated: $${calculatedCost})`);
                        orgDriftCount++;
                    } else if (existing.totalInventoryCost !== calculatedCost) {
                        console.log(`\t[Drift] Case ${caseIdStr} mismatch! (Stored: $${existing.totalInventoryCost}, Calculated: $${calculatedCost})`);
                        orgDriftCount++;
                    }
                }

                // Check for orphans (Stored > 0 but no transactions)
                const statMap = new Map(costStats.map(s => [s._id.toString(), s]));
                for (const existing of existingSnapshots) {
                    if (!statMap.has(existing.caseId.toString()) && existing.totalInventoryCost > 0) {
                        console.log(`\t[Drift] Case ${existing.caseId} has stored cost $${existing.totalInventoryCost} but 0 calculated!`);
                        orgDriftCount++;
                    }
                }

                console.log(`\t[Org ${organizationId}] Drift Detection Complete. Discrepancies found: ${orgDriftCount}`);
                globalDriftDetected += orgDriftCount;
            } else {
                // STEP 2b - Write Mode (Batch Bulk Write)
                if (costStats.length > 0) {
                    const bulkOps = costStats.map(stat => ({
                        updateOne: {
                            filter: { organizationId, caseId: stat._id },
                            update: {
                                $set: {
                                    totalInventoryCost: stat.totalInventoryCost || 0,
                                    // Set lab cost to existing or 0 since it is TBD
                                    lastUpdated: new Date()
                                },
                                $setOnInsert: {
                                    totalLabCost: 0
                                }
                            },
                            upsert: true
                        }
                    }));

                    await CaseCostSnapshot.bulkWrite(bulkOps);
                }

                console.log(`\t[Org ${organizationId}] Snapshots Rebuilt: ${costStats.length}`);

                // Audit Logging
                try {
                    await AuditLog.create({
                        organizationId,
                        action: "CASE_COST_SNAPSHOT_REBUILD",
                        entityType: "System",
                        entityId: organizationId,
                        actorId: null, // System action
                        metadata: {
                            cutoffTimestamp: cutoff.toISOString(),
                            totalCasesRebuilt: costStats.length,
                            totalRecalculatedCost: costStats.reduce((sum, stat) => sum + (stat.totalInventoryCost || 0), 0)
                        }
                    });
                } catch (auditErr) {
                    console.error(`\t[Org ${organizationId}] AuditLog Warning: ${auditErr.message}`);
                }
            }

            globalCasesRebuilt += costStats.length;
            globalCost += costStats.reduce((sum, stat) => sum + (stat.totalInventoryCost || 0), 0);

        } catch (err) {
            console.error(`\t[Org ${organizationId}] ERROR: ${err.message}`);
            globalErrors++;
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n======================================================`);
    console.log(`Rebuild Engine Execution Summary`);
    console.log(`======================================================`);
    console.log(`Organizations Processed: ${orgs.length}`);
    console.log(`Total Cases Rebuilt:     ${verifyOnly ? "0 (Verify Mode)" : globalCasesRebuilt}`);
    console.log(`Total Calculated Cost:   $${globalCost.toFixed(2)}`);
    if (verifyOnly) {
        console.log(`Drift Records Detected:  ${globalDriftDetected}`);
    }
    console.log(`Errors Encountered:      ${globalErrors}`);
    console.log(`Execution Duration:      ${duration}s`);
    console.log(`======================================================\n`);
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    const verifyOnly = args.includes("--verify-only");
    const orgIdArg = args.find(a => a.startsWith("--org="));
    const specificOrgId = orgIdArg ? orgIdArg.split("=")[1] : null;

    // Minimal bootstrap (if not wrapped by a master script)
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/dental_saas_test";

    // We must require Organization explicitly if it's not already compiled
    require("../src/models/Organization");

    mongoose.connect(uri)
        .then(() => rebuild({ verifyOnly, specificOrgId }))
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = rebuild;
