"use strict";

/**
 * backfillTreatmentPlanVersions.js
 *
 * Migration: seed the new TreatmentPlanVersion collection from legacy data.
 *
 * For each OrthodonticCase with a non-null `workflowData.finalPlan` (or a PRE
 * record set carrying a `treatmentPlan` subdoc as fallback), create a v1 row:
 *   - stage='APPROVED', isApproved=true, isActive=true
 *   - recordSetType='PRE', createdFrom='PRE'
 *   - parentVersionId=null, changeSummary=''
 *   - payload = legacy plan doc
 *   - createdBy = case.ownerId (or null if missing)
 * And set:
 *   - case.approvedPlanVersionId = new._id
 *   - case.activePlanVersionId   = new._id
 *   - case.__planVersionCounter  = 1
 *
 * Idempotent: skips cases that already have any TreatmentPlanVersion rows or
 * a non-null approvedPlanVersionId. Does NOT modify or remove the legacy
 * `finalPlan` / `treatmentPlan` fields — they remain as read-only fallback.
 *
 * Usage:
 *   node backend/scripts/migrations/backfillTreatmentPlanVersions.js            # execute
 *   node backend/scripts/migrations/backfillTreatmentPlanVersions.js --dry      # dry-run
 *   node backend/scripts/migrations/backfillTreatmentPlanVersions.js --org=ID   # single org
 *   node backend/scripts/migrations/backfillTreatmentPlanVersions.js --limit=10 # sample
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Organization = require("../../src/shared/models/Organization");
const dbManager    = require("../../src/core/db/dbManager");

const OrthodonticCaseDef       = require("../../src/modules/orthodontics/models/orthodonticCase.model");
const WorkflowRecordSetDef     = require("../../src/modules/orthodontics/models/WorkflowRecordSet.model");
const TreatmentPlanVersionDef  = require("../../src/modules/orthodontics/models/TreatmentPlanVersion.model");

const args = process.argv.slice(2);
const DRY       = args.includes("--dry");
const LIMIT_ARG = args.find((a) => a.startsWith("--limit="));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : null;
const ORG_ARG   = args.find((a) => a.startsWith("--org="));
const ORG_ID    = ORG_ARG ? ORG_ARG.split("=")[1] : null;

async function _processCase(models, caseDoc, stats) {
    if (caseDoc.approvedPlanVersionId) {
        stats.alreadyMigrated++;
        return;
    }

    const existing = await models.TreatmentPlanVersion.findOne({ caseId: caseDoc._id }).lean();
    if (existing) {
        stats.alreadyMigrated++;
        return;
    }

    // 1. Resolve source plan payload.
    const finalPlan = caseDoc.workflowData?.finalPlan ?? null;
    let sourcePayload = finalPlan;

    // 2. Fallback: latest PRE record set's treatmentPlan subdoc (normalized collection first).
    let recordSet = null;
    const normalizedPre = await models.WorkflowRecordSet
        .findOne({ caseId: caseDoc._id, type: "PRE" })
        .sort({ createdAt: -1 })
        .lean();
    recordSet = normalizedPre;

    if (!sourcePayload && recordSet?.treatmentPlan) {
        sourcePayload = recordSet.treatmentPlan;
    }

    // 3. If no plan data at all, skip — UI will show an empty draft list in PRE.
    if (!sourcePayload || typeof sourcePayload !== "object") {
        stats.noPlanData++;
        return;
    }

    // 4. recordSetId — prefer the normalized PRE, else skip (no target to pin).
    if (!recordSet) {
        stats.noPreRecordSet++;
        return;
    }

    const createdBy = caseDoc.ownerId ?? null;

    if (DRY) {
        stats.wouldMigrate++;
        console.log(`  [DRY] would seed v1 APPROVED for case ${caseDoc._id} (recordSet=${recordSet._id})`);
        return;
    }

    const session = await models.TreatmentPlanVersion.db.startSession();
    try {
        await session.withTransaction(async () => {
            const docs = await models.TreatmentPlanVersion.create(
                [{
                    organizationId: caseDoc.organizationId,
                    caseId:         caseDoc._id,
                    recordSetId:    recordSet._id,
                    recordSetType:  "PRE",
                    version:        1,
                    parentVersionId: null,
                    stage:          "APPROVED",
                    isActive:       true,
                    isApproved:     true,
                    payload:        sourcePayload,
                    changeSummary:  "",
                    createdFrom:    "PRE",
                    assets:         { photos: [], documents: [], stlFiles: [], dicomFiles: [] },
                    audit:          [{
                        action:    "APPROVED",
                        userId:    createdBy ?? caseDoc.organizationId,
                        timestamp: new Date(),
                        note:      "Backfilled from legacy workflowData.finalPlan",
                    }],
                    versionLock:    0,
                    createdBy:      createdBy ?? caseDoc.organizationId,
                }],
                { session },
            );

            const created = docs[0];
            await models.OrthodonticCase.updateOne(
                { _id: caseDoc._id },
                {
                    $set: {
                        approvedPlanVersionId: created._id,
                        activePlanVersionId:   created._id,
                        __planVersionCounter:  1,
                    },
                },
                { session },
            );
        });
        stats.migrated++;
        console.log(`  ✓ seeded v1 APPROVED for case ${caseDoc._id}`);
    } finally {
        await session.endSession();
    }
}

async function _processOrg(org, globalStats) {
    const orgConn = await dbManager.getConnectionAsync(org._id.toString());
    const models = {
        OrthodonticCase:      orgConn.models[OrthodonticCaseDef.modelName]      || orgConn.model(OrthodonticCaseDef.modelName, OrthodonticCaseDef.schema),
        WorkflowRecordSet:    orgConn.models[WorkflowRecordSetDef.modelName]    || orgConn.model(WorkflowRecordSetDef.modelName, WorkflowRecordSetDef.schema),
        TreatmentPlanVersion: orgConn.models[TreatmentPlanVersionDef.modelName] || orgConn.model(TreatmentPlanVersionDef.modelName, TreatmentPlanVersionDef.schema),
    };

    const stats = { alreadyMigrated: 0, migrated: 0, wouldMigrate: 0, noPlanData: 0, noPreRecordSet: 0 };

    const query = models.OrthodonticCase.find({}).select({
        _id: 1,
        organizationId: 1,
        ownerId: 1,
        "workflowData.finalPlan": 1,
        approvedPlanVersionId: 1,
    });
    if (LIMIT) query.limit(LIMIT);
    const cases = await query.lean();

    console.log(`\n[${org.name}] ${cases.length} cases to inspect`);
    for (const c of cases) {
        try { await _processCase(models, c, stats); }
        catch (err) { console.error(`  ! case ${c._id}: ${err.message}`); stats.errors = (stats.errors || 0) + 1; }
    }

    console.log(`[${org.name}] migrated=${stats.migrated} wouldMigrate=${stats.wouldMigrate} alreadyMigrated=${stats.alreadyMigrated} noPlanData=${stats.noPlanData} noPreRecordSet=${stats.noPreRecordSet}`);
    globalStats.migrated       += stats.migrated;
    globalStats.wouldMigrate   += stats.wouldMigrate;
    globalStats.alreadyMigrated += stats.alreadyMigrated;
    globalStats.noPlanData      += stats.noPlanData;
    globalStats.noPreRecordSet  += stats.noPreRecordSet;
}

async function run() {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected — mode=${DRY ? "DRY RUN" : "EXECUTE"}`);

    const orgQuery = ORG_ID ? { _id: ORG_ID } : {};
    const orgs = await Organization.find(orgQuery).select("_id name slug").lean();
    console.log(`Found ${orgs.length} organization(s) to process\n`);

    const globalStats = { migrated: 0, wouldMigrate: 0, alreadyMigrated: 0, noPlanData: 0, noPreRecordSet: 0 };

    for (const org of orgs) {
        try { await _processOrg(org, globalStats); }
        catch (err) { console.error(`[${org.name}] FAILED: ${err.message}`); }
    }

    console.log("\n═══════════════════════════════════════");
    console.log("TOTALS");
    console.log("═══════════════════════════════════════");
    console.log(`  migrated         : ${globalStats.migrated}`);
    console.log(`  would-migrate    : ${globalStats.wouldMigrate}`);
    console.log(`  already-migrated : ${globalStats.alreadyMigrated}`);
    console.log(`  no plan data     : ${globalStats.noPlanData}`);
    console.log(`  no PRE record    : ${globalStats.noPreRecordSet}`);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
