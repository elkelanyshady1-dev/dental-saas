/**
 * recall.controller.js — Recall Controller
 * Domain: orthodontic-visits
 * Layer: Controller
 *
 * SECURITY MODEL:
 *   1. authorize(req, P.RECALLS_CREATE) — RBAC (write)
 *   2. authorize(req, P.RECALLS_READ)   — RBAC (read)
 *   3. Service call — business logic
 *
 * Endpoints:
 *   POST  /recalls              → createRecall
 *   GET   /recalls/visit/:visitId → getRecallByVisit
 *
 * organizationId ALWAYS from req.context (JWT SSOT).
 */

"use strict";

const mongoose          = require("mongoose");
const { authorize }     = require("../../../utils/authorize");
const { P }             = require("@rbac/orgPermissions");
const recallService     = require("../services/recall.service");
const { createRecallSchema, parse } = require("../../recallDomain/validators/recall.validator");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── POST /recalls ───────────────────────────────────────────────────────────

async function createRecallController(req, res) {
    try {
        authorize(req, P.RECALLS_CREATE);

        const validated = parse(createRecallSchema, req.body ?? {});

        const recall = await recallService.createRecall(req, {
            visitId:    validated.visitId,
            patientId:  validated.patientId,
            branchId:   validated.branchId || null,
            interval:   validated.interval,
            customDate: validated.customDate || null,
            reason:     validated.reason || null,
        });

        return res.status(201).json({
            success: true,
            data:    { recall },
        });

    } catch (err) {
        if (err.code === "VALIDATION_ERROR") {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: err.message, details: err.details ?? [] },
            });
        }
        if (err.code === "VISIT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: err.message },
            });
        }
        if (err.code === "INVALID_RECALL_DATE") {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_RECALL_DATE", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECALL_ERROR", message: err.message },
        });
    }
}

// ─── GET /recalls/visit/:visitId ─────────────────────────────────────────────

async function getRecallByVisitController(req, res) {
    try {
        authorize(req, P.RECALLS_READ);

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const recall = await recallService.getRecallByVisit(req, visitId);

        return res.json({
            success: true,
            data:    { recall: recall ?? null },
        });

    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECALL_ERROR", message: err.message },
        });
    }
}

module.exports = {
    createRecallController,
    getRecallByVisitController,
};
