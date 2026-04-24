/**
 * quotationExpiry.job.js — Batch-expire sent quotations past their expiresAt date
 *
 * Schedule: every hour at :15 (e.g. 00:15, 01:15...)
 *
 * Behavior:
 *   1. Load all active organizations from platform DB.
 *   2. For each org, resolve per-org connection.
 *   3. Find quotations with { status: "sent", expiresAt: { $lte: now } }.
 *   4. Batch-update to "expired" and emit QUOTATION_EXPIRED events.
 *
 * Non-fatal per org — one bad org never halts the sweep.
 *
 * PLANE: jobs / billing
 */

"use strict";

const cron = require("node-cron");
const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
const { resolveConnection } = require("@core/db/dbResolver");
const getModel = require("@core/db/getModel");
const PatientQuotationDef = require("@modules/billingDomain/organizationFinance/models/PatientQuotation.model");
const eventBus = require("@core/eventBus");
const Events = require("@core/domainEvents");
const { v4: uuidv4 } = require("uuid");
const logger = require("@utils/logger");

// ─── Core sweep logic ────────────────────────────────────────────────────────

async function _sweepAllOrgs() {
    const platformConn = getPlatformConnection();
    const Organization = platformConn.models.Organization
        || platformConn.model("Organization", new mongoose.Schema({}, { strict: false, collection: "organizations" }));

    const orgs = await Organization.find({ isActive: true })
        .select("_id")
        .lean();

    const stats = { total: 0, expired: 0, errors: 0 };

    for (const org of orgs) {
        stats.total++;
        try {
            const orgId = org._id.toString();
            const connection = await resolveConnection(orgId);
            const PatientQuotation = getModel(connection, PatientQuotationDef);

            const now = new Date();
            const expiredDocs = await PatientQuotation.find({
                status: "sent",
                expiresAt: { $lte: now },
            }).select("_id patientId").lean();

            if (expiredDocs.length === 0) continue;

            // Batch update
            await PatientQuotation.updateMany(
                { _id: { $in: expiredDocs.map((d) => d._id) }, status: "sent" },
                { $set: { status: "expired" }, $inc: { version: 1 } }
            );

            // Emit events for each expired quotation
            for (const doc of expiredDocs) {
                stats.expired++;
                eventBus.emit(Events.QUOTATION_EXPIRED, {
                    eventId: uuidv4(),
                    organizationId: orgId,
                    quotationId: doc._id.toString(),
                    patientId: doc.patientId?.toString(),
                    timestamp: now,
                });
            }

            logger.info(
                { orgId, count: expiredDocs.length },
                "[QuotationExpiryJob] Expired quotations"
            );
        } catch (err) {
            stats.errors++;
            logger.warn(
                { err: err.message, organizationId: String(org._id) },
                "[QuotationExpiryJob] Per-org sweep error (skipped)"
            );
        }
    }

    logger.info({ stats }, "[QuotationExpiryJob] Sweep complete");
    return stats;
}

// ─── Cron wrapper ────────────────────────────────────────────────────────────

let _job = null;

function start(schedule = "15 * * * *") {
    if (_job) { _job.stop(); }
    _job = cron.schedule(schedule, async () => {
        logger.info({ job: "quotationExpiry", at: new Date().toISOString() },
            "[QuotationExpiryJob] Starting hourly sweep");
        try {
            await _sweepAllOrgs();
        } catch (err) {
            logger.error({ err }, "[QuotationExpiryJob] Unhandled error");
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });
    logger.info({ schedule }, "[QuotationExpiryJob] Registered");
}

function stop() { if (_job) { _job.stop(); _job = null; } }
async function runNow() { logger.info("[QuotationExpiryJob] Manual trigger"); return _sweepAllOrgs(); }

module.exports = { start, stop, runNow };
