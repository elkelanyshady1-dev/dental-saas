require("module-alias/register");
/**
 * replayOutbox.js — Event Outbox Replay CLI
 *
 * Safely re-processes stuck EventOutbox events across the platform DB
 * and all tenant (per-org) DBs. Dry-run by default.
 *
 * USAGE:
 *   node scripts/replayOutbox.js
 *     # dry-run, scope=all, status=pending — SAFE DEFAULT
 *
 *   node scripts/replayOutbox.js --mode=execute
 *     # actually replay stuck events
 *
 *   node scripts/replayOutbox.js --db=platform
 *   node scripts/replayOutbox.js --db=tenant
 *   node scripts/replayOutbox.js --db=all               (default)
 *
 *   node scripts/replayOutbox.js --eventType=billing.invoice.issued
 *   node scripts/replayOutbox.js --eventType=/^billing\./    (regex form)
 *
 *   node scripts/replayOutbox.js --orgId=69c7537ba6ddf0a9ee567ce2
 *     # limit tenant scan to one org (repeatable)
 *
 *   node scripts/replayOutbox.js --status=pending,failed
 *   node scripts/replayOutbox.js --maxAgeMs=3600000     (only events >1h old)
 *   node scripts/replayOutbox.js --limit=500             (per-DB cap)
 *   node scripts/replayOutbox.js --json                  (machine-readable)
 *
 * EXIT CODES:
 *   0 — success (dry or execute)
 *   1 — at least one event failed in execute mode
 *   2 — fatal error (connection, CLI, etc.)
 */

"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const replayEngine = require("../src/core/outbox/replayEngine");
const logger = require("../src/utils/logger");

// ─── CLI Parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const out = {
        mode: "dry",              // dry | execute
        scope: "all",             // platform | tenant | all
        eventType: null,
        orgIds: [],
        status: ["pending"],      // LOCKED: "failed" is forbidden — use DLQ API
        maxAgeMs: null,
        limit: null,              // null = not explicitly set by operator
        json: false,
        help: false,
    };

    for (const raw of argv) {
        if (raw === "--help" || raw === "-h") { out.help = true; continue; }
        if (raw === "--json") { out.json = true; continue; }

        const [k, vRaw] = raw.startsWith("--") ? raw.slice(2).split("=") : [null, null];
        if (!k) continue;
        const v = vRaw === undefined ? "true" : vRaw;

        switch (k) {
            case "mode":
                if (!["dry", "execute"].includes(v)) throw new Error(`--mode must be dry|execute`);
                out.mode = v;
                break;
            case "db":
            case "scope":
                if (!["platform", "tenant", "all"].includes(v)) {
                    throw new Error(`--db must be platform|tenant|all`);
                }
                out.scope = v;
                break;
            case "eventType":
                if (v.startsWith("/") && v.endsWith("/")) {
                    out.eventType = new RegExp(v.slice(1, -1));
                } else {
                    out.eventType = v;
                }
                break;
            case "orgId":
                out.orgIds.push(v);
                break;
            case "orgIds":
                out.orgIds.push(...v.split(",").filter(Boolean));
                break;
            case "status":
                // Hard block: "failed" cannot be replayed via the CLI scanner.
                // Failed events are in the DLQ and MUST go through the audited
                // API: POST /api/platform/dlq/replay/:eventId
                out.status = v.split(",").map((s) => s.trim()).filter(Boolean);
                break;
            case "maxAgeMs":
                out.maxAgeMs = parseInt(v, 10);
                if (!Number.isFinite(out.maxAgeMs)) throw new Error(`--maxAgeMs must be a number`);
                break;
            case "limit":
                out.limit = parseInt(v, 10);
                if (!Number.isFinite(out.limit) || out.limit <= 0) {
                    throw new Error(`--limit must be a positive integer`);
                }
                break;
            default:
                throw new Error(`Unknown flag: --${k}`);
        }
    }

    // ── Post-parse safety gates ──────────────────────────────────────────────

    // Gate 1: Hard block on failed-status replay (DLQ bypass prevention)
    if (out.status.some((s) => s !== "pending")) {
        const forbidden = out.status.filter((s) => s !== "pending").join(", ");
        throw new Error(
            `\n❌ Direct replay of status=[${forbidden}] events is FORBIDDEN.\n` +
            `   "failed" events are DLQ entries protected by an audit contract.\n` +
            `   Use the DLQ API instead:\n` +
            `     POST /api/platform/dlq/replay/:eventId\n` +
            `   The DLQ API records replayHistory, increments replayCount, and\n` +
            `   writes EVENT_REPLAYED + EVENT_REPLAY_SUCCESS/FAILED audit entries.`
        );
    }

    // Gate 2: execute mode requires explicit scope control
    if (out.mode === "execute" && out.limit === null && out.maxAgeMs === null) {
        throw new Error(
            `\n❌ Execute mode requires at least one of:\n` +
            `     --limit=<n>       Cap events processed per DB\n` +
            `     --maxAgeMs=<ms>   Only replay events older than N ms\n` +
            `   This prevents accidentally replaying the entire queue.\n` +
            `   Example: --mode=execute --limit=50 --maxAgeMs=300000`
        );
    }

    // Apply safe default limit for execute (now that gate is cleared)
    if (out.limit === null) {
        out.limit = 1000;
    }

    return out;
}

function printHelp() {
    const help = `
Event Outbox Replay CLI

Flags:
  --mode=dry|execute       Dry-run (default) or execute replay
  --db=platform|tenant|all Scope (default: all)
  --eventType=<str|/re/>   Filter by eventType (exact or /regex/)
  --orgId=<id>             Limit tenant scope to a specific org (repeatable)
  --orgIds=a,b,c           Comma-separated org id list
  --status=pending         Status filter (default: pending)
                           NOTE: "failed" is forbidden here — use DLQ API
  --maxAgeMs=<number>      Only events older than N ms
  --limit=<number>         Per-DB cap (default: 1000)
  --json                   Emit machine-readable JSON
  --help                   Show this text
`.trim();
    process.stdout.write(help + "\n");
}

// ─── Pretty Report ──────────────────────────────────────────────────────────

function printReport(summary) {
    const line = "─".repeat(72);
    const out = [];
    out.push(line);
    out.push(`  EVENT OUTBOX REPLAY — ${summary.mode.toUpperCase()} MODE`);
    out.push(line);
    out.push(`  Scope:       ${summary.scope}`);
    out.push(`  Event type:  ${summary.filter.eventType || "(any)"}`);
    out.push(`  Status:      ${summary.filter.status.join(",")}`);
    out.push(`  Max age ms:  ${summary.filter.maxAge ?? "(none)"}`);
    out.push(`  DBs scanned: ${summary.scannedDbs}`);
    out.push(`  Candidates:  ${summary.candidates}`);
    out.push(`  Replayed:    ${summary.replayed}`);
    out.push(`  Skipped:     ${summary.skipped}`);
    out.push(`  Failed:      ${summary.failed}`);
    out.push(line);

    for (const db of summary.perDb) {
        if (db.error) {
            out.push(`  ! ${db.db}  ERROR: ${db.error}`);
            continue;
        }
        if (db.candidates === 0) {
            out.push(`  ✓ ${db.db}  (no candidates)`);
            continue;
        }
        out.push(`  • ${db.db}`);
        out.push(`      candidates=${db.candidates}  replayed=${db.replayed}  skipped=${db.skipped}  failed=${db.failed}`);
        for (const ev of db.events.slice(0, 20)) {
            const tag = ev.action.padEnd(24);
            out.push(`      [${tag}] ${ev.eventType}  ${ev._id}${ev.err ? "  err=" + ev.err : ""}`);
        }
        if (db.events.length > 20) {
            out.push(`      … (${db.events.length - 20} more)`);
        }
    }
    out.push(line);
    process.stdout.write(out.join("\n") + "\n");
}

// ─── Main ───────────────────────────────────────────────────────────────────

(async () => {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (e) {
        process.stderr.write(`CLI error: ${e.message}\n`);
        printHelp();
        process.exit(2);
    }

    if (args.help) {
        printHelp();
        process.exit(0);
    }

    if (!process.env.MONGO_URI) {
        process.stderr.write("MONGO_URI is not set\n");
        process.exit(2);
    }

    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 15000,
        });
    } catch (err) {
        process.stderr.write(`Mongo connect failed: ${err.message}\n`);
        process.exit(2);
    }

    let summary;
    try {
        summary = await replayEngine.run({
            scope: args.scope,
            orgIds: args.orgIds.length ? args.orgIds : null,
            eventType: args.eventType,
            status: args.status,
            maxAge: args.maxAgeMs,
            limit: args.limit,
            dryRun: args.mode === "dry",
        });
    } catch (err) {
        logger.error({ err: err.message, stack: err.stack }, "[Replay] Fatal");
        process.stderr.write(`Replay fatal: ${err.message}\n`);
        await mongoose.disconnect().catch(() => {});
        process.exit(2);
    }

    if (args.json) {
        process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    } else {
        printReport(summary);
    }

    // Best-effort connection cleanup
    try {
        const dbManager = require("../src/core/db/dbManager");
        if (typeof dbManager.shutdown === "function") {
            await dbManager.shutdown();
        }
    } catch (_) { /* ignore */ }

    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }

    const exitCode = args.mode === "execute" && summary.failed > 0 ? 1 : 0;
    process.exit(exitCode);
})();
