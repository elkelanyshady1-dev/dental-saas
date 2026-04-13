/**
 * sequence.service.js — Treatment Sequence Engine V1.5
 *
 * Responsibilities:
 *   - Create / get / update SequencePlan per case
 *   - Update sequenceProgress on a WorkflowSnapshot
 *   - organizationId always from context (never from body)
 *   - Atomic $set for progress — no full snapshot rewrites
 *
 * @per-org-compliant — All operations use getModel(req.dbConnection, ...) for per-org DB isolation.
 */

"use strict";

const SequencePlanDef      = require("../models/SequencePlan.model");
const WorkflowSnapshotDef  = require("../models/WorkflowSnapshot.model");
const getModel             = require("../../../core/db/getModel");
const enforceDbIsolation   = require("../../../core/db/dbIsolation.guard");
const logger               = require("@utils/logger");
const clinicalEventService = require("./clinicalEvent.service");

// ─── Per-Request Model Resolution ─────────────────────────────────────────────
function _getModels(req) {
    enforceDbIsolation(req);
    const conn = req.dbConnection;
    return {
        SequencePlan:     getModel(conn, SequencePlanDef),
        WorkflowSnapshot: getModel(conn, WorkflowSnapshotDef),
    };
}

// ─── Resolve Snapshot → caseId ───────────────────────────────────────────────
// Used by updateProgress ownership guard to verify case access without
// the controller needing to import WorkflowSnapshot directly.

const getSnapshotCaseId = async (req, context, snapshotId) => {
  const { WorkflowSnapshot } = _getModels(req);
  const { organizationId } = context;
  const snap = await WorkflowSnapshot.findOne(
    { _id: snapshotId, organizationId },
  ).select("caseId").lean();
  return snap?.caseId ?? null;
};

// ─── Get Sequence Plan for a Case ─────────────────────────────────────────────

/**
 * Returns the SequencePlan for a case, null if none exists yet.
 *
 * @param {Object} req      - Express request (for per-org DB connection)
 * @param {Object} context  - { organizationId }
 * @param {string} caseId
 * @returns {Promise<SequencePlan|null>}
 */
const getSequenceByCase = async (req, context, caseId) => {
  const { SequencePlan } = _getModels(req);
  const { organizationId } = context;
  return SequencePlan.findOne({ organizationId, caseId }).lean();
};

// ─── Create / Upsert Sequence Plan ───────────────────────────────────────────

/**
 * Creates or replaces a SequencePlan for a case.
 * Using findOneAndUpdate with upsert so this is idempotent.
 *
 * @param {Object} req      - Express request (for per-org DB connection)
 * @param {Object} context  - { organizationId, userId }
 * @param {string} caseId
 * @param {string} name
 * @param {Array}  steps    - [{ order, title, description, actions }]
 */
const upsertSequencePlan = async (req, context, caseId, name, steps) => {
  const { SequencePlan } = _getModels(req);
  const { organizationId, userId } = context;

  const existing = await SequencePlan.findOne({ organizationId, caseId }).lean();

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  // AUDIT FIX: Wrap upsert + logEventSync in a single MongoDB transaction.
  // Previously the findOneAndUpdate and logEventSync were independent — if the
  // event log failed, the plan persisted without an audit trail entry.
  let plan;
  const session = await req.dbConnection.startSession();
  try {
    await session.withTransaction(async () => {
      plan = await SequencePlan.findOneAndUpdate(
        { organizationId, caseId },
        {
          $set: {
            name: name || "Treatment Sequence",
            steps: sortedSteps,
            createdBy: userId || null,
          },
        },
        { new: true, upsert: true, runValidators: true, session }
      );

      // P0-3: blocking — sequence plan changes must be audited transactionally
      await clinicalEventService.logEventSync(req, {
        caseId,
        type: existing ? "SEQUENCE_PLAN_UPDATED" : "SEQUENCE_PLAN_CREATED",
        severity: "info",
        payload: { name, stepCount: steps.length },
        metadata: { relatedEntityId: plan._id, relatedEntityType: "SequencePlan" },
      }, { session });
    });
  } finally {
    await session.endSession();
  }

  return plan;
};

// ─── Update Step Progress on Snapshot ────────────────────────────────────────

/**
 * Atomically updates the sequenceProgress.currentStep on a WorkflowSnapshot.
 * Uses $set so only progress fields are touched — chart state is untouched.
 *
 * @param {Object} req         - Express request (for per-org DB connection)
 * @param {Object} context     - { organizationId }
 * @param {string} snapshotId  - WorkflowSnapshot._id
 * @param {number} stepIndex   - 0-based index into SequencePlan.steps[]
 * @param {string} caseId      - Case ID (passed directly to avoid extra DB call)
 * @param {Array}  [steps]     - Optional steps array for step name lookup
 */
const updateProgress = async (req, context, snapshotId, stepIndex, caseId, steps) => {
  const { WorkflowSnapshot } = _getModels(req);
  const { organizationId } = context;

  if (typeof stepIndex !== "number" || stepIndex < 0) {
    const err = new Error("stepIndex must be a non-negative integer");
    err.statusCode = 400;
    throw err;
  }

  // AUDIT FIX: Wrap progress update + logEventSync in a single MongoDB transaction.
  // Previously the updateOne and logEventSync were independent — if the event log
  // failed, progress persisted without an audit trail entry.
  const _progressSession = await req.dbConnection.startSession();
  try {
    await _progressSession.withTransaction(async () => {
      const result = await WorkflowSnapshot.updateOne(
        { _id: snapshotId, organizationId },
        {
          $set: {
            "sequenceProgress.currentStep": stepIndex,
            "sequenceProgress.lastUpdated": new Date(),
          },
        },
        { session: _progressSession }
      );

      if (result.matchedCount === 0) {
        const err = new Error("Snapshot not found or access denied");
        err.statusCode = 404;
        throw err;
      }

      // P0-3: blocking — step completion is a clinical audit event
      await clinicalEventService.logEventSync(req, {
        caseId,
        type: "SEQUENCE_STEP_COMPLETED",
        severity: "info",
        payload: { stepIndex, stepName: steps?.[stepIndex]?.title },
        metadata: { relatedEntityId: snapshotId, relatedEntityType: "WorkflowSnapshot" },
      }, { session: _progressSession });
    });
  } finally {
    await _progressSession.endSession();
  }

  logger.info(
    `[Sequence] Progress updated: snapshot=${snapshotId} step=${stepIndex}`
  );

  return { snapshotId, stepIndex, updatedAt: new Date() };
};

// ─── Delete Sequence Plan ─────────────────────────────────────────────────────

/**
 * Soft-deletes the SequencePlan for a case.
 * Sets isDeleted=true, deletedAt=now, deletedBy=userId.
 *
 * @param {Object} req      - Express request (for per-org DB connection)
 * @param {Object} context  - { organizationId, userId }
 * @param {string} caseId
 */
const deleteSequencePlan = async (req, context, caseId) => {
  const { SequencePlan } = _getModels(req);
  const { organizationId, userId } = context;
  const updated = await SequencePlan.findOneAndUpdate(
    { organizationId, caseId },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId ?? null,
      },
    },
    { new: true }
  );
  if (!updated) {
    const err = new Error("Sequence plan not found");
    err.statusCode = 404;
    throw err;
  }
  return { deleted: true, caseId, deletedAt: updated.deletedAt };
};

module.exports = {
  getSequenceByCase,
  upsertSequencePlan,
  updateProgress,
  deleteSequencePlan,
  getSnapshotCaseId,
};
