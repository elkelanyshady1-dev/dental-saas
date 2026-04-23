/**
 * visitDraft.service.js — Phase 6: Auto-Save Draft Service
 *
 * RESPONSIBILITIES:
 *   saveDraft()   → upsert draft (called every 5s by browser)
 *   getDraft()    → fetch draft for recovery on session resume
 *   deleteDraft() → called by endVisit() + cancelVisit() to clean up
 *
 * SECURITY:
 *   organizationId ALWAYS from req.context (JWT SSOT — never from body).
 *   visitId validated by caller before passing here.
 *
 * PERFORMANCE:
 *   saveDraft uses findOneAndUpdate+upsert — single atomic operation.
 *   No read-before-write; safe under concurrent tab saves.
 */

"use strict";

const VisitDraftDef       = require("../models/VisitDraft.model");
const getModel             = require("../../../core/db/getModel");
const enforceDbIsolation   = require("../../../core/db/dbIsolation.guard");
const logger               = require("@utils/logger");

// ── Internal helper ────────────────────────────────────────────────────────────

function _getModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, VisitDraftDef);
}

// ── saveDraft ─────────────────────────────────────────────────────────────────
/**
 * Upserts the draft for an active visit.
 * Called by the frontend every 5 seconds (fire-and-forget on client side).
 *
 * @param {Object} req     - Express request (org context)
 * @param {string} visitId - VisitRecord._id
 * @param {Object} data    - { chartState, notes }
 * @returns {Promise<Object>} saved draft (plain object)
 */
async function saveDraft(req, visitId, data) {
    const Draft = _getModel(req);

    const { chartState = {}, notes = "" } = data;

    const draft = await Draft.findOneAndUpdate(
        {
            visitId,
            },
        {
            $set: {
                chartState,
                notes,
                savedAt: new Date(),
            },
        },
        { upsert: true, new: true }
    );

    return draft.toObject();
}

// ── getDraft ──────────────────────────────────────────────────────────────────
/**
 * Fetches the recovery draft for a visit, or null if none exists.
 * Called once on session resume (after refresh or re-open).
 *
 * @param {Object} req     - Express request
 * @param {string} visitId - VisitRecord._id
 * @returns {Promise<Object|null>}
 */
async function getDraft(req, visitId) {
    const Draft = _getModel(req);

    return Draft.findOne({
        visitId,
        }).lean();
}

// ── deleteDraft ───────────────────────────────────────────────────────────────
/**
 * Soft-deletes the draft after session is formally ended or cancelled.
 * Called by endVisit() and cancelVisit() service functions to ensure
 * no stale draft prompts appear on next session open.
 * Sets isDeleted=true, deletedAt=now, deletedBy=userId.
 *
 * @param {Object} req     - Express request
 * @param {string} visitId - VisitRecord._id
 * @returns {Promise<void>}
 */
async function deleteDraft(req, visitId) {
    const Draft = _getModel(req);

    await Draft.findOneAndUpdate(
        {
            visitId,
            },
        {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.context.userId ?? null,
            },
        }
    );

    logger.info({
        event:  "VISIT_DRAFT_DELETED",
        visitId,
        orgId:  req.context.organizationId,
        userId: req.context.userId,
    });
}

module.exports = { saveDraft, getDraft, deleteDraft };
