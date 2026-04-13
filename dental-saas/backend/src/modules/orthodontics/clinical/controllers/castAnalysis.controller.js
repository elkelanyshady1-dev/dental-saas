"use strict";

/**
 * castAnalysis.controller.js
 * Domain: clinical-snapshots
 * Layer: Interfaces › Controllers
 *
 * Routes:
 *   POST /cast-analysis       → createCastAnalysis
 *   GET  /cast-analysis?patientId=   → getByPatient
 *   GET  /cast-analysis/:id   → getById
 *
 * Auth:  req.context (JWT — SSOT)
 * RBAC:  authorize(req, "orthodontics.full" | "orthodontics.read")
 * DTO:   buildCastAnalysisDTO
 *
 * SYSTEM RULES:
 *   - req.context.organizationId ONLY (never from body)
 *   - req.context.userId for createdBy
 *   - No update/delete routes (immutable)
 */

const getModel            = require("../../../../core/db/getModel");
const CastAnalysisDef     = require("../../models/CastAnalysis.model");
const { runCastAnalysis } = require("../services/castAnalysis.service");
const { authorize }       = require("../../../../utils/authorize");
const { z }               = require("zod");

const createCastAnalysisSchema = z.object({
    patientId: z.string().min(24, "patientId must be a valid ObjectId"),
    caseId:    z.string().min(24).optional().nullable(),
    input: z.object({
        analysisType: z.enum(["skeletal", "dental", "soft_tissue"]).optional(),
        measurements: z.record(z.number()).optional(),
        notes:         z.string().max(2000).optional(),
    }).passthrough(),
}).strict();

// ── Model accessor (per-connection, per-request) ─────────────────────────────

function _getModel(req) {
    return getModel(req.dbConnection, CastAnalysisDef);
}

// ── DTO ───────────────────────────────────────────────────────────────────────

function buildCastAnalysisDTO(doc) {
    return {
        id:          doc._id,
        patientId:   doc.patientId,
        caseId:      doc.caseId   || null,
        snapshotId:  doc.snapshotId || null,
        input:       doc.input,
        result:      doc.result,
        createdBy:   doc.createdBy || null,
        createdAt:   doc.createdAt,
    };
}

// ── POST /cast-analysis ───────────────────────────────────────────────────────

const createCastAnalysis = async (req, res) => {
    try {
        authorize(req, "orthodontics.full");

        const parsed = createCastAnalysisSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message },
            });
        }

        const { patientId, caseId, input } = parsed.data;

        // Run engine (synchronous, deterministic)
        const result = runCastAnalysis(input);

        const CastAnalysis = _getModel(req);

        const doc = await CastAnalysis.create({
            organizationId: req.context.organizationId,
            patientId,
            caseId:         caseId || null,
            input,
            result,
            createdBy:      req.context.userId,
        });

        return res.status(201).json({ success: true, data: buildCastAnalysisDTO(doc.toObject()) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "CAST_ANALYSIS_CREATE_ERROR", message: err.message },
        });
    }
};

// ── GET /cast-analysis?patientId= ─────────────────────────────────────────────

const getByPatient = async (req, res) => {
    try {
        authorize(req, "orthodontics.read");

        const { patientId, caseId, limit = 20, skip = 0 } = req.query;

        if (!patientId) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "patientId query param is required" },
            });
        }

        const CastAnalysis = _getModel(req);

        const query = {
            organizationId: req.context.organizationId,
            patientId,
        };
        if (caseId) query.caseId = caseId;

        const docs = await CastAnalysis
            .find(query)
            .sort({ createdAt: -1 })
            .skip(Number(skip))
            .limit(Math.min(Number(limit), 50))
            .lean();

        return res.json({ success: true, data: docs.map(buildCastAnalysisDTO) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "CAST_ANALYSIS_LIST_ERROR", message: err.message },
        });
    }
};

// ── GET /cast-analysis/:id ────────────────────────────────────────────────────

const getById = async (req, res) => {
    try {
        authorize(req, "orthodontics.read");

        const CastAnalysis = _getModel(req);

        const doc = await CastAnalysis.findOne({
            _id:            req.params.id,
            organizationId: req.context.organizationId,
        }).lean();

        if (!doc) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Cast analysis not found" },
            });
        }

        return res.json({ success: true, data: buildCastAnalysisDTO(doc) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "CAST_ANALYSIS_GET_ERROR", message: err.message },
        });
    }
};

module.exports = {
    createCastAnalysis,
    getByPatient,
    getById,
};
