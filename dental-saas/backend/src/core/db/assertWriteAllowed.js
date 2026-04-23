/**
 * assertWriteAllowed.js
 * Core Infrastructure — DB-Level Write Lock Guard (Phase 8 Seam)
 *
 * The org-level write lock has two layers:
 *
 *   1. HTTP middleware (orgWriteLock.middleware.js) — rejects NEW mutating
 *      requests with 503 the moment `org.writeLocked === true`. Called once
 *      per request, uses the in-request org snapshot.
 *
 *   2. DB-level guard (this file) — called immediately BEFORE every tenant
 *      write, catches in-flight requests that passed middleware BEFORE the
 *      lock was set. The in-request org snapshot may be minutes old by the
 *      time a long-running handler reaches a write; during a migration
 *      window that's enough time for a cutover to flip the lock, leaving
 *      the middleware check stale. This layer closes that gap.
 *
 * STALE-CONTEXT REFRESH:
 *   Steady state (no migration) → fast path: just checks the snapshot.
 *     Zero DB round-trip. This is 100% of normal traffic.
 *   Migration window (org.migrationState is set) → re-reads the org from
 *     the platform DB to confirm the current lock state. Cost: one
 *     lean() read per mutating operation during a migration. Acceptable
 *     because migrations are ops-initiated and low in frequency.
 *
 * PLANE: Core Infrastructure
 * Phase 8 seam — wired Day-1, fires only when an org is under migration.
 */

"use strict";

function writeLockedError() {
    const err = new Error("ORG_WRITE_LOCKED");
    err.status = 503;
    err.code = "ORG_WRITE_LOCKED";
    err.retryAfterSeconds = 5;
    return err;
}

/**
 * assertWriteAllowed
 * @param {Object} org      — org snapshot from req.context.organization
 * @param {string} orgId    — authoritative org id (used for fresh-read)
 * @returns {Promise<void>} — resolves if write is allowed; throws otherwise
 */
async function assertWriteAllowed(org, orgId) {
    if (!org) {
        // Defensive: if the caller didn't wire req.context.organization, we
        // cannot decide. Prefer failing closed (matches the rest of the
        // isolation stack which throws on missing context).
        throw new Error("[assertWriteAllowed] org snapshot is required (req.context.organization)");
    }

    // Fast path — normal operation.
    if (org.writeLocked === true) {
        throw writeLockedError();
    }

    // Slow path — migration window. Re-verify against platform DB.
    // Zero overhead in steady state (migrationState is null).
    if (org.migrationState) {
        if (!orgId) {
            // We need the id to re-fetch. Fail closed rather than continue
            // with a possibly-stale snapshot during a migration.
            throw new Error(
                "[assertWriteAllowed] orgId is required during a migration window"
            );
        }

        // Lazy require — avoids boot-time circular deps with platformConnection.
        const getPlatformModel = require("./getPlatformModel");
        const OrganizationDef = require("@root/shared/models/Organization");
        const Organization = getPlatformModel(OrganizationDef);

        const fresh = await Organization
            .findById(orgId)
            .select("writeLocked routingEpoch cluster migrationState")
            .lean();

        if (fresh && fresh.writeLocked === true) {
            throw writeLockedError();
        }
        // If fresh === null (org deleted mid-request), fall through — the
        // write will fail on the tenant DB for other reasons and the caller
        // will see a 4xx with better context than a synthetic 503.
    }
}

module.exports = assertWriteAllowed;
