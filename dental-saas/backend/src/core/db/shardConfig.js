/**
 * shardConfig.js
 * Core Infrastructure — Shard Registry / Control Plane
 *
 * Central definition of all available shards and their connection URIs.
 * This is the SINGLE source of truth for shard topology.
 *
 * CURRENT STATE (Phase 1 — Single Shard):
 *   Only "shard-1" exists, pointing to the existing MONGO_URI.
 *   Identical to the current production behavior.
 *
 * FUTURE:
 *   Add new shards here. Each shard has its own MongoDB URI.
 *   Example:
 *     "shard-2": {
 *       name: "EU Region",
 *       uri: process.env.MONGO_URI_SHARD_2,
 *       region: "eu-west-1",
 *     }
 *
 * INVARIANTS:
 *   1. Every shard has a unique key and a valid `uri`
 *   2. "shard-1" ALWAYS exists (it's the default/primary shard)
 *   3. Adding a shard here does NOT activate it — shardResolver controls routing
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const SHARDS = {
    "shard-1": {
        name: "Primary shard",
        uri: process.env.MONGO_URI, // Current cluster — no change
    },

    // ──────────────────────────────────────────────────────────────────────
    // FUTURE SHARDS (uncomment when infrastructure is ready):
    //
    // "shard-2": {
    //     name: "Secondary shard",
    //     uri: process.env.MONGO_URI_SHARD_2,
    // },
    //
    // "shard-3": {
    //     name: "EU Region shard",
    //     uri: process.env.MONGO_URI_SHARD_3,
    //     region: "eu-west-1",
    // },
    // ──────────────────────────────────────────────────────────────────────
};

/**
 * getShardNames
 * Returns all configured shard identifiers.
 *
 * @returns {string[]}
 */
function getShardNames() {
    return Object.keys(SHARDS);
}

module.exports = { SHARDS, getShardNames };
