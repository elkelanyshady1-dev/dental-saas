/**
 * notification.validators.js — Zod schemas for notification mutation endpoints.
 *
 * PLANE: Org only.
 */

"use strict";

const { z } = require("zod");
const mongoose = require("mongoose");

// ─── Primitives ─────────────────────────────────────────────────────────────

const objectIdParam = z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
        message: "must be a valid ObjectId",
    });

// ─── Param Schemas ──────────────────────────────────────────────────────────

/** PATCH /:id/read  |  DELETE /:id */
const notificationIdParamSchema = z.object({
    id: objectIdParam,
}).strict();

// ─── Query Schemas ──────────────────────────────────────────────────────────

/** GET /notifications */
const listNotificationsQuerySchema = z.object({
    unreadOnly: z.enum(["true", "false"]).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    limit: z.string().regex(/^\d+$/, "must be a positive integer").optional(),
    cursor: z.string().optional(),
}).strict();

module.exports = {
    notificationIdParamSchema,
    listNotificationsQuerySchema,
};
