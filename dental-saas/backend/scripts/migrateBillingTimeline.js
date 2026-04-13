require("module-alias/register");
#!/usr/bin/env node
/**
 * migrateBillingTimeline.js
 * Sprint 8 — One-Shot Idempotent BillingTimeline Backfill
 *
 * PURPOSE:
 * Populates the BillingTimeline collection from historical records in:
 *   1. BillingLedger   (financial events)
 *   2. BillingAuditLog (lifecycle events)
 *
 * IDEMPOTENCY:
 *   For events with providerEventId → upsert by (organizationId + contractId + eventType + providerEventId)
 *   For internal events            → upsert by (organizationId + contractId + eventType + occurredAt)
 *   Running this script multiple times is safe — no duplicate events will be created.
 *
 * SAFETY:
 *   - Read-only on BillingLedger and BillingAuditLog
 *   - Only writes to BillingTimeline (projection collection)
 *   - Paginated batch processing (500 docs/batch)
 *   - Fails gracefully per-doc — one bad record won't abort the run
 *
 * USAGE:
 *   node scripts/migrateBillingTimeline.js
 *   node scripts/migrateBillingTimeline.js --dry-run  (log mappings only, no inserts)
 *
 * PLANE: Platform / Migration
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const logger = console;

// ── Arg parsing ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

// ── Models ────────────────────────────────────────────────────────────────────
const BillingLedger = require("../src/platform/billing/models/BillingLedger.model");
const BillingTimeline = require("../src/platform/billing/models/BillingTimeline.model");

// Lazy-load BillingAuditLog (not all projects have it wired yet)
let BillingAuditLog;
try {
    BillingAuditLog = require("../src/platform/billing/models/BillingAuditLog.model");
} catch {
    BillingAuditLog = null;
}

// ── Ledger → Timeline event type mapping ─────────────────────────────────────
const LEDGER_EVENT_MAP = {
    "contract.activated": "CONTRACT_ACTIVATED",
    "invoice.created": "INVOICE_CREATED",
    "payment.succeeded": "PAYMENT_SUCCEEDED",
    "payment.failed": "PAYMENT_FAILED",
    "invoice.refunded": "REFUND_COMPLETED"
    // subscription.created / subscription.canceled → no timeline equivalent yet
};

// ── BillingAuditLog → Timeline event type mapping ────────────────────────────
const AUDIT_EVENT_MAP = {
    "CONTRACT_RENEWED": "RENEWAL_COMPLETED",
    "CONTRACT_SUPERSEDED": "UPGRADE_APPLIED",
    "CONTRACT_ACTIVATED": "CONTRACT_ACTIVATED",
    "TRIAL_STARTED": "TRIAL_STARTED",
    "TRIAL_ENDED": "TRIAL_ENDED"
};

// ── Stats ─────────────────────────────────────────────────────────────────────
const stats = {
    ledger: { scanned: 0, mapped: 0, inserted: 0, skipped: 0, errors: 0 },
    audit: { scanned: 0, mapped: 0, inserted: 0, skipped: 0, errors: 0 }
};

// ── Upsert helper ─────────────────────────────────────────────────────────────
async function upsertTimelineEvent(doc, source) {
    const s = stats[source];
    s.mapped++;

    if (DRY_RUN) {
        logger.log(`[DRY-RUN] Would insert: ${doc.eventType} for org ${doc.organizationId}`);
        s.inserted++;
        return;
    }

    try {
        // Build filter — providerEventId takes priority for external events
        const filter = doc.providerEventId
            ? {
                organizationId: doc.organizationId,
                contractId: doc.contractId || null,
                eventType: doc.eventType,
                providerEventId: doc.providerEventId
            }
            : {
                organizationId: doc.organizationId,
                contractId: doc.contractId || null,
                eventType: doc.eventType,
                occurredAt: doc.occurredAt
            };

        const result = await BillingTimeline.updateOne(
            filter,
            { $setOnInsert: doc },
            { upsert: true }
        );

        if (result.upsertedCount > 0) {
            s.inserted++;
        } else {
            s.skipped++;
        }
    } catch (err) {
        s.errors++;
        logger.error(`[BillingTimeline] Upsert error (${source}): ${err.message}`, {
            eventType: doc.eventType,
            organizationId: doc.organizationId
        });
    }
}

// ── Phase 1: Migrate from BillingLedger ──────────────────────────────────────
async function migrateLedger() {
    logger.log("\n[Phase 1] Migrating BillingLedger → BillingTimeline...");

    let lastId = null;
    let done = false;

    while (!done) {
        const query = lastId
            ? { _id: { $gt: lastId } }
            : {};

        const batch = await BillingLedger
            .find(query)
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .lean();

        if (batch.length === 0) { done = true; break; }

        stats.ledger.scanned += batch.length;
        lastId = batch[batch.length - 1]._id;

        for (const entry of batch) {
            const timelineType = LEDGER_EVENT_MAP[entry.eventType];
            if (!timelineType) continue;

            await upsertTimelineEvent({
                organizationId: entry.organizationId,
                contractId: entry.contractId || null,
                invoiceId: entry.invoiceId || null,
                eventType: timelineType,
                providerEventId: entry.providerEventId || null,
                source: "ledger",
                payload: {
                    amount: entry.amount,
                    currency: entry.currency,
                    provider: entry.provider,
                    metadata: entry.metadata
                },
                occurredAt: entry.createdAt
            }, "ledger");
        }

        if (batch.length < BATCH_SIZE) done = true;
        logger.log(`  [Ledger] Processed ${stats.ledger.scanned} records...`);
    }

    logger.log(`[Phase 1] Complete. Scanned=${stats.ledger.scanned} Inserted=${stats.ledger.inserted} Skipped=${stats.ledger.skipped} Errors=${stats.ledger.errors}`);
}

// ── Phase 2: Migrate from BillingAuditLog ────────────────────────────────────
async function migrateAuditLog() {
    if (!BillingAuditLog) {
        logger.log("\n[Phase 2] BillingAuditLog model not found — skipping.");
        return;
    }

    logger.log("\n[Phase 2] Migrating BillingAuditLog → BillingTimeline...");

    const mappableTypes = Object.keys(AUDIT_EVENT_MAP);
    let lastId = null;
    let done = false;

    while (!done) {
        const query = {
            eventType: { $in: mappableTypes },
            ...(lastId ? { _id: { $gt: lastId } } : {})
        };

        const batch = await BillingAuditLog
            .find(query)
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .lean();

        if (batch.length === 0) { done = true; break; }

        stats.audit.scanned += batch.length;
        lastId = batch[batch.length - 1]._id;

        for (const entry of batch) {
            const timelineType = AUDIT_EVENT_MAP[entry.eventType];
            if (!timelineType) continue;

            await upsertTimelineEvent({
                organizationId: entry.organizationId,
                contractId: entry.contractId || null,
                invoiceId: entry.invoiceId || null,
                eventType: timelineType,
                providerEventId: null,           // audit log events have no provider ID
                source: "audit",
                payload: {
                    performedBy: entry.performedBy,
                    metadata: entry.metadata
                },
                occurredAt: entry.createdAt
            }, "audit");
        }

        if (batch.length < BATCH_SIZE) done = true;
        logger.log(`  [Audit] Processed ${stats.audit.scanned} records...`);
    }

    logger.log(`[Phase 2] Complete. Scanned=${stats.audit.scanned} Inserted=${stats.audit.inserted} Skipped=${stats.audit.skipped} Errors=${stats.audit.errors}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    logger.log("=== BillingTimeline Migration ===");
    if (DRY_RUN) logger.log("*** DRY RUN — no writes will be made ***\n");

    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        logger.error("ERROR: MONGO_URI environment variable not set.");
        process.exit(1);
    }

    await mongoose.connect(uri);
    logger.log("Connected to MongoDB.\n");

    await migrateLedger();
    await migrateAuditLog();

    logger.log("\n=== Migration Summary ===");
    logger.log("Ledger:", stats.ledger);
    logger.log("Audit:", stats.audit);
    logger.log("Total inserted:", stats.ledger.inserted + stats.audit.inserted);
    logger.log("Total skipped (already existed):", stats.ledger.skipped + stats.audit.skipped);
    logger.log("Total errors:", stats.ledger.errors + stats.audit.errors);

    await mongoose.disconnect();
    logger.log("Done.");
}

main().catch((err) => {
    logger.error("Migration failed:", err);
    process.exit(1);
});
