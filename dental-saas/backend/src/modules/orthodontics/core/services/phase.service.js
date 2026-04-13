/**
 * phase.service.js
 * Domain: orthodontic-cases
 * Layer: Application > Services
 *
 * Manages the lifecycle of CasePhase entities.
 * Default phases (pre-treatment → treatment → post-treatment) are
 * created automatically when a new OrthodonticCase is created.
 *
 * PHASE FSM:
 *   pending → active → completed
 *   Only ONE phase may be "active" at a time per case.
 *   Transitioning a new phase to "active" auto-completes the current phase.
 *
 * TRANSACTIONS:
 *   createDefaultPhases and advancePhase use req.dbConnection.startSession()
 *   to wrap multi-document writes in ACID transactions.
 *   NEVER mongoose.startSession() — must use per-org connection.
 */

"use strict";

const casePhaseRepo  = require("../repositories/casePhase.repository");
const caseRepo       = require("../repositories/orthodonticCase.repository");
const logger         = require("@utils/logger");

// ── Default phase definitions ─────────────────────────────────────────────────

const DEFAULT_PHASES = [
    { name: "pre-treatment",  order: 1 },
    { name: "treatment",      order: 2 },
    { name: "post-treatment", order: 3 },
];

/**
 * createDefaultPhases
 *
 * Creates the 3 default phases for a new OrthodonticCase.
 * Supports two modes:
 *   1. External session: caller provides { session } → participates in caller's transaction
 *   2. Standalone: no session → starts its own transaction
 *
 * ATOMICITY: If any step fails, the entire operation rolls back —
 * no orphan CasePhase documents or stale case references.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session] — Reuse caller's transaction
 * @returns {{ phases: CasePhase[], activePhaseId: ObjectId }}
 */
async function createDefaultPhases(req, caseId, { session: externalSession } = {}) {
    const phaseDocs = DEFAULT_PHASES.map((p) => ({
        caseId,
        name:   p.name,
        order:  p.order,
        status: p.order === 1 ? "active" : "pending",
        ...(p.order === 1 ? { startedAt: new Date() } : {}),
    }));

    if (externalSession) {
        // Participating in caller's transaction — no start/end session
        const phases = await casePhaseRepo.createMany(req, phaseDocs, { session: externalSession });
        const activePhase = phases.find((p) => p.name === "pre-treatment");
        await caseRepo.setPhases(req, caseId, {
            phaseIds:      phases.map((p) => p._id),
            activePhaseId: activePhase._id,
        }, { session: externalSession });

        logger.info({
            event:    "CASE_PHASES_CREATED",
            caseId,
            phases:   phases.map((p) => ({ id: p._id, name: p.name, status: p.status })),
            orgId:    req.context.organizationId,
        }, "[PhaseService] Default phases created (in caller transaction)");

        return { phases, activePhaseId: activePhase._id };
    }

    // Standalone — own transaction
    const session = await req.dbConnection.startSession();
    let result;

    try {
        await session.withTransaction(async () => {
            const phases = await casePhaseRepo.createMany(req, phaseDocs, { session });
            const activePhase = phases.find((p) => p.name === "pre-treatment");

            await caseRepo.setPhases(req, caseId, {
                phaseIds:      phases.map((p) => p._id),
                activePhaseId: activePhase._id,
            }, { session });

            result = { phases, activePhaseId: activePhase._id };
        });

        logger.info({
            event:    "CASE_PHASES_CREATED",
            caseId,
            phases:   result.phases.map((p) => ({ id: p._id, name: p.name, status: p.status })),
            orgId:    req.context.organizationId,
        }, "[PhaseService] Default phases created (standalone transaction)");

        return result;
    } finally {
        await session.endSession();
    }
}

/**
 * advancePhase
 *
 * Moves a case to the next phase inside an ACID transaction:
 * 1. Completing the current active phase
 * 2. Activating the next phase (by order)
 * 3. Updating case.activePhaseId
 *
 * ATOMICITY: All three writes are committed or rolled back together.
 * Without a transaction, a crash between steps leaves inconsistent state:
 *   - Phase marked "completed" but no new "active" phase
 *   - case.activePhaseId pointing to the completed (not the new) phase
 *
 * @param {Object} req
 * @param {string} caseId
 * @returns {{ completed: CasePhase, activated: CasePhase|null }}
 */
async function advancePhase(req, caseId) {
    const phases = await casePhaseRepo.findByCaseId(req, caseId);
    const currentActive = phases.find((p) => p.status === "active");

    if (!currentActive) {
        throw Object.assign(new Error("No active phase found for this case"), {
            statusCode: 400, code: "NO_ACTIVE_PHASE",
        });
    }

    const nextPhase = phases.find((p) => p.order === currentActive.order + 1);

    const session = await req.dbConnection.startSession();

    try {
        let completed;
        let activated = null;

        await session.withTransaction(async () => {
            completed = await casePhaseRepo.updateStatus(req, currentActive._id.toString(), "completed", { session });

            if (nextPhase) {
                activated = await casePhaseRepo.updateStatus(req, nextPhase._id.toString(), "active", { session });
                await caseRepo.setPhases(req, caseId, { activePhaseId: nextPhase._id }, { session });
            }
        });

        logger.info({
            event:     "CASE_PHASE_ADVANCED",
            caseId,
            completed: { id: currentActive._id, name: currentActive.name },
            activated: activated ? { id: activated._id, name: activated.name } : null,
            orgId:     req.context.organizationId,
        }, "[PhaseService] Phase advanced (transactional)");

        return { completed, activated };
    } finally {
        await session.endSession();
    }
}

/**
 * getPhasesForCase
 * @param {Object} req
 * @param {string} caseId
 * @returns {CasePhase[]}
 */
async function getPhasesForCase(req, caseId) {
    return casePhaseRepo.findByCaseId(req, caseId);
}

module.exports = { createDefaultPhases, advancePhase, getPhasesForCase };
