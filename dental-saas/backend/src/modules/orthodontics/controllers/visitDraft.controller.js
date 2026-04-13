/**
 * visitDraft.controller.js — Phase 6: Visit Draft Reliability Layer
 *
 * Endpoints:
 *   POST  /visit-sessions/:visitId/draft  → saveDraft
 *   GET   /visit-sessions/:visitId/draft  → getDraft
 *
 * Security:
 *   RBAC: authorize(req, "orthodontics.full") enforced.
 *   organizationId from JWT (req.context) — never from body.
 */

"use strict";

const mongoose           = require("mongoose");
const { authorize }      = require("../../../utils/authorize");
const visitDraftService  = require("../services/visitDraft.service");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ── POST /visit-sessions/:visitId/draft ────────────────────────────────────────

async function saveDraftController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const { chartState, notes } = req.body ?? {};

        const draft = await visitDraftService.saveDraft(req, visitId, {
            chartState: chartState ?? {},
            notes:      notes      ?? "",
        });

        return res.status(200).json({ success: true, data: { draft } });

    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "DRAFT_SAVE_ERROR", message: err.message },
        });
    }
}

// ── GET /visit-sessions/:visitId/draft ─────────────────────────────────────────

async function getDraftController(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const draft = await visitDraftService.getDraft(req, visitId);

        // 404 is NOT an error — no draft means clean session
        if (!draft) {
            return res.status(200).json({ success: true, data: { draft: null } });
        }

        return res.status(200).json({ success: true, data: { draft } });

    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "DRAFT_FETCH_ERROR", message: err.message },
        });
    }
}

module.exports = { saveDraftController, getDraftController };
