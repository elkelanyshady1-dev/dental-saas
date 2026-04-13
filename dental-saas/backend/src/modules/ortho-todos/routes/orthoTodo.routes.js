/**
 * orthoTodo.routes.js
 * Domain: ortho-todos
 * Layer: Interfaces > Routes
 *
 * Mounted at: /api/v1/org/ortho-todos (via featureRegistry)
 * Guard stack: orgProtect → organizationContext → requireEntitlement("orthodontics")
 *
 * ROUTE ORDERING — CRITICAL:
 *   /summary and /suggest are STATIC segments and MUST be registered before /:id.
 *   Otherwise Express treats "summary"/"suggest" as a todo ObjectId (wrong).
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");

const {
    createTodo,
    listTodos,
    getTodoSummary,
    getSuggestions,
    patchTodo,
    deleteTodo,
} = require("../controllers/orthoTodo.controller");

// Guard stack
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"));

// ─────────────────────────────────────────────────────────────────────────────
// STATIC ROUTES — MUST be registered before /:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /ortho-todos/summary?caseId=
 * Returns pending + high-priority counts for overview badge.
 */
router.get("/summary", fieldFilterMiddleware("orthoTodo"), getTodoSummary);

/**
 * GET /ortho-todos/suggest?caseId=&wireType=&alignment=&tooth=&patientId=
 * Returns AI-style clinical suggestions — no DB write.
 */
router.get("/suggest", fieldFilterMiddleware("orthoTodo"), getSuggestions);

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /ortho-todos?caseId=&status=
 */
router.get("/", fieldFilterMiddleware("orthoTodo"), listTodos);

/**
 * POST /ortho-todos
 * Body: { caseId, patientId, type, description, tooth?, surface?, clinicalPhase?, priority?, visitId? }
 */
router.post("/", createTodo);

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /ortho-todos/:id
 * Allowed fields: description, status, priority, tooth, surface, clinicalPhase, visitId
 */
router.patch("/:id", patchTodo);

/**
 * DELETE /ortho-todos/:id  (soft delete)
 */
router.delete("/:id", deleteTodo);

module.exports = router;
