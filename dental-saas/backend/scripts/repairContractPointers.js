#!/usr/bin/env node
require("module-alias/register");
/**
 * repairContractPointers.js
 * v24.0 — ORG_CURRENT_CONTRACT_POINTER_INTEGRITY Repair
 *
 * Finds organizations where currentContractId is either:
 *   (a) null but an active contract exists → repoints to the active contract
 *   (b) pointing to a non-active contract → repoints to active, or nulls out
 *
 * Features:
 *   --dry-run     Preview without writing
 *   --commit      Execute repair
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   node scripts/repairContractPointers.js --dry-run
 *   node scripts/repairContractPointers.js --commit
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isCommit = args.includes("--commit");

if (!isDryRun && !isCommit) {
    console.error("Usage: node repairContractPointers.js [--dry-run | --commit]");
    process.exit(1);
}

const MODE = isDryRun ? "DRY-RUN" : "COMMIT";

async function main() {
    console.log(`\n[Pointer Repair] Mode: ${MODE}`);
    console.log(`[Pointer Repair] Connecting...\n`);

    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("[Pointer Repair] Connected.\n");

    const db = mongoose.connection.db;
    const orgCol = db.collection("organizations");
    const contractCol = db.collection("orgcontracts");

    const report = {
        mode: MODE,
        totalOrgs: 0,
        alreadyCorrect: 0,
        repointed: 0,
        nulled: 0,
        errors: [],
        details: []
    };

    // Get all orgs that have a non-null currentContractId
    const orgsWithPointer = await orgCol.find(
        { currentContractId: { $ne: null, $exists: true } },
        { projection: { _id: 1, name: 1, currentContractId: 1 } }
    ).toArray();

    // Also get orgs with null pointer but have an active contract
    const orgsNullPointer = await orgCol.find(
        {
            $or: [
                { currentContractId: null },
                { currentContractId: { $exists: false } }
            ]
        },
        { projection: { _id: 1, name: 1, currentContractId: 1 } }
    ).toArray();

    report.totalOrgs = orgsWithPointer.length + orgsNullPointer.length;

    console.log(`[Pointer Repair] Orgs with non-null pointer: ${orgsWithPointer.length}`);
    console.log(`[Pointer Repair] Orgs with null pointer:     ${orgsNullPointer.length}`);
    console.log(`[Pointer Repair] Total to evaluate:          ${report.totalOrgs}\n`);

    // --- Pass 1: Validate existing pointers ---
    for (const org of orgsWithPointer) {
        const orgId = org._id;
        const orgName = org.name || orgId.toString();
        const pointedId = org.currentContractId;

        try {
            // Check if the pointed contract is active
            const pointedContract = await contractCol.findOne(
                { _id: pointedId },
                { projection: { _id: 1, contractStatus: 1, accessType: 1, organizationId: 1 } }
            );

            if (pointedContract && pointedContract.contractStatus === "active") {
                // Pointer is correct
                report.alreadyCorrect++;
                report.details.push({
                    orgId: orgId.toString(),
                    orgName,
                    status: "CORRECT",
                    currentContractId: pointedId.toString(),
                    contractStatus: "active"
                });
                continue;
            }

            // Pointer is stale — find the real active contract
            const activeContract = await contractCol.findOne(
                { organizationId: orgId, contractStatus: "active" },
                { projection: { _id: 1, contractStatus: 1, accessType: 1 } }
            );

            if (activeContract) {
                // Repoint to active contract
                if (isDryRun) {
                    report.repointed++;
                    report.details.push({
                        orgId: orgId.toString(),
                        orgName,
                        status: "WOULD_REPOINT",
                        currentContractId: pointedId.toString(),
                        pointedContractStatus: pointedContract ? pointedContract.contractStatus : "NOT_FOUND",
                        newContractId: activeContract._id.toString()
                    });
                } else {
                    await orgCol.updateOne(
                        { _id: orgId },
                        { $set: { currentContractId: activeContract._id } }
                    );
                    report.repointed++;
                    report.details.push({
                        orgId: orgId.toString(),
                        orgName,
                        status: "REPOINTED",
                        oldContractId: pointedId.toString(),
                        pointedContractStatus: pointedContract ? pointedContract.contractStatus : "NOT_FOUND",
                        newContractId: activeContract._id.toString()
                    });
                }
            } else {
                // No active contract exists — null the pointer
                if (isDryRun) {
                    report.nulled++;
                    report.details.push({
                        orgId: orgId.toString(),
                        orgName,
                        status: "WOULD_NULL",
                        currentContractId: pointedId.toString(),
                        pointedContractStatus: pointedContract ? pointedContract.contractStatus : "NOT_FOUND",
                        reason: "No active contract found"
                    });
                } else {
                    await orgCol.updateOne(
                        { _id: orgId },
                        { $set: { currentContractId: null } }
                    );
                    report.nulled++;
                    report.details.push({
                        orgId: orgId.toString(),
                        orgName,
                        status: "NULLED",
                        oldContractId: pointedId.toString(),
                        pointedContractStatus: pointedContract ? pointedContract.contractStatus : "NOT_FOUND",
                        reason: "No active contract found"
                    });
                }
            }
        } catch (err) {
            report.errors.push({ orgId: orgId.toString(), error: err.message });
        }
    }

    // --- Pass 2: Orgs with null pointer but have an active contract ---
    for (const org of orgsNullPointer) {
        const orgId = org._id;
        const orgName = org.name || orgId.toString();

        try {
            const activeContract = await contractCol.findOne(
                { organizationId: orgId, contractStatus: "active" },
                { projection: { _id: 1, contractStatus: 1, accessType: 1 } }
            );

            if (!activeContract) {
                // No active contract and pointer is null — this is actually fine
                report.alreadyCorrect++;
                report.details.push({
                    orgId: orgId.toString(),
                    orgName,
                    status: "CORRECT_NO_CONTRACT",
                    reason: "Null pointer, no active contract — OK"
                });
                continue;
            }

            // Has an active contract but pointer is null — repoint
            if (isDryRun) {
                report.repointed++;
                report.details.push({
                    orgId: orgId.toString(),
                    orgName,
                    status: "WOULD_REPOINT_FROM_NULL",
                    currentContractId: null,
                    newContractId: activeContract._id.toString(),
                    accessType: activeContract.accessType
                });
            } else {
                await orgCol.updateOne(
                    { _id: orgId },
                    { $set: { currentContractId: activeContract._id } }
                );
                report.repointed++;
                report.details.push({
                    orgId: orgId.toString(),
                    orgName,
                    status: "REPOINTED_FROM_NULL",
                    newContractId: activeContract._id.toString(),
                    accessType: activeContract.accessType
                });
            }
        } catch (err) {
            report.errors.push({ orgId: orgId.toString(), error: err.message });
        }
    }

    // --- Write report ---
    const reportDir = path.resolve(__dirname, "../migration-reports");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `contract-pointer-repair-${MODE}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("\n========================================");
    console.log(`  CONTRACT POINTER REPAIR REPORT (${MODE})`);
    console.log("========================================");
    console.log(`  Total orgs evaluated: ${report.totalOrgs}`);
    console.log(`  Already correct:      ${report.alreadyCorrect}`);
    console.log(`  Repointed:            ${report.repointed}`);
    console.log(`  Nulled (no contract): ${report.nulled}`);
    console.log(`  Errors:               ${report.errors.length}`);
    console.log(`  Report:               ${reportPath}`);
    console.log("========================================\n");

    if (report.errors.length > 0) {
        console.error("[Pointer Repair] Errors:");
        report.errors.forEach(e => console.error(`  - ${e.orgId}: ${e.error}`));
    }

    // Print breakdown of actions
    const actions = report.details.filter(d =>
        d.status !== "CORRECT" && d.status !== "CORRECT_NO_CONTRACT"
    );
    if (actions.length > 0) {
        console.log("[Pointer Repair] Actions taken:");
        actions.forEach(d => {
            console.log(`  [${d.status}] ${d.orgName} (${d.orgId})`);
            if (d.newContractId) console.log(`    → New pointer: ${d.newContractId}`);
            if (d.reason) console.log(`    → Reason: ${d.reason}`);
        });
    }

    await mongoose.disconnect();
    process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("[Pointer Repair] Fatal error:", err);
    process.exit(1);
});
