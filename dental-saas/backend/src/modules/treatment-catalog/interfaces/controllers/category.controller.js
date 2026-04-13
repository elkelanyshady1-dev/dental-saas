/**
 * category.controller.js
 * Domain: treatment-catalog
 * Layer: Interfaces > Controllers
 *
 * USE CASES:
 *   getCategories        GET  /treatment-catalog/categories
 *   createCategory       POST /treatment-catalog/categories
 *   updateCategory       PUT  /treatment-catalog/categories/:id
 *   toggleCategoryStatus PATCH /treatment-catalog/categories/:id/toggle
 */

"use strict";

const categoryRepo = require("../../infrastructure/repositories/categoryRepository");
const procedureRepo = require("../../infrastructure/repositories/procedureRepository");
const { buildCategoryDTO, buildCategoryListDTO } = require("../../application/dto/category.dto");
const { createCategorySchema, updateCategorySchema } = require("../validators/treatment-catalog.validator");
const { authorize } = require("../../../../utils/authorize");
const logger = require("@utils/logger");

// ── GET /categories ───────────────────────────────────────────────────────────

async function getCategories(req, res) {
    try {
        authorize(req, "treatments.read");

        const includeInactive = req.query.includeInactive === "true";
        const categories = await categoryRepo.findAll(req, { includeInactive });

        // Enrich with procedure counts
        const countMap = {};
        await Promise.all(
            categories.map(async cat => {
                countMap[cat._id.toString()] = await procedureRepo.countByCategory(req, cat._id);
            })
        );

        return res.json({
            success: true,
            data: buildCategoryListDTO(categories, countMap),
        });
    } catch (err) {
        logger.error({ err, event: "CATALOG_GET_CATEGORIES" }, "[TreatmentCatalog] getCategories failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "GET_CATEGORIES_ERROR", message: err.message },
        });
    }
}

// ── POST /categories ──────────────────────────────────────────────────────────

async function createCategory(req, res) {
    try {
        authorize(req, "treatments.create");

        const parsed = createCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message, details: parsed.error.errors },
            });
        }

        // Duplicate code guard
        const existing = await categoryRepo.findByCode(req, parsed.data.code);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: { code: "DUPLICATE_CODE", message: `Category code "${parsed.data.code.toUpperCase()}" already exists` },
            });
        }

        const category = await categoryRepo.create(req, {
            ...parsed.data,
            code: parsed.data.code.toUpperCase(),
        });

        logger.info({
            event: "CATALOG_CATEGORY_CREATED",
            categoryId: category._id,
            orgId: req.context.organizationId,
        }, "[TreatmentCatalog] Category created");

        return res.status(201).json({ success: true, data: buildCategoryDTO(category) });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                error: { code: "DUPLICATE_CODE", message: "Category code already exists" },
            });
        }
        logger.error({ err, event: "CATALOG_CREATE_CATEGORY" }, "[TreatmentCatalog] createCategory failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "CREATE_CATEGORY_ERROR", message: err.message },
        });
    }
}

// ── PUT /categories/:id ───────────────────────────────────────────────────────

async function updateCategory(req, res) {
    try {
        authorize(req, "treatments.update");

        const parsed = updateCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message },
            });
        }

        const category = await categoryRepo.updateById(req, req.params.id, parsed.data);
        if (!category) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Category not found" } });
        }

        return res.json({ success: true, data: buildCategoryDTO(category) });
    } catch (err) {
        logger.error({ err, event: "CATALOG_UPDATE_CATEGORY" }, "[TreatmentCatalog] updateCategory failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "UPDATE_CATEGORY_ERROR", message: err.message },
        });
    }
}

// ── PATCH /categories/:id/toggle ─────────────────────────────────────────────

async function toggleCategoryStatus(req, res) {
    try {
        authorize(req, "treatments.update");

        const category = await categoryRepo.findById(req, req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Category not found" } });
        }

        const updated = await categoryRepo.toggleStatus(req, req.params.id, !category.isActive);

        logger.info({
            event: "CATALOG_CATEGORY_TOGGLED",
            categoryId: req.params.id,
            isActive: updated.isActive,
            orgId: req.context.organizationId,
        }, "[TreatmentCatalog] Category toggled");

        return res.json({ success: true, data: buildCategoryDTO(updated) });
    } catch (err) {
        logger.error({ err, event: "CATALOG_TOGGLE_CATEGORY" }, "[TreatmentCatalog] toggleCategoryStatus failed");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TOGGLE_CATEGORY_ERROR", message: err.message },
        });
    }
}

module.exports = { getCategories, createCategory, updateCategory, toggleCategoryStatus };
