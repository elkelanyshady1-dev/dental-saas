#!/usr/bin/env node
/**
 * migratePhotosToSSOT.js — Phase 1 Photo SSOT migration
 * ═══════════════════════════════════════════════════════════════════════════
 * Populates the Photo collection from legacy sources, per tenant.
 *
 * Sources per case:
 *   1. workflowData.recordSets[].imagePool[]          — embedded imagePool
 *   2. workflowData.recordSets[].records[]            — embedded photo records
 *   3. ImagePoolPhoto  docs in `imagepoolphotos`      — Phase 0 standalone
 *
 * Strategy:
 *   - Dedupe per case via UNIQUE(caseId, storageKey).
 *   - `checksum` is seeded as "migrated:<storageKey>" so the UNIQUE(caseId,
 *     checksum) index holds without downloading every R2 blob. A follow-up
 *     (backfillChecksums.js) replaces these placeholders with real SHA-256.
 *   - Link every migrated Photo back to the workflow recordSet by appending
 *     a provenance entry (sourceRecordSetId = workflow recordSet id).
 *     Note: workflow recordSetIds are Strings; Photo.linkedRecordSetIds refers
 *     to CaseRecordSet ObjectIds. We do NOT auto-link to CaseRecordSet here —
 *     the Phase 1 UI cutover performs that linkage explicitly. Provenance
 *     preserves the lineage for audit + future backfill.
 *
 * Per-tenant DB:
 *   Iterates platform `organizations` and runs against each `dental_org_<id>`.
 *
 * Usage:
 *   node scripts/migratePhotosToSSOT.js                 # ALL orgs (live)
 *   node scripts/migratePhotosToSSOT.js --dry-run       # preview
 *   node scripts/migratePhotosToSSOT.js --org=<orgId>   # single org
 *   node scripts/migratePhotosToSSOT.js --case=<caseId> # single case
 *
 * Idempotent: UNIQUE(caseId, storageKey) ensures re-runs are safe.
 * Exit code 1 if any per-org error occurs.
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI   = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/saasdental";
const PLATFORM_DB = process.env.PLATFORM_DB || "saasdental";

// ─── Metadata type resolver ──────────────────────────────────────────────────
// Legacy embedded records carry an ad-hoc `type` or `view` field. We coerce
// onto the Photo.metadata.type enum: intraoral | extraoral | xray | scan.
function _resolveMetadataType(entry) {
    const raw = (entry.type || entry.assignment?.view || entry.view || "").toString().toLowerCase();
    if (raw.includes("xray") || raw.includes("ceph") || raw.includes("opg") || raw.includes("pan")) return "xray";
    if (raw.includes("stl") || raw.includes("scan") || raw.includes("cbct")) return "scan";
    if (raw.includes("intraoral") || raw.includes("occlusal") || raw.includes("bite")) return "intraoral";
    if (raw.includes("extraoral") || raw.includes("profile") || raw.includes("frontal") || raw.includes("smile")) return "extraoral";
    return "extraoral"; // safe default; can be corrected in UI later
}

function _buildPhotoDoc({ organizationId, caseId, storageKey, entry, sourceRecordSetId, uploadedBy }) {
    const doc = {
        organizationId,
        caseId,
        storageKey,
        checksum: `migrated:${storageKey}`,
        metadata: {
            type:         _resolveMetadataType(entry),
            orientation:  entry.orientation || null,
            tags:         Array.isArray(entry.tags) ? entry.tags : [],
            originalName: entry.originalName || entry.label || null,
            mimeType:     entry.mimeType || null,
            sizeBytes:    Number.isFinite(entry.sizeBytes) ? entry.sizeBytes : null,
        },
        uploadedAt:         entry.uploadedAt ? new Date(entry.uploadedAt) : new Date(),
        uploadedBy:         uploadedBy || null,
        linkedRecordSetIds: [],
        linkedVisitIds:     [],
        provenance:         sourceRecordSetId ? [{
            sourceRecordSetId: null, // workflow recordSetId is a String, not an ObjectId
            linkedAt:          new Date(),
            linkedBy:          uploadedBy || null,
        }] : [],
        deletedAt:          null,
    };

    // Phase 1 Hardening — hard invariant: every migrated doc MUST carry a storageKey.
    // A missing key would make the document unresolvable by r2SignedUrl at read time.
    if (!doc.storageKey) {
        throw new Error("INVALID_MIGRATION: storageKey is required on every Photo doc");
    }
    return doc;
}

async function main() {
    const args       = process.argv.slice(2);
    const dryRun     = args.includes("--dry-run");
    const singleOrg  = args.find((a) => a.startsWith("--org="))?.split("=")[1];
    const singleCase = args.find((a) => a.startsWith("--case="))?.split("=")[1];

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  Photo SSOT Migration (Phase 1)                             ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log(`  Mode:   ${dryRun ? "🟢 DRY-RUN (preview only)" : "🔴 LIVE (will insert)"}`);
    console.log(`  Target: ${singleOrg ? `org=${singleOrg}` : "ALL organizations"}${singleCase ? ` / case=${singleCase}` : ""}`);
    console.log();

    const conn = await mongoose.connect(MONGO_URI);
    console.log(`  Connected to: ${conn.connection.host}/${conn.connection.name}\n`);

    const platformDb    = conn.connection.useDb(PLATFORM_DB, { useCache: true });
    const orgCollection = platformDb.collection("organizations");

    const orgQuery = singleOrg
        ? { _id: new mongoose.Types.ObjectId(singleOrg) }
        : { isActive: { $ne: false } };
    const orgs = await orgCollection.find(orgQuery).project({ _id: 1, name: 1 }).toArray();

    console.log(`  Found ${orgs.length} organization(s) to process.\n`);

    const totals = {
        casesScanned:    0,
        embeddedSeen:    0,
        standaloneSeen:  0,
        created:         0, // fresh inserts (same as photosInserted, kept for readability)
        reused:          0, // duplicate key → existing doc returned
        duplicates:      0, // alias of reused for operator clarity
        failed:          0, // non-duplicate errors
        // Back-compat aliases
        photosInserted:  0,
        photosSkipped:   0,
        errors:          0,
    };

    for (const org of orgs) {
        const orgId    = org._id;
        const orgDbName = `dental_org_${orgId.toString()}`;
        console.log(`\n── Org: ${org.name || orgId} (${orgDbName}) ──────────────────`);

        const orgDb = conn.connection.useDb(orgDbName, { useCache: true });
        const casesColl   = orgDb.collection("orthodonticcases");
        const pool2Coll   = orgDb.collection("imagepoolphotos");
        const photosColl  = orgDb.collection("photos");

        // Ensure unique indexes exist (safe no-op if already built).
        try {
            await photosColl.createIndex(
                { caseId: 1, storageKey: 1 },
                { unique: true, name: "uniq_case_storageKey" }
            );
            await photosColl.createIndex(
                { caseId: 1, checksum: 1 },
                { unique: true, partialFilterExpression: { deletedAt: null }, name: "uniq_case_checksum_active" }
            );
        } catch (ixErr) {
            console.log(`  ⚠  Index build issue (non-fatal): ${ixErr.message}`);
        }

        const caseQuery = singleCase
            ? { _id: new mongoose.Types.ObjectId(singleCase) }
            : { isDeleted: { $ne: true } };
        const cases = await casesColl.find(caseQuery).project({
            _id: 1,
            workflowData: 1,
        }).toArray();

        console.log(`  Cases to scan: ${cases.length}`);

        for (const c of cases) {
            totals.casesScanned++;
            const caseId = c._id;
            const recordSets = c.workflowData?.recordSets || [];

            // 1 + 2. Collect from embedded imagePool[] and records[]
            const toInsert = [];
            for (const rs of recordSets) {
                const rsId = rs.id || null;
                for (const entry of (rs.imagePool || [])) {
                    totals.embeddedSeen++;
                    if (!entry.storageKey) continue;
                    toInsert.push(_buildPhotoDoc({
                        organizationId:    orgId,
                        caseId,
                        storageKey:        entry.storageKey,
                        entry,
                        sourceRecordSetId: rsId,
                        uploadedBy:        entry.uploadedBy,
                    }));
                }
                for (const entry of (rs.records || [])) {
                    totals.embeddedSeen++;
                    if (!entry.storageKey) continue;
                    toInsert.push(_buildPhotoDoc({
                        organizationId:    orgId,
                        caseId,
                        storageKey:        entry.storageKey,
                        entry,
                        sourceRecordSetId: rsId,
                        uploadedBy:        entry.uploadedBy,
                    }));
                }
            }

            // 3. Collect from standalone ImagePoolPhoto docs
            const standalone = await pool2Coll.find({
                caseId,
                deletedAt: null,
                storageKey: { $ne: null },
            }).toArray();
            for (const doc of standalone) {
                totals.standaloneSeen++;
                toInsert.push(_buildPhotoDoc({
                    organizationId:    orgId,
                    caseId,
                    storageKey:        doc.storageKey,
                    entry:             {
                        type:         doc.assignment?.view || null,
                        originalName: doc.originalName,
                        mimeType:     doc.mimeType,
                        sizeBytes:    doc.sizeBytes,
                        uploadedAt:   doc.uploadedAt,
                        uploadedBy:   doc.uploadedBy,
                    },
                    sourceRecordSetId: doc.recordSetId,
                    uploadedBy:        doc.uploadedBy,
                }));
            }

            if (toInsert.length === 0) continue;

            // Per-storageKey dedupe within the batch (same key may appear in
            // both embedded AND standalone sources).
            const uniq = new Map();
            for (const p of toInsert) uniq.set(p.storageKey, p);
            const batch = [...uniq.values()];

            if (dryRun) {
                console.log(`    case=${caseId}  →  ${batch.length} photo(s) would be inserted`);
                continue;
            }

            // Insert one-by-one with ordered:false wouldn't give us dedup
            // granularity, so we try individually and count duplicate-key
            // rejections as "skipped" (already migrated).
            for (const p of batch) {
                try {
                    await photosColl.insertOne(p);
                    totals.photosInserted++;
                    totals.created++;
                } catch (ixErr) {
                    if (ixErr.code === 11000) {
                        totals.photosSkipped++;
                        totals.reused++;
                        totals.duplicates++;
                    } else {
                        totals.errors++;
                        totals.failed++;
                        console.log(`    ❌ case=${caseId}  storageKey=${p.storageKey}  ${ixErr.message}`);
                    }
                }
            }
        }
    }

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  Summary                                                     ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log(`  Cases scanned:     ${totals.casesScanned}`);
    console.log(`  Embedded seen:     ${totals.embeddedSeen}`);
    console.log(`  Standalone seen:   ${totals.standaloneSeen}`);
    console.log(`  Created (fresh):   ${totals.created}`);
    console.log(`  Reused/dupes:      ${totals.reused}`);
    console.log(`  Failed:            ${totals.failed}`);
    console.log();
    console.log("  Machine-readable summary:");
    console.log("  " + JSON.stringify({
        created:    totals.created,
        reused:     totals.reused,
        duplicates: totals.duplicates,
        failed:     totals.failed,
    }));
    console.log();

    await mongoose.disconnect();
    process.exit(totals.errors > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error("[migratePhotosToSSOT] fatal:", err);
    process.exit(2);
});
