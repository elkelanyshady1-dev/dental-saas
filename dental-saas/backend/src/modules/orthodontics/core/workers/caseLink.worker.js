/**
 * caseLink.worker.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Workers
 *
 * REDIS: Same bullConnection from src/infrastructure/redis/redisClient.js
 *   as the queue → guaranteed same connection configuration.
 *
 * QUEUE NAME: Must match caseLink.queue.js exactly ("clinical-case-link").
 *
 * STARTUP PATTERN: Matches server.js's existing worker pattern:
 *   - Required at top level of server.js (runs immediately)
 *   - Exports .close() for graceful shutdown in gracefulShutdown()
 *   - Also exports startWorker() for explicit initialization
 *
 * DB CONNECTION SAFETY:
 *   job.data contains orgId (string — serializable).
 *   Worker re-acquires the org DB connection via dbManager.getConnectionAsync(orgId).
 *   Mandatory pattern: getConnectionAsync() + releaseConnection() in finally.
 *
 * LOGS:
 *   🚀 CaseLink Worker started
 *   ✅ Case linked → appointmentId
 */

"use strict";

const { Worker } = require("bullmq");
const { bullConnection } = require("../../../../infrastructure/redis/redisClient");
const logger = require("@utils/logger");

const { QUEUE_NAME } = require("../queues/caseLink.queue");

// Lazy-load to avoid circular dependencies at boot
function getDbManager()    { return require("../../../../core/db/dbManager"); }
function getCaseRepo()     { return require("../repositories/orthodonticCase.repository"); }

function getAppointmentModel(dbConnection) {
    const getModel       = require("../../../../core/db/getModel");
    const AppointmentDef = require("../../../../organization/appointment/models/appointment.model");
    return getModel(dbConnection, AppointmentDef);
}

// ─────────────────────────────────────────────────────────────────────────────
// Job processor
// ─────────────────────────────────────────────────────────────────────────────

async function processCaseLinkJob(job) {
    const { appointmentId, patientId, orgId, caseType = "comprehensive" } = job.data;

    logger.info({
        event:    "CASE_LINK_JOB_START",
        jobId:    job.id,
        appointmentId, patientId, orgId,
        attempt:  job.attemptsMade + 1,
    }, "[CaseLinkWorker] Processing job");

    // Acquire org DB connection — MANDATORY: release in finally
    const dbManager    = getDbManager();
    const dbConnection = await dbManager.getConnectionAsync(orgId);

    const fakeReq = {
        dbConnection,
        context: {
            organizationId: orgId,
            userId:         null, // system-initiated — no user JWT in worker
        },
    };

    try {
        // Find or create case for patient
        const caseRepo = getCaseRepo();
        let orthoCase  = await caseRepo.findActiveByPatient(fakeReq, patientId);

        if (!orthoCase) {
            // ATOMIC: Create case + default phases in a single transaction.
            // Matches case.controller.js createCase flow (CB-002).
            const session = await dbConnection.startSession();
            const phaseService = require("../services/phase.service");

            try {
                await session.withTransaction(async () => {
                    orthoCase = await caseRepo.create(fakeReq, { patientId, caseType }, { session });
                    await phaseService.createDefaultPhases(fakeReq, orthoCase._id.toString(), { session });
                });
            } finally {
                await session.endSession();
            }

            orthoCase = await caseRepo.findById(fakeReq, orthoCase._id.toString());

            logger.info({
                event: "CASE_CREATED_BY_WORKER",
                caseId: orthoCase._id, patientId, orgId,
            }, "[CaseLinkWorker] OrthodonticCase created");
        }

        // Stamp caseId onto the Appointment (org-scoped)
        const Appointment = getAppointmentModel(dbConnection);
        const updated = await Appointment.findOneAndUpdate(
            { _id: appointmentId, organizationId: orgId },
            { $set: { clinicalCaseId: orthoCase._id } },
            { new: true, select: "clinicalCaseId" }
        ).lean();

        if (!updated) {
            throw new Error(
                `Appointment ${appointmentId} not found in org ${orgId} — cannot stamp caseId`
            );
        }

        logger.info({
            event:         "CASE_LINK_JOB_DONE",
            jobId:         job.id,
            appointmentId,                          // ✅ Case linked → appointmentId
            caseId:        orthoCase._id.toString(),
            orgId,
        }, `[CaseLinkWorker] ✅ Case linked → ${appointmentId}`);

        return { caseId: orthoCase._id.toString() };

    } finally {
        // MANDATORY: release the inUseCount acquired by getConnectionAsync()
        dbManager.releaseConnection(orgId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker instance — module-level singleton (matches emailWorker/smsWorker pattern)
// ─────────────────────────────────────────────────────────────────────────────

// Create the worker immediately on require() — matches the pattern used by
// emailWorker, smsWorker, whatsappWorker, auditWorker in server.js lines 88-91.
const _worker = new Worker(QUEUE_NAME, processCaseLinkJob, {
    ...bullConnection,
    concurrency: 5,
});

_worker.on("ready", () => {
    logger.info({ queue: QUEUE_NAME }, "[CaseLinkWorker] 🚀 CaseLink Worker started");
});

_worker.on("completed", (job, result) => {
    logger.info({
        jobId:  job.id,
        result,
        queue:  QUEUE_NAME,
    }, "[CaseLinkWorker] Job completed");
});

_worker.on("failed", (job, err) => {
    logger.error({
        jobId:   job?.id,
        attempt: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        err:     err.message,
        queue:   QUEUE_NAME,
    }, "[CaseLinkWorker] Job failed");
});

_worker.on("error", (err) => {
    logger.error({ err: err.message, queue: QUEUE_NAME }, "[CaseLinkWorker] Worker error");
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle helpers (for gracefulShutdown compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * startWorker — no-op (worker starts on module require).
 * Kept for explicit-startup compatibility if called from server.js.
 */
function startWorker() {
    // Worker is already running — idempotent
    logger.info({ queue: QUEUE_NAME }, "[CaseLinkWorker] startWorker() called (worker already running)");
    return _worker;
}

/**
 * close — drains inflight jobs and closes the worker.
 * Called by gracefulShutdown() in server.js.
 */
async function close() {
    await _worker.close();
    logger.info({ queue: QUEUE_NAME }, "[CaseLinkWorker] Worker closed gracefully");
}

module.exports = { startWorker, close };
