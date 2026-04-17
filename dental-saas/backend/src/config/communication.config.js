/**
 * communication.config.js
 * Hybrid Execution Model — Phase 1 configuration knobs.
 *
 * PLANE: Infrastructure / Shared
 */

"use strict";

function _int(name, fallback) {
    const v = process.env[name];
    if (v == null || v === "") return fallback;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

function _bool(name, fallback) {
    const v = process.env[name];
    if (v == null || v === "") return fallback;
    return String(v).toLowerCase() === "true";
}

/**
 * Flag with explicit prod/non-prod defaults.
 * Explicit "true"/"false" in the env always wins. Otherwise defaults to
 * `prodDefault` in production and `devDefault` elsewhere.
 */
function _flag(name, { prodDefault, devDefault }) {
    const raw = process.env[name];
    if (raw != null && raw !== "") {
        return String(raw).toLowerCase() === "true";
    }
    return process.env.NODE_ENV === "production" ? prodDefault : devDefault;
}

module.exports = {
    // SYNC retry policy
    SYNC_MAX_RETRIES: _int("COMM_SYNC_MAX_RETRIES", 2),       // total attempts = retries + 1
    SYNC_BACKOFF_MS: _int("COMM_SYNC_BACKOFF_MS", 150),       // linear backoff base
    PROVIDER_TIMEOUT_MS: _int("COMM_PROVIDER_TIMEOUT_MS", 8000),

    // Idempotency (in-memory, per-process — Phase 1)
    IDEMPOTENCY_TTL_MS: _int("COMM_IDEMPOTENCY_TTL_MS", 5 * 60 * 1000),

    // Test / diagnostic hook — DO NOT enable in production
    SIMULATE_PROVIDER_FAILURE: _bool("COMM_SIMULATE_PROVIDER_FAILURE", false),

    // Phase 2 — Hybrid Execution gates
    // ENABLE_QUEUE=false  → ASYNC sends transparently fall back to SYNC delivery
    //                       (no BullMQ enqueue, no Redis polling cost)
    // ENABLE_WORKERS=false → server.js skips booting comm workers entirely
    // Prod defaults keep existing behavior; dev defaults remove always-on cost.
    ENABLE_QUEUE:   _flag("ENABLE_QUEUE",   { prodDefault: true, devDefault: false }),
    ENABLE_WORKERS: _flag("ENABLE_WORKERS", { prodDefault: true, devDefault: false }),
};
