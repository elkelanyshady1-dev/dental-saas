/**
 * Cluster.model.js
 * Platform Plane — Cluster Dynamic Metadata
 *
 * Per-cluster runtime metadata (status, load, capacity). COMPLEMENTS the ENV-
 * seeded `CLUSTER_REGISTRY` — it does NOT hold connection URIs. The registry
 * in ENV is the source of truth for routing; this collection only decorates
 * those entries with dynamic state that ops can change without a redeploy.
 *
 * Hybrid rule (3-layer plan):
 *     Connection info (URI, fallback, priority)  →  ENV
 *     Dynamic metadata (status, load, capacity)  →  DB  (this collection)
 *
 * PLANE: Platform
 * BINDING: resolved via getPlatformModel(def) — not globally registered.
 */

"use strict";

const mongoose = require("mongoose");

const clusterSchema = new mongoose.Schema(
    {
        // Canonical cluster key (e.g. "MEA-EG-1"). Must match exactly one
        // MONGO_URI_<KEY> env var. Boot validation warns on drift.
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        // Geographic region (MEA, EU, US, APAC). Derived from the cluster
        // key's prefix at seeding time, but stored explicitly so region queries
        // don't have to parse keys.
        region: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            index: true,
        },

        // Operational status. Drives assignCluster() filtering and migration
        // eligibility.
        //   ACTIVE       — normal, accepts new orgs
        //   DRAINING     — no new org assignments; existing orgs still served
        //   DOWN         — unreachable, flipped by health checks (deferred)
        //   MAINTENANCE  — operator-initiated freeze
        status: {
            type: String,
            enum: ["ACTIVE", "DRAINING", "DOWN", "MAINTENANCE"],
            default: "ACTIVE",
            uppercase: true,
            index: true,
        },

        // Soft capacity (max org count at which we should spin up cluster N+1).
        capacity: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Fractional load 0..1. Populated by a scheduled job (deferred) that
        // samples org count / capacity. Consumed by load-aware assignment
        // (routingVersion ≥ 2). Day-1 unused.
        load: {
            type: Number,
            default: 0,
            min: 0,
            max: 1,
        },

        // Last time the cluster metadata was refreshed from a health probe.
        lastHealthCheck: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

clusterSchema.index({ region: 1, status: 1 });

module.exports = {
    modelName: "Cluster",
    schema: clusterSchema,
};
