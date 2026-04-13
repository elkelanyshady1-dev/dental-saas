/**
 * treatment-catalog.routes.js
 * Domain: treatment-catalog
 * Layer: Interfaces > Routes
 *
 * Mounted at: /api/v1/treatment-catalog (via featureRegistry)
 * Guard stack: orgProtect → dbContext → requireEntitlement("clinical")
 *
 * DOMAIN BOUNDARY:
 *   This router is ONLY for the clinical catalog (categories + procedures).
 *   It has NO dependency on:
 *     - billing procedures (/api/v1/procedures)
 *     - clinical treatment records (/api/v1/treatments)
 *     - appointments (/api/v1/appointments)
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement = require("@middleware/requireEntitlement");

const {
    getCategories,
    createCategory,
    updateCategory,
    toggleCategoryStatus,
} = require("../controllers/category.controller");

const {
    getProceduresByCategory,
    createProcedure,
    updateProcedure,
    toggleProcedureStatus,
} = require("../controllers/procedure.controller");

// ── Auth + DB Context + Entitlement Guard ────────────────────────────────────
// orgProtect         → verifies JWT, populates req.context (userId, orgId, permissions)
// organizationContext → sets req.dbConnection (per-org DB — REQUIRED by all repositories)
// requireEntitlement  → gates on org's active plan/features
router.use(orgProtect, organizationContext, requireEntitlement("clinical"));

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /treatment-catalog/categories
 * List all categories for this org (active by default).
 * Query: ?includeInactive=true
 */
router.get("/categories", getCategories);

/**
 * POST /treatment-catalog/categories
 * Create a new category.
 * Body: { name, code, icon?, description?, sortOrder? }
 */
router.post("/categories", createCategory);

/**
 * PUT /treatment-catalog/categories/:id
 * Update category fields (name, icon, description, sortOrder).
 * Code is immutable after creation.
 */
router.put("/categories/:id", updateCategory);

/**
 * PATCH /treatment-catalog/categories/:id/toggle
 * Toggle isActive status (soft delete / restore).
 */
router.patch("/categories/:id/toggle", toggleCategoryStatus);

// ═══════════════════════════════════════════════════════════════════════════════
// PROCEDURES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /treatment-catalog/procedures?categoryId=<id>
 * List procedures for a specific category.
 * Query: ?categoryId=<id>&includeInactive=true
 */
router.get("/procedures", getProceduresByCategory);

/**
 * POST /treatment-catalog/procedures
 * Create a procedure under a category.
 * Body: { categoryId, name, code, duration, price?, color?, description?, sortOrder? }
 */
router.post("/procedures", createProcedure);

/**
 * PUT /treatment-catalog/procedures/:id
 * Update procedure fields. categoryId is immutable.
 * Body: { name?, duration?, price?, color?, description?, sortOrder? }
 */
router.put("/procedures/:id", updateProcedure);

/**
 * PATCH /treatment-catalog/procedures/:id/toggle
 * Toggle isActive status.
 */
router.patch("/procedures/:id/toggle", toggleProcedureStatus);

module.exports = router;
