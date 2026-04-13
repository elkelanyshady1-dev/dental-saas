/**
 * authIntelligenceBootstrap.js — Phase 20 + 20.1 Bootstrap
 *
 * Registers all Phase 20 services as post-persist hooks on the
 * auth trace persistence layer AND starts the Phase 20.1 worker.
 * Called once at app startup.
 *
 * Hooks:
 *   - authAnomalyDetector.analyzeTrace — anomaly detection on every persisted trace
 *
 * Workers:
 *   - authTrace.worker — BullMQ worker for queue-based trace ingestion
 *
 * PLANE: Org only.
 * Phase 20 — TASK-AUTH-INT-001 / TASK-AUTH-INT-003
 * Phase 20.1 — TASK-AUTH-SCALE-002
 */

"use strict";

const { onTracePersisted } = require("@services/authTracePersistence.service");
const { analyzeTrace } = require("@services/authAnomalyDetector");
const logger = require("@utils/logger");

/**
 * Initialize Phase 20 + 20.1 auth intelligence subsystems.
 * Call this once during app startup (server.js or similar).
 */
function bootstrapAuthIntelligence() {
    const hooks = ["analyzeTrace"];

    // ── Phase 20: Register anomaly detection as a post-persist hook ──────
    // (used by direct-write fallback path)
    onTracePersisted(analyzeTrace);

    // ── Phase 20.1: Start the BullMQ worker for queue-based ingestion ────
    try {
        const {
            createWorker,
            onWorkerTracePersisted,
        } = require("@infra/workers/authTrace.worker");

        // Register anomaly detection as a post-persist hook on the worker too
        // (worker path: queue → worker → MongoDB → hook)
        onWorkerTracePersisted(analyzeTrace);

        // Start the worker
        createWorker();

        hooks.push("authTraceWorker");
        logger.info(
            { service: "authIntelligence", hooks },
            "[AuthIntelligence] Phase 20 + 20.1 hooks and worker registered"
        );
    } catch (err) {
        // Worker start failure is non-fatal — direct persistence fallback exists
        logger.warn(
            { err: err.message, service: "authIntelligence" },
            "[AuthIntelligence] Worker start failed — using direct persistence fallback"
        );
        logger.info(
            { service: "authIntelligence", hooks },
            "[AuthIntelligence] Phase 20 hooks registered (worker unavailable)"
        );
    }
}

module.exports = { bootstrapAuthIntelligence };
