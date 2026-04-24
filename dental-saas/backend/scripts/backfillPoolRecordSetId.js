#!/usr/bin/env node
/**
 * backfillPoolRecordSetId.js — TDS-BULK-UPLOAD-v1.1 (Option B)
 * ═══════════════════════════════════════════════════════════════════════════
 * Backfills `imagePool[].recordSetId` on every OrthodonticCase that was
 * created before the strict recordset-isolation change.
 *
 * Rules:
 *   1. If the pool entry is ASSIGNED → try to locate the recordSet whose
 *      workflowData.recordSets[].records[] contains an entry whose url
 *      matches the pool entry's url or storageKey. If found, use that
 *      recordSet's id. Otherwise fall through to rule 3.
 *   2. If the pool entry is UNASSIGNED → use the first PRE recordSet;
 *      if no PRE, use the first recordSet of any type.
 *   3. If the case has NO recordSets at all → the entry is orphaned and
 *      will be reported but NOT modified (operator decision required).
 *
 * Per-tenant DB architecture:
 *   - Iterates platform `organizations`
 *   - For each org, connects to `dental_org_<orgId>`
 *   - Walks `orthodonticcases`
 *
 * Usage:
 *   node scripts/backfillPoolRecordSetId.js                 # ALL orgs (live)
 *   node scripts/backfillPoolRecordSetId.js --dry-run       # preview
 *   node scripts/backfillPoolRecordSetId.js --org=<orgId>   # single org
 *   node scripts/backfillPoolRecordSetId.js --case=<caseId> # single case
 *
 * Idempotent: entries that already have recordSetId are skipped.
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI   = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/saasdental";
const PLATFORM_DB = process.env.PLATFORM_DB || "saasdental";

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    const args       = process.argv.slice(2);
    const dryRun     = args.includes("--dry-run");
    const singleOrg  = args.find((a) => a.startsWith("--org="))?.split("=")[1];
    const singleCase = args.find((a) => a.startsWith("--case="))?.split("=")[1];

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  Image Pool recordSetId Backfill (TDS-BULK-UPLOAD-v1.1)     ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log(`  Mode:   ${dryRun ? "🟢 DRY-RUN (preview only)" : "🔴 LIVE (will mutate)"}`);
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
        casesScanned:       0,
        casesUpdated:       0,
        entriesScanned:     0,
        entriesBackfilled:  0,
        entriesAlreadyOk:   0,
        entriesOrphaned:    0,
        errors:             0,
    };

    for (const org of orgs) {
        const orgId    = org._id;
        const orgName  = org.name || String(orgId);
        const orgDbName = `dental_org_${orgId}`;

        try {
            const orgDb = conn.connection.useDb(orgDbName, { useCache: true });
            const cases = orgDb.collection("orthodonticcases");

            const caseQuery = singleCase
                ? { _id: new mongoose.Types.ObjectId(singleCase) }
                : {};
            const cursor = cases.find(caseQuery).project({
                _id:          1,
                imagePool:    1,
                workflowData: 1,
            });

            let orgCasesScanned     = 0;
            let orgCasesUpdated     = 0;
            let orgEntriesBackfilled = 0;
            let orgEntriesOrphaned  = 0;

            // eslint-disable-next-line no-await-in-loop
            for await (const doc of cursor) {
                orgCasesScanned++;
                totals.casesScanned++;

                const pool       = Array.isArray(doc.imagePool) ? doc.imagePool : [];
                const recordSets = Array.isArray(doc.workflowData?.recordSets)
                    ? doc.workflowData.recordSets
                    : [];

                if (pool.length === 0) continue;

                const firstPre  = recordSets.find((rs) => rs.type === "PRE");
                const fallback  = firstPre || recordSets[0] || null;

                let caseHasChanges = false;
                const updates     = [];

                for (let i = 0; i < pool.length; i++) {
                    const entry = pool[i];
                    totals.entriesScanned++;

                    if (entry.recordSetId) {
                        totals.entriesAlreadyOk++;
                        continue;
                    }

                    let targetRsId = null;

                    // Rule 1 — assigned: try to locate a recordSet that already
                    // references this storageKey / url in its records[].
                    if (entry.assigned) {
                        const needleUrl = entry.url || null;
                        const needleKey = entry.storageKey || null;
                        const match = recordSets.find((rs) =>
                            Array.isArray(rs.records) &&
                            rs.records.some(
                                (r) =>
                                    (needleUrl && r.url === needleUrl) ||
                                    (needleKey && r.url === needleKey)
                            )
                        );
                        if (match) targetRsId = match.id;
                    }

                    // Rule 2 — unassigned (or no match for assigned): first PRE,
                    // else first recordSet.
                    if (!targetRsId && fallback) {
                        targetRsId = fallback.id;
                    }

                    // Rule 3 — orphaned: no recordSets on the case at all.
                    if (!targetRsId) {
                        orgEntriesOrphaned++;
                        totals.entriesOrphaned++;
                        console.log(
                            `    ⚠️  orphan  case=${doc._id}  poolIdx=${i}  ` +
                            `id=${entry.id}  (no recordSets — left untouched)`
                        );
                        continue;
                    }

                    updates.push({ index: i, recordSetId: targetRsId });
                    caseHasChanges = true;
                }

                if (!caseHasChanges) continue;

                console.log(
                    `  📦 ${orgName} / case=${doc._id} — ${updates.length} entr` +
                    `${updates.length === 1 ? "y" : "ies"} to backfill`
                );
                for (const u of updates.slice(0, 5)) {
                    console.log(`       · [${u.index}] → recordSetId=${u.recordSetId}`);
                }
                if (updates.length > 5) {
                    console.log(`       · …and ${updates.length - 5} more`);
                }

                if (!dryRun) {
                    // Build a $set document that targets each slot by positional index.
                    const $set = {};
                    for (const u of updates) {
                        $set[`imagePool.${u.index}.recordSetId`] = u.recordSetId;
                    }
                    // eslint-disable-next-line no-await-in-loop
                    const res = await cases.updateOne({ _id: doc._id }, { $set });
                    if (res.modifiedCount !== 1) {
                        console.log(`       ❌ updateOne failed on case=${doc._id}`);
                        totals.errors++;
                        continue;
                    }
                }

                orgCasesUpdated++;
                totals.casesUpdated++;
                orgEntriesBackfilled += updates.length;
                totals.entriesBackfilled += updates.length;
            }

            console.log(
                `  ✅ ${orgName} (${orgId}) — ` +
                `cases scanned=${orgCasesScanned}, updated=${orgCasesUpdated}, ` +
                `backfilled=${orgEntriesBackfilled}, orphaned=${orgEntriesOrphaned}\n`
            );
        } catch (err) {
            console.error(`  ❌ ${orgName} (${orgId}): ${err.message}`);
            totals.errors++;
        }
    }

    // ─── Summary ────────────────────────────────────────────────────────────
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  Cases scanned:         ${totals.casesScanned}`);
    console.log(`  Cases updated:         ${totals.casesUpdated}`);
    console.log(`  Entries scanned:       ${totals.entriesScanned}`);
    console.log(`  Entries backfilled:    ${totals.entriesBackfilled}`);
    console.log(`  Entries already OK:    ${totals.entriesAlreadyOk}`);
    console.log(`  Entries orphaned:      ${totals.entriesOrphaned}`);
    console.log(`  Errors:                ${totals.errors}`);
    console.log("═══════════════════════════════════════════════════════════════");

    if (dryRun && totals.entriesBackfilled > 0) {
        console.log("\n⚠️  DRY-RUN — no changes were written.");
        console.log("    Re-run without --dry-run to apply.");
    }

    if (totals.entriesOrphaned > 0) {
        console.log(
            "\n⚠️  Orphaned entries (pool present but case has no recordSets) " +
            "were left untouched.\n    Manually create a recordSet or purge them " +
            "before the strict-mode cutover."
        );
    }

    await mongoose.disconnect();
    process.exit(totals.errors > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
