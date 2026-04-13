/**
 * orthoTodo.controller.js
 * Domain: ortho-todos
 * Layer: Interfaces > Controllers
 *
 * USE CASES:
 *   createTodo       POST  /ortho-todos
 *   listTodos        GET   /ortho-todos?caseId=
 *   getTodoSummary   GET   /ortho-todos/summary?caseId=
 *   getSuggestions   GET   /ortho-todos/suggest?caseId=  (read-only — no DB write)
 *   patchTodo        PATCH /ortho-todos/:id
 *   deleteTodo       DELETE /ortho-todos/:id
 *
 * SECURITY:
 *   organizationId ALWAYS from req.context (JWT).
 *   All repositories scope by organizationId automatically.
 */

"use strict";

const mongoose        = require("mongoose");
const todoRepo        = require("../repositories/orthoTodo.repository");
const suggestionSvc   = require("../services/todoSuggestion.service");
const { authorize }   = require("../../../utils/authorize");
const { createTodoSchema, patchTodoSchema, listTodosQuerySchema } = require("../validators/orthoTodo.validator");
const { buildTodoDTO, buildTodoSummaryDTO } = require("../dto/orthoTodo.dto");
const logger = require("@utils/logger");

// ─────────────────────────────────────────────────────────────────────────────
// POST /ortho-todos
// ─────────────────────────────────────────────────────────────────────────────

async function createTodo(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const parsed = createTodoSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() },
            });
        }

        const data = parsed.data;

        // Normalize visitId: empty string → null
        const visitId = data.visitId?.trim() || null;

        const doc = await todoRepo.create(req, {
            patientId:     data.patientId,
            caseId:        data.caseId,
            visitId,
            type:          data.type,
            tooth:         data.tooth       ?? null,
            surface:       data.surface     ?? null,
            description:   data.description,
            clinicalPhase: data.clinicalPhase ?? null,
            priority:      data.priority,
        });

        logger.info({
            event:    "ORTHO_TODO_CREATED",
            todoId:   doc._id.toString(),
            caseId:   data.caseId,
            orgId:    req.context.organizationId,
            actorId:  req.context.userId,
        }, "[OrthoTodo] Todo created");

        return res.status(201).json({ success: true, data: buildTodoDTO(doc) });
    } catch (err) {
        logger.error({ err, event: "ORTHO_TODO_CREATE_ERROR" }, "[OrthoTodo] createTodo failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "CREATE_TODO_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ortho-todos?caseId=&status=
// ─────────────────────────────────────────────────────────────────────────────

async function listTodos(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const parsed = listTodosQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() },
            });
        }

        const { caseId, status, limit = "100", page = "1" } = parsed.data;
        const limitNum  = Math.min(parseInt(limit, 10) || 100, 200);
        const pageNum   = Math.max(parseInt(page, 10)  || 1, 1);
        const skipCount = (pageNum - 1) * limitNum;

        const todos = await todoRepo.findByCase(req, caseId, {
            status:  status ?? null,
            limit:   limitNum,
            skip:    skipCount,
        });

        return res.json({
            success: true,
            data:    todos.map(buildTodoDTO),
            meta:    { count: todos.length, page: pageNum, limit: limitNum },
        });
    } catch (err) {
        logger.error({ err, event: "ORTHO_TODO_LIST_ERROR" }, "[OrthoTodo] listTodos failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "LIST_TODOS_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ortho-todos/summary?caseId=
// Returns lightweight pending + high-priority counts for overview badge
// IMPORTANT: Must be registered BEFORE /:id to avoid Express path collision
// ─────────────────────────────────────────────────────────────────────────────

async function getTodoSummary(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const caseId = req.query.caseId;
        if (!caseId || !mongoose.isValidObjectId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        const [pending, highPriority] = await Promise.all([
            todoRepo.countPendingByCase(req, caseId),
            todoRepo.countHighPriorityByCase(req, caseId),
        ]);

        return res.json({
            success: true,
            data:    buildTodoSummaryDTO({ pending, highPriority }),
        });
    } catch (err) {
        logger.error({ err, event: "ORTHO_TODO_SUMMARY_ERROR" }, "[OrthoTodo] getTodoSummary failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "TODO_SUMMARY_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ortho-todos/suggest?caseId=&wireType=&alignment=&tooth=
// Read-only suggestion engine — no DB write
// ─────────────────────────────────────────────────────────────────────────────

async function getSuggestions(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { wireType, alignment, tooth, caseId, patientId } = req.query;

        const suggestions = [];

        // Phase suggestion
        const suggestedPhase = suggestionSvc.suggestClinicalPhase({ wireType });

        // Todo suggestion from single alignment
        if (alignment && tooth && caseId && patientId) {
            const todo = suggestionSvc.suggestTodoFromAction({
                alignment,
                tooth,
                caseId,
                patientId,
            });
            if (todo) suggestions.push(todo);
        }

        return res.json({
            success: true,
            data: {
                suggestedClinicalPhase: suggestedPhase,
                suggestedTodos:         suggestions,
            },
        });
    } catch (err) {
        logger.error({ err, event: "ORTHO_TODO_SUGGEST_ERROR" }, "[OrthoTodo] getSuggestions failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "SUGGEST_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /ortho-todos/:id
// ─────────────────────────────────────────────────────────────────────────────

async function patchTodo(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Todo id is not a valid ObjectId" },
            });
        }

        const parsed = patchTodoSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() },
            });
        }

        const doc = await todoRepo.patch(req, id, parsed.data);
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Todo not found" },
            });
        }

        logger.info({
            event:   "ORTHO_TODO_PATCHED",
            todoId:  id,
            patch:   parsed.data,
            orgId:   req.context.organizationId,
            actorId: req.context.userId,
        }, "[OrthoTodo] Todo patched");

        return res.json({ success: true, data: buildTodoDTO(doc) });
    } catch (err) {
        logger.error({ err, event: "ORTHO_TODO_PATCH_ERROR" }, "[OrthoTodo] patchTodo failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "PATCH_TODO_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /ortho-todos/:id  (soft delete)
// ─────────────────────────────────────────────────────────────────────────────

async function deleteTodo(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Todo id is not a valid ObjectId" },
            });
        }

        const doc = await todoRepo.softDelete(req, id);
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Todo not found" },
            });
        }

        logger.info({
            event:   "ORTHO_TODO_DELETED",
            todoId:  id,
            orgId:   req.context.organizationId,
            actorId: req.context.userId,
        }, "[OrthoTodo] Todo soft-deleted");

        return res.json({ success: true, data: { id } });
    } catch (err) {
        logger.error({ err, event: "ORTHO_TODO_DELETE_ERROR" }, "[OrthoTodo] deleteTodo failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "DELETE_TODO_ERROR", message: err.message },
        });
    }
}

module.exports = { createTodo, listTodos, getTodoSummary, getSuggestions, patchTodo, deleteTodo };
