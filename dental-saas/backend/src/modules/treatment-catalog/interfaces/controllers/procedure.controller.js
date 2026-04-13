/**
 * procedure.controller.js
 * Domain: treatment-catalog
 * Layer: Interfaces > Controllers
 *
 * USE CASES:
 *   getProceduresByCategory  GET  /treatment-catalog/procedures?categoryId=
 *   createProcedure          POST /treatment-catalog/procedures
 *   updateProcedure          PUT  /treatment-catalog/procedures/:id
 *   toggleProcedureStatus    PATCH /treatment-catalog/procedures/:id/toggle
 */

"use strict";

const procedureRepo = require("../../infrastructure/repositories/procedureRepository");
const categoryRepo = require("../../infrastructure/repositories/categoryRepository");
const { buildProcedureDTO, buildProcedureListDTO } = require("../../application/dto/procedure.dto");
const { createProcedureSchema, updateProcedureSchema } = require("../validators/treatment-catalog.validator");
const { authorize } = require("../../../../utils/authorize");
const logger = require("@utils/logger");

// ── GET /procedures?categoryId= ───────────────────────────────────────────────

async function getProceduresByCategory(req, res) {
    try {
        authorize(req, "treatments.read");

        const { categoryId, includeInactive } = req.query;
        if (!categoryId) {
            return res.status(400).json({
                success: false,
                error: { code: "MISSING_PARAM", message: "categoryId query parameter is required" },
            });
        }

        // Guard: category must belong to this org
        const category = await categoryRepo.findById(req, categoryId);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: { code: "CATEGORY_NOT_FOUND", message: "Category not found" },
            });
        }

        const procedures = await procedureRepo.findByCategory(req, categoryId, {
            includeInactive: includeInactive === "true",
        });

        return res.json({
            success: true,
            data: buildProcedureListDTO(procedures),
            meta: {
                categoryId,
                categoryName: category.name,
                total: procedures.length,
            },
        });
    } catch (err) {
        logger.error({ err, event: "CATALOG_GET_PROCEDURES" }, "[TreatmentCatalog] getProceduresByCategory failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "GET_PROCEDURES_ERROR", message: err.message },
        });
    }
}

// ── POST /procedures ──────────────────────────────────────────────────────────

async function createProcedure(req, res) {
    try {
        authorize(req, "treatments.create");

        const parsed = createProcedureSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message, details: parsed.error.errors },
            });
        }

        // Guard: category must belong to this org
        const category = await categoryRepo.findById(req, parsed.data.categoryId);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: { code: "CATEGORY_NOT_FOUND", message: "Category not found" },
            });
        }

        if (!category.isActive) {
            return res.status(400).json({
                success: false,
                error: { code: "CATEGORY_INACTIVE", message: "Cannot add procedures to an inactive category" },
            });
        }

        const procedure = await procedureRepo.create(req, {
            ...parsed.data,
            code: parsed.data.code.toUpperCase(),
        });

        logger.info({
            event: "CATALOG_PROCEDURE_CREATED",
            procedureId: procedure._id,
            categoryId: procedure.categoryId,
            orgId: req.context.organizationId,
        }, "[TreatmentCatalog] Procedure created");

        return res.status(201).json({ success: true, data: buildProcedureDTO(procedure, category) });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                error: { code: "DUPLICATE_CODE", message: "Procedure code already exists in this organization" },
            });
        }
        logger.error({ err, event: "CATALOG_CREATE_PROCEDURE" }, "[TreatmentCatalog] createProcedure failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "CREATE_PROCEDURE_ERROR", message: err.message },
        });
    }
}

// ── PUT /procedures/:id ───────────────────────────────────────────────────────

async function updateProcedure(req, res) {
    try {
        authorize(req, "treatments.update");

        const parsed = updateProcedureSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message },
            });
        }

        const procedure = await procedureRepo.updateById(req, req.params.id, parsed.data);
        if (!procedure) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Procedure not found" },
            });
        }

        return res.json({ success: true, data: buildProcedureDTO(procedure) });
    } catch (err) {
        logger.error({ err, event: "CATALOG_UPDATE_PROCEDURE" }, "[TreatmentCatalog] updateProcedure failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "UPDATE_PROCEDURE_ERROR", message: err.message },
        });
    }
}

// ── PATCH /procedures/:id/toggle ──────────────────────────────────────────────

async function toggleProcedureStatus(req, res) {
    try {
        authorize(req, "treatments.update");

        const procedure = await procedureRepo.findById(req, req.params.id);
        if (!procedure) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Procedure not found" },
            });
        }

        const updated = await procedureRepo.toggleStatus(req, req.params.id, !procedure.isActive);

        logger.info({
            event: "CATALOG_PROCEDURE_TOGGLED",
            procedureId: req.params.id,
            isActive: updated.isActive,
            orgId: req.context.organizationId,
        }, "[TreatmentCatalog] Procedure toggled");

        return res.json({ success: true, data: buildProcedureDTO(updated) });
    } catch (err) {
        logger.error({ err, event: "CATALOG_TOGGLE_PROCEDURE" }, "[TreatmentCatalog] toggleProcedureStatus failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TOGGLE_PROCEDURE_ERROR", message: err.message },
        });
    }
}

module.exports = {
    getProceduresByCategory,
    createProcedure,
    updateProcedure,
    toggleProcedureStatus,
};
