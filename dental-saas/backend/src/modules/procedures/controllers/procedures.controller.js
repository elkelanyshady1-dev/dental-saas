/**
 * procedures.controller.js
 * Phase 3 — Clinical Operations: Procedure Catalog Controller
 * Phase F.1 — RLS Activation (secureModel integration)
 *
 * Service layer receives `req` for tenant context — organizationId is injected automatically.
 */

"use strict";

const procedureService = require("../services/procedures.service");
const { validateCreateProcedure, validateUpdateProcedure } = require("../validators/procedures.validator");
const logger = require("@utils/logger");
const { authorize } = require("../../../utils/authorize");

async function createProcedure(req, res) {
    try {
        authorize(req, "procedures.create");
        const { error } = validateCreateProcedure(req.body);
        if (error) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: error } });

        const procedure = await procedureService.createProcedure({
            req, // tenant context — replaces organizationId
            data: req.body
        });

        logger.info(`[Procedures] Created procedure ${procedure.code} for org ${req.context.organizationId}`);
        return res.status(201).json({ success: true, data: procedure });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "CREATE_ERROR", message: err.message } });
    }
}

async function listProcedures(req, res) {
    try {
        authorize(req, "procedures.read");
        const { category, isActive, search, page = 1, limit = 50 } = req.query;

        const result = await procedureService.listProcedures({
            req, // tenant context — replaces organizationId
            filters: {
                category,
                isActive: isActive !== undefined ? isActive === "true" : undefined,
                search
            },
            page: parseInt(page),
            limit: Math.min(parseInt(limit), 100)
        });

        return res.json({ success: true, data: result.procedures, pagination: result.pagination });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

async function getProcedure(req, res) {
    try {
        authorize(req, "procedures.read");
        const procedure = await procedureService.getProcedureById({
            req, // tenant context — replaces organizationId
            procedureId: req.params.id
        });
        return res.json({ success: true, data: procedure });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "GET_ERROR", message: err.message } });
    }
}

async function updateProcedure(req, res) {
    try {
        authorize(req, "procedures.update");
        const { error } = validateUpdateProcedure(req.body);
        if (error) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: error } });

        const { expectedVersion, ...data } = req.body;
        const procedure = await procedureService.updateProcedure({
            req, // tenant context — replaces organizationId
            procedureId: req.params.id,
            data,
            expectedVersion
        });

        return res.json({ success: true, data: procedure });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "UPDATE_ERROR", message: err.message } });
    }
}

async function deleteProcedure(req, res) {
    try {
        authorize(req, "procedures.delete");
        await procedureService.deleteProcedure({
            req, // tenant context — replaces organizationId
            procedureId: req.params.id
        });

        return res.json({ success: true, message: "Procedure deactivated." });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "DELETE_ERROR", message: err.message } });
    }
}

module.exports = { createProcedure, listProcedures, getProcedure, updateProcedure, deleteProcedure };
