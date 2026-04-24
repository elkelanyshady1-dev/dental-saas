/**
 * recallDomain.controller.js — Full Recall Domain Controller
 * Domain: recalls
 * Layer: Controller
 *
 * SECURITY MODEL:
 *   1. authorize(req, P.RECALLS_READ)   — RBAC (read)
 *   2. authorize(req, P.RECALLS_UPDATE) — RBAC (status transitions)
 *   3. authorize(req, P.RECALLS_DELETE) — RBAC (cancel)
 *
 * Endpoints:
 *   GET    /recalls            → list (paginated, filtered)
 *   GET    /recalls/stats      → dashboard counters
 *   GET    /recalls/:id        → single recall
 *   PATCH  /recalls/:id/status → transition status
 *   DELETE /recalls/:id        → cancel recall
 *
 * organizationId ALWAYS from req.context (JWT SSOT).
 */

"use strict";

const mongoose            = require("mongoose");
const { authorize }       = require("../../../utils/authorize");
const { P }               = require("@rbac/orgPermissions");
const recallDomainService = require("../services/recallDomain.service");
const { updateRecallStatusSchema, parse } = require("../validators/recall.validator");
const { buildRecallDTO }  = require("../dto/recall.dto");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── GET /recalls ────────────────────────────────────────────────────────────

async function listRecallsController(req, res) {
    try {
        authorize(req, P.RECALLS_READ);

        const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

        const result = await recallDomainService.listRecalls(req, {
            status:    req.query.status    || undefined,
            search:    req.query.search    || undefined,
            branchId:  req.query.branchId  || undefined,
            patientId: req.query.patientId || undefined,
            dateFrom:  req.query.dateFrom  || undefined,
            dateTo:    req.query.dateTo    || undefined,
            type:      req.query.type      || undefined,
            page,
            limit,
        });

        return res.json({
            success: true,
            data:    Array.isArray(result.recalls) ? result.recalls.map(buildRecallDTO) : result.recalls,
            meta:    result.meta,
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECALL_LIST_ERROR", message: err.message },
        });
    }
}

// ─── GET /recalls/stats ──────────────────────────────────────────────────────

async function getRecallStatsController(req, res) {
    try {
        authorize(req, P.RECALLS_READ);

        const stats = await recallDomainService.getRecallStats(req);

        return res.json({
            success: true,
            data:    stats,
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECALL_STATS_ERROR", message: err.message },
        });
    }
}

// ─── GET /recalls/:id ────────────────────────────────────────────────────────

async function getRecallByIdController(req, res) {
    try {
        authorize(req, P.RECALLS_READ);

        const { id } = req.params;
        if (!id || !isValidId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "id must be a valid ObjectId" },
            });
        }

        const recall = await recallDomainService.getRecallById(req, id);

        return res.json({
            success: true,
            data:    buildRecallDTO(recall),
        });
    } catch (err) {
        if (err.code === "RECALL_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "RECALL_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECALL_ERROR", message: err.message },
        });
    }
}

// ─── PATCH /recalls/:id/status ───────────────────────────────────────────────

async function updateRecallStatusController(req, res) {
    try {
        authorize(req, P.RECALLS_UPDATE);

        const { id } = req.params;
        if (!id || !isValidId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "id must be a valid ObjectId" },
            });
        }

        const { status, bookedAppointmentId, notes } = parse(updateRecallStatusSchema, req.body ?? {});

        const recall = await recallDomainService.updateRecallStatus(req, id, status, {
            bookedAppointmentId: bookedAppointmentId || null,
            notes,
        });

        return res.json({
            success: true,
            data:    buildRecallDTO(recall),
        });
    } catch (err) {
        if (err.code === "RECALL_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "RECALL_NOT_FOUND", message: err.message },
            });
        }
        if (err.code === "VALIDATION_ERROR") {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: err.message, details: err.details ?? [] },
            });
        }
        if (err.code === "INVALID_STATUS_TRANSITION") {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_STATUS_TRANSITION", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECALL_UPDATE_ERROR", message: err.message },
        });
    }
}

// ─── DELETE /recalls/:id ─────────────────────────────────────────────────────

async function deleteRecallController(req, res) {
    try {
        authorize(req, P.RECALLS_DELETE);

        const { id } = req.params;
        if (!id || !isValidId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "id must be a valid ObjectId" },
            });
        }

        const recall = await recallDomainService.deleteRecall(req, id);

        return res.json({
            success: true,
            data:    buildRecallDTO(recall),
        });
    } catch (err) {
        if (err.code === "RECALL_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "RECALL_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECALL_DELETE_ERROR", message: err.message },
        });
    }
}

module.exports = {
    listRecallsController,
    getRecallStatsController,
    getRecallByIdController,
    updateRecallStatusController,
    deleteRecallController,
};
