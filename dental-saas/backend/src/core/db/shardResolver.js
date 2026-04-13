/**
 * shardResolver.js
 * Core Infrastructure — Tenant Shard Resolution
 *
 * Determines which shard a tenant belongs to.
 * This is the SINGLE decision point for tenant → shard mapping.
 *
 * CURRENT STATE (Phase 1 — Inactive Distribution):
 *   ALL tenants → "shard-1" (the current MongoDB cluster).
 *   No runtime distribution logic. No migration logic.
 *   Pure abstraction layer — zero behavioral change.
 *
 * FUTURE EXTENSION POINT:
 *   Replace the static return with:
 *     - Hash-based: return `shard-${hash(orgId) % N + 1}`
 *     - Metadata-driven: lookup org.shardId from platform DB
 *     - Weighted: load-balanced shard assignment
 *
 *   When that day comes, ONLY this file changes.
 *   dbManager, connectionFactory, getModel — all untouched.
 *
 * INVARIANTS:
 *   1. resolveShard() NEVER returns null/undefined
 *   2. resolveShard() is DETERMINISTIC — same orgId → same shard
 *   3. resolveShard() is SYNCHRONOUS — no async overhead
 *   4. resolveShard() throws if orgId is missing
 *
 * PLANE: Core Infrastructure
 */

"use strict";

/**
 * resolveShard
 * Returns the shard identifier for a given organization.
 *
 * @param {string} orgId — Organization _id (REQUIRED)
 * @returns {string} — Shard identifier (e.g., "shard-1")
 * @throws {Error} — If orgId is missing
 */
function resolveShard(orgId) {
    if (!orgId) {
        throw new Error("[shardResolver] orgId is required");
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 1: ALL tenants → shard-1
    //
    // FUTURE: Replace with distribution logic:
    //   const hash = fnv1a(orgId);
    //   const shardIndex = hash % SHARD_COUNT;
    //   return `shard-${shardIndex + 1}`;
    //
    // Or metadata-driven:
    //   const org = await OrgModel.findById(orgId).select("shardId").lean();
    //   return org.shardId;
    // ──────────────────────────────────────────────────────────────────────
    return "shard-1";
}

module.exports = { resolveShard };
