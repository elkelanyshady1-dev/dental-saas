/**
 * dlq.controller.js
 * Platform — Dead Letter Queue HTTP Handlers
 *
 * Thin controller layer. All logic lives in dlq.service.js. Validation is
 * performed inline with Zod since the platform plane does not use a global
 * validator middleware (matches existing platform controller convention).
 *
 * PLANE: Platform
 */

"use strict";

const { z } = require("zod");
const dlqService = require("./dlq.service");

// ─── Schemas ─────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
    eventType: z.string().min(1).max(200).optional(),
    orgId: z.string().min(1).max(64).optional(),
    failureCategory: z.enum(dlqService.FAILURE_CATEGORIES).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
});

const replayParamsSchema = z.object({
    eventId: z.string().regex(/^[a-f0-9]{24}$/i, "invalid ObjectId"),
});

const replayBodySchema = z
    .object({
        scope: z.string().regex(/^(platform|org:[a-f0-9]{24})$/i).optional(),
    })
    .strict();

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * GET /api/platform/dlq/events
 */
async function listEvents(req, res) {
    const parsed = listQuerySchema.parse(req.query);
    const data = await dlqService.listFailedEvents(parsed);
    res.json(data);
}

/**
 * GET /api/platform/dlq/summary
 */
async function getSummary(req, res) {
    const data = await dlqService.getSummary();
    res.json(data);
}

/**
 * POST /api/platform/dlq/replay/:eventId
 * Body (optional): { scope: "platform" | "org:<id>" }
 */
async function replayEvent(req, res) {
    const { eventId } = replayParamsSchema.parse(req.params);
    const { scope } = replayBodySchema.parse(req.body || {});

    if (!req.platformUser || !req.platformUser._id) {
        const err = new Error("platform user context required");
        err.status = 401;
        throw err;
    }

    const result = await dlqService.replayFailedEvent({
        eventId,
        actorId: String(req.platformUser._id),
        scope,
    });

    res.json(result);
}

/**
 * GET /api/platform/outbox/health
 * Returns queue health snapshot (status counts + stuckProcessing) across
 * platform + all tenant DBs. Requires DLQUEUE_MANAGE capability.
 */
async function getQueueHealth(req, res) {
    const data = await dlqService.getQueueHealth();
    res.json(data);
}

module.exports = {
    listEvents,
    getSummary,
    replayEvent,
    getQueueHealth,
};
