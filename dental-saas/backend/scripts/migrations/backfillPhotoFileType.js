"use strict";

/**
 * backfillPhotoFileType.js — Stamp `fileType` on legacy Photo documents.
 *
 * CONTEXT
 *   The DTO used to default `fileType` to "image" when a doc was missing the
 *   field. That has been removed (the DTO now passes `null` through and logs
 *   PHOTO_CONTRACT_VIOLATION). This migration fixes the underlying data so
 *   Documents / 3D / DICOM tabs can resolve their real assets.
 *
 * CONTRACT
 *   Backend is the SOURCE OF TRUTH. Frontend never guesses; the DTO never
 *   silently fixes data. We fix data HERE.
 *
 * INFERENCE ORDER
 *   1. Top-level mimeType (pdf / dicom / stl|model/ / image)
 *   2. metadata.mimeType
 *   3. metadata.originalName extension (.pdf / .dcm / .stl)
 *   → if none match, report UNRESOLVED_FILETYPE and skip (data team must
 *     investigate — we REFUSE to guess "image").
 *
 * Usage:
 *   node backend/scripts/migrations/backfillPhotoFileType.js            # execute
 *   node backend/scripts/migrations/backfillPhotoFileType.js --dry      # report only
 *   node backend/scripts/migrations/backfillPhotoFileType.js --org=<id> # single org
 *
 * Idempotent: only touches docs where fileType is missing.
 */

require("dotenv").config();
require("module-alias/register"); // resolve @utils/*, @core/* aliases in script context
const mongoose = require("mongoose");

const { default: Organization } = require("../../src/shared/models/Organization");
const dbManager                 = require("../../src/core/db/dbManager");

const PhotoDef = require("../../src/modules/orthodontics/models/Photo.model");

// Guard: model shape must be intact.
if (!PhotoDef?.modelName || !PhotoDef?.schema) {
    throw new Error("INVALID_MODEL_IMPORT: Photo model def missing { modelName, schema }");
}

const args = process.argv.slice(2);
const DRY     = args.includes("--dry");
const ORG_ARG = args.find((a) => a.startsWith("--org="));
const ORG_ID  = ORG_ARG ? ORG_ARG.split("=")[1] : null;

function inferFileType(photo) {
    const mime = String(
        photo.mimeType ?? photo.metadata?.mimeType ?? "",
    ).toLowerCase();

    if (mime.includes("pdf"))                           return "pdf";
    if (mime.includes("dicom") || mime.includes("dcm")) return "dicom";
    if (mime.includes("stl")   || mime.includes("model")) return "3d";
    if (mime.includes("image"))                         return "image";

    const name = String(photo.metadata?.originalName ?? "").toLowerCase();
    if (name.endsWith(".pdf"))                          return "pdf";
    if (name.endsWith(".dcm") || name.endsWith(".dicom")) return "dicom";
    if (name.endsWith(".stl"))                          return "3d";
    if (/\.(jpe?g|png|gif|webp|bmp|tiff?)$/.test(name)) return "image";

    return null;
}

async function _processOrg(org, globalStats) {
    const conn = await dbManager.getConnectionAsync(String(org._id));
    const Photo = conn.models[PhotoDef.modelName] || conn.model(PhotoDef.modelName, PhotoDef.schema);

    // Find every photo missing the top-level fileType.
    const broken = await Photo.find({
        $or: [
            { fileType: { $exists: false } },
            { fileType: null },
            { fileType: "" },
        ],
    }).lean();

    const stats = { fixed: 0, unresolved: 0, wouldFix: 0 };
    console.log(`\n[${org.name}] ${broken.length} legacy photos to inspect`);

    for (const p of broken) {
        const inferred = inferFileType(p);
        if (!inferred) {
            console.warn(
                `  [UNRESOLVED_FILETYPE] photoId=${p._id} mime=${p.mimeType ?? "(none)"} originalName=${p.metadata?.originalName ?? "(none)"}`,
            );
            stats.unresolved++;
            continue;
        }
        if (DRY) {
            console.log(`  [DRY] would set fileType=${inferred} on ${p._id}`);
            stats.wouldFix++;
            continue;
        }
        // Use updateOne with $set to bypass the pre-save/pre-validate hooks
        // (we're only patching the one field; the rest of the doc is valid).
        await Photo.updateOne(
            { _id: p._id },
            { $set: { fileType: inferred, "metadata.fileType": inferred } },
        );
        stats.fixed++;
    }

    console.log(
        `[${org.name}] fixed=${stats.fixed} wouldFix=${stats.wouldFix} unresolved=${stats.unresolved}`,
    );
    globalStats.fixed      += stats.fixed;
    globalStats.wouldFix   += stats.wouldFix;
    globalStats.unresolved += stats.unresolved;
}

async function run() {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected — mode=${DRY ? "DRY RUN" : "EXECUTE"}`);

    const query = ORG_ID ? { _id: ORG_ID } : {};
    const orgs = await Organization.find(query).select("_id name slug").lean();
    console.log(`Found ${orgs.length} organization(s) to process`);

    const globalStats = { fixed: 0, wouldFix: 0, unresolved: 0 };
    for (const org of orgs) {
        try { await _processOrg(org, globalStats); }
        catch (err) { console.error(`[${org.name}] FAILED: ${err.message}`); }
    }

    console.log("\n═══════════════════════════════════════");
    console.log("TOTALS");
    console.log("═══════════════════════════════════════");
    console.log(`  fixed      : ${globalStats.fixed}`);
    console.log(`  wouldFix   : ${globalStats.wouldFix}`);
    console.log(`  unresolved : ${globalStats.unresolved}  <- investigate these manually`);

    await mongoose.disconnect();
    // Exit 1 if unresolved — pre-release validation should treat this as failure.
    process.exit(globalStats.unresolved > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
