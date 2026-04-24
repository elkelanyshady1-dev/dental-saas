#!/usr/bin/env node
/**
 * migrateTicketMessages.js — Phase 3 E5 backfill
 *
 * Walks every Ticket in the current DB connection, reads its legacy embedded
 * `conversationThread[]`, and inserts each entry into the TicketMessage
 * collection. Idempotent: the backfill tags every inserted row with
 * `legacyEmbeddedMessageId` (the embedded subdoc's _id) which has a unique
 * sparse index — reruns skip rows that were already migrated via a 11000
 * dup-key catch.
 *
 * Usage:
 *   node backend/scripts/migrateTicketMessages.js [--batch=500] [--dry]
 *
 * Safety:
 *   - Batched scan (cursor) — no unbounded in-memory lists.
 *   - Per-ticket insertMany with `ordered: false` so one dup does not abort
 *     the rest of the batch.
 *   - After successful inserts per ticket, updates `threadMessageCount` and
 *     `lastMessageAt` so metadata reflects the new collection.
 *   - NEVER deletes the embedded array — readers that still hit the legacy
 *     field keep working. A follow-up script can drop the field once all
 *     call sites have migrated.
 */

"use strict";

require("module-alias/register");
const mongoose = require("mongoose");

const Ticket = require("@shared/models/Ticket").default;
const TicketMessage = require("@modules/supportDomain/models/TicketMessage.model").default;
const logger = require("@utils/logger");

function parseArgs(argv) {
    const out = { batch: 500, dry: false };
    for (const a of argv.slice(2)) {
        if (a === "--dry") out.dry = true;
        else if (a.startsWith("--batch=")) out.batch = parseInt(a.split("=")[1], 10) || 500;
    }
    return out;
}

function mapSender(actorType) {
    switch (actorType) {
        case "tenant_user":
            return "ORG_USER";
        case "platform_user":
            return "PLATFORM_AGENT";
        case "system":
        default:
            return "SYSTEM";
    }
}

async function migrateOne(ticket) {
    const embedded = Array.isArray(ticket.conversationThread) ? ticket.conversationThread : [];
    if (embedded.length === 0) {
        return { inserted: 0, skipped: 0 };
    }

    const rows = embedded.map((m) => ({
        ticketId: ticket._id,
        organizationId: ticket.organizationId,
        sender: mapSender(m.actorType),
        senderId: m.actorId,
        message: m.message,
        createdAt: m.createdAt || ticket.createdAt || new Date(),
        legacyEmbeddedMessageId: m._id,
    }));

    let inserted = 0;
    let skipped = 0;
    try {
        const res = await TicketMessage.insertMany(rows, { ordered: false });
        inserted = res.length;
    } catch (err) {
        // `ordered:false` + unique key → writeErrors has the dups; everything else wrote.
        if (err && err.writeErrors) {
            inserted = (err.insertedDocs || []).length;
            skipped = err.writeErrors.length;
        } else if (err && err.code === 11000) {
            skipped = rows.length;
        } else {
            throw err;
        }
    }

    // Update ticket metadata. Use the new collection's truth, not the local
    // count, so reruns converge on the correct value.
    const count = await TicketMessage.countDocuments({ ticketId: ticket._id });
    const latest = await TicketMessage.findOne({ ticketId: ticket._id })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean();

    await Ticket.updateOne(
        { _id: ticket._id },
        {
            $set: {
                threadMessageCount: count,
                lastMessageAt: latest ? latest.createdAt : undefined,
            },
        }
    );

    return { inserted, skipped };
}

async function run() {
    const args = parseArgs(process.argv);
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error("MONGO_URI / MONGODB_URI not set — aborting");
        process.exit(1);
    }

    console.log(
        `[migrateTicketMessages] connecting (batch=${args.batch}, dry=${args.dry})`
    );
    await mongoose.connect(uri);

    const cursor = Ticket.find({}, {
        _id: 1,
        organizationId: 1,
        createdAt: 1,
        conversationThread: 1,
    })
        .lean()
        .cursor({ batchSize: args.batch });

    let totals = { tickets: 0, inserted: 0, skipped: 0, failed: 0 };

    // eslint-disable-next-line no-restricted-syntax
    for await (const ticket of cursor) {
        totals.tickets += 1;
        if (args.dry) {
            totals.inserted += (ticket.conversationThread || []).length;
            continue;
        }
        try {
            const r = await migrateOne(ticket);
            totals.inserted += r.inserted;
            totals.skipped += r.skipped;
        } catch (err) {
            totals.failed += 1;
            logger.error(
                { err: err.message, ticketId: String(ticket._id) },
                "[migrateTicketMessages] failed"
            );
        }
        if (totals.tickets % args.batch === 0) {
            console.log(`  … processed ${totals.tickets} tickets so far`);
        }
    }

    console.log("[migrateTicketMessages] done:", totals);
    await mongoose.disconnect();
    process.exit(totals.failed > 0 ? 2 : 0);
}

if (require.main === module) {
    run().catch((err) => {
        console.error("[migrateTicketMessages] fatal:", err);
        process.exit(1);
    });
}

module.exports = { migrateOne, mapSender };
