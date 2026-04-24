"use strict";

/**
 * checkCaseAssets.js — Diagnostic: how many photos exist for a given case?
 *
 * Answers the question the Photos panel can't: "is the empty state real
 * (zero rows in the DB) or is something upstream filtering them out?"
 *
 * The controller-side LIST_CASE_PHOTOS log shows rawCount/dtoCount for live
 * requests; this script hits the DB directly, bypassing every middleware,
 * DTO, and filter. If this says 0, the panel is correctly empty and the
 * fix is "upload some assets," not code.
 *
 * Usage:
 *   node backend/scripts/diagnostics/checkCaseAssets.js --case=<caseId> [--org=<orgId>]
 *
 *   --case=<caseId>   required
 *   --org=<orgId>     optional; if omitted, walks every org DB until it finds
 *                     a matching case (slower — prefer --org when you know it)
 *   --include-deleted include soft-deleted photos (deletedAt != null)
 *
 * Output: per-org breakdown — total photos, per-fileType breakdown, linked
 *         record-set / visit counts. Exit 0 always (informational only).
 *
 * NOTE: this script uses `{ caseId }` not `{ case: caseId }` — the Photo
 * schema's field name is `caseId` (ObjectId, ref "OrthodonticCase"). See
 * Photo.model.js:45-50 for the canonical field.
 */

require("dotenv").config();
require("module-alias/register");
const mongoose = require("mongoose");

const { default: Organization } = require("../../src/shared/models/Organization");
const dbManager                 = require("../../src/core/db/dbManager");
const PhotoDef                  = require("../../src/modules/orthodontics/models/Photo.model");
const OrthodonticCaseDef        = require("../../src/modules/orthodontics/models/orthodonticCase.model");

const args = process.argv.slice(2);
const CASE_ARG = args.find((a) => a.startsWith("--case="));
const ORG_ARG  = args.find((a) => a.startsWith("--org="));
const INCLUDE_DELETED = args.includes("--include-deleted");

const caseId = CASE_ARG ? CASE_ARG.split("=")[1] : null;
const orgId  = ORG_ARG  ? ORG_ARG.split("=")[1]  : null;

if (!caseId || !/^[a-f\d]{24}$/i.test(caseId)) {
    console.error("Usage: node checkCaseAssets.js --case=<24-char-hex> [--org=<orgId>]");
    process.exit(2);
}

async function _inspectOrg(org) {
    const conn = await dbManager.getConnectionAsync(String(org._id));
    const Photo = conn.models[PhotoDef.modelName] || conn.model(PhotoDef.modelName, PhotoDef.schema);
    const OrthodonticCase = conn.models[OrthodonticCaseDef.modelName] || conn.model(OrthodonticCaseDef.modelName, OrthodonticCaseDef.schema);

    // Confirm the case exists in this org first — lets us distinguish
    // "wrong org" from "no photos in the right org".
    const caseDoc = await OrthodonticCase.findById(caseId).select("_id organizationId patientId").lean();
    if (!caseDoc) {
        return { present: false };
    }

    const baseFilter = INCLUDE_DELETED
        ? { caseId }
        : { caseId, deletedAt: null };

    const photos = await Photo.find(baseFilter).lean();

    const byFileType = photos.reduce((acc, p) => {
        const ft = p.fileType ?? "(missing)";
        acc[ft] = (acc[ft] ?? 0) + 1;
        return acc;
    }, {});

    const linkedRecordSets = photos.reduce((n, p) => n + (p.linkedRecordSetIds?.length ?? 0), 0);
    const linkedVisits     = photos.reduce((n, p) => n + (p.linkedVisitIds?.length ?? 0), 0);

    return {
        present:   true,
        orgName:   org.name,
        dbName:    conn.name,
        total:     photos.length,
        byFileType,
        linkedRecordSets,
        linkedVisits,
        softDeleted: INCLUDE_DELETED ? photos.filter((p) => p.deletedAt != null).length : null,
    };
}

async function run() {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected — looking up case ${caseId}${INCLUDE_DELETED ? " (including soft-deleted)" : ""}`);

    const query = orgId ? { _id: orgId } : {};
    const orgs  = await Organization.find(query).select("_id name slug").lean();
    console.log(`Scanning ${orgs.length} organization(s)\n`);

    let found = 0;
    for (const org of orgs) {
        let result;
        try { result = await _inspectOrg(org); }
        catch (err) { console.error(`[${org.name}] inspection failed: ${err.message}`); continue; }

        if (!result.present) continue;
        found++;

        console.log(`─── ${org.name} (${org._id}) ───`);
        console.log(`  dbName           : ${result.dbName}`);
        console.log(`  total photos     : ${result.total}`);
        console.log(`  by fileType      :`, result.byFileType);
        console.log(`  linked record sets (sum): ${result.linkedRecordSets}`);
        console.log(`  linked visits      (sum): ${result.linkedVisits}`);
        if (INCLUDE_DELETED) {
            console.log(`  soft-deleted     : ${result.softDeleted}`);
        }
        console.log();
    }

    if (found === 0) {
        console.log(`❌ Case ${caseId} not found in any inspected org.`);
        console.log(`   Either the caseId is wrong, or it lives in an org you didn't scan.`);
    } else if (found > 1) {
        console.log(`⚠️  Case ${caseId} matched in ${found} orgs — that is a tenant-isolation bug.`);
    }

    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
