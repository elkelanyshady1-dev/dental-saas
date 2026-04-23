/**
 * visitReport.controller.js — Visit Report Controller (READ ONLY)
 * Domain: orthodontic-visits
 * Layer: Controller
 *
 * SECURITY MODEL:
 *   1. authorize(req, "orthodontics.read") — RBAC
 *   2. checkCaseOwnership(req, caseId) — Case-level isolation
 *   3. Service call — business logic
 *
 * Endpoints:
 *   GET  /visit-reports/:visitId          → getVisitReport
 *   GET  /visit-reports/case/:caseId      → getVisitTimeline
 *
 * HARD RULES:
 *   ❌ NO mutations — read-only endpoints
 *   ✅ organizationId ALWAYS from req.context (JWT SSOT)
 *   ✅ All responses go through DTO builders
 */

"use strict";

const mongoose            = require("mongoose");
const { authorize }       = require("../../../utils/authorize");
const { checkCaseOwnership } = require("../utils/ownership.guard");
const visitReportService  = require("../services/visitReport.service");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── GET /visit-reports/:visitId ──────────────────────────────────────────────

async function getVisitReportController(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const report = await visitReportService.getVisitReport(req, visitId);

        return res.json({
            success: true,
            data:    report,
        });

    } catch (err) {
        if (err.code === "VISIT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_REPORT_ERROR", message: err.message },
        });
    }
}

// ─── GET /visit-reports/case/:caseId ─────────────────────────────────────────

async function getVisitTimelineController(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.params;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId must be a valid ObjectId" },
            });
        }

        await checkCaseOwnership(req, caseId);

        const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

        const result = await visitReportService.getVisitTimeline(req, caseId, { page, limit });

        return res.json({
            success: true,
            data:    result.visits,
            meta: {
                total: result.total,
                page,
                limit,
                pages: Math.ceil(result.total / limit),
            },
        });

    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_REPORT_ERROR", message: err.message },
        });
    }
}

module.exports = {
    getVisitReportController,
    getVisitTimelineController,
};
