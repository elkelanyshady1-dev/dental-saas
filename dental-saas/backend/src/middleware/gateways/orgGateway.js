/**
 * orgGateway.js — Org Authentication + Context Gateway (Phase 2)
 *
 * PURPOSE:
 * Thin composition wrapper over the existing middleware stack:
 *   orgProtect (authMiddleware + type guard) → organizationContext → dbContext
 *
 * DESIGN PRINCIPLE — COMPOSE, DO NOT REIMPLEMENT:
 * This gateway delegates to the existing, battle-tested middleware functions.
 * It does NOT reimplement JWT decoding, DB connection lifecycle (inUseCount/release),
 * subscription checking, or region failsafe logic.
 *
 * Why composition over reimplementation:
 *   - authMiddleware sets req._authDone (BUG-9 idempotency flag)
 *   - dbContext manages inUseCount + res.on("finish") connection release
 *   - organizationContext sets req.organization, req.regionCode (with fallbacks)
 *   - All three write specific req.authContext fields read by downstream guards
 *
 * req fields guaranteed after orgGateway:
 *   req.user              — hydrated org user (with populated roleId)
 *   req.organizationId    — from JWT (type-verified)
 *   req.organization      — org document (validated active + subscription)
 *   req.dbConnection      — per-org DB connection (lifecycle managed)
 *   req.authContext       — { permissionSet: Set, escalation, source, designation }
 *   req.regionCode        — from JWT or org document fallback
 *   req._authDone         — true (idempotency guard)
 *
 * PLANE: Organization only.
 * PHASE: 2 — Safe consolidation (READ-ONLY addition, no existing code changed)
 */

"use strict";

const orgProtect = require("../orgProtect");           // [authMiddleware, typeGuard]
const organizationContext = require("../organizationMiddleware");
const dbContext = require("../dbContext");
const logger = require("@utils/logger");

/**
 * Runs an array of Express middleware in sequence, resolving when all pass
 * or rejecting with the first error/early response.
 *
 * WHY NOT use express.Router().use() pattern:
 * We need a Promise-based runner so orgGateway itself can be a single
 * async middleware function, enabling clean error handling and future
 * observability hooks (latency, tracing) without modifying the originals.
 *
 * @param {import("express").RequestHandler[]} middlewares
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<void>} resolves if all pass, rejects if one calls next(err) or sends response
 */
function runMiddlewareChain(middlewares, req, res) {
    return new Promise((resolve, reject) => {
        let index = 0;

        function next(err) {
            if (err) return reject(err);

            // If a previous middleware sent the response, stop the chain.
            if (res.headersSent) return reject(new Error("RESPONSE_SENT"));

            const mw = middlewares[index++];
            if (!mw) return resolve(); // All passed

            try {
                // Handle both array middleware (orgProtect is an array) and functions
                if (Array.isArray(mw)) {
                    runMiddlewareChain(mw, req, res)
                        .then(() => next())
                        .catch(reject);
                } else {
                    mw(req, res, next);
                }
            } catch (syncErr) {
                reject(syncErr);
            }
        }

        next();
    });
}

/**
 * orgGateway middleware
 *
 * Runs the org authentication + context chain as a single middleware.
 * Equivalent to: orgProtect, organizationContext, dbContext
 *
 * @type {import("express").RequestHandler}
 */
async function orgGateway(req, res, next) {
    const start = Date.now();

    try {
        await runMiddlewareChain(
            [
                orgProtect,          // [authMiddleware + typeGuard] — sets req.user, req.authContext
                organizationContext, // sets req.organization, validates subscription
                dbContext,           // sets req.dbConnection, registers lifecycle release
            ],
            req,
            res
        );

        // Log successful gateway completion for observability
        if (process.env.GATEWAY_TRACE === "true") {
            logger.debug({
                event: "ORG_GATEWAY_PASS",
                userId: req.user?._id,
                organizationId: req.organizationId,
                durationMs: Date.now() - start,
                path: req.originalUrl,
            }, "[orgGateway] Auth + org context established");
        }

        next();
    } catch (err) {
        // runMiddlewareChain rejects with "RESPONSE_SENT" when a middleware
        // already responded (e.g., 401, 403). In that case, do nothing —
        // the response is already on the wire.
        if (err.message === "RESPONSE_SENT") {
            return; // Response already sent by orgProtect / organizationContext
        }

        logger.error({
            event: "ORG_GATEWAY_ERROR",
            err: err.message,
            path: req.originalUrl,
            durationMs: Date.now() - start,
        }, "[orgGateway] Unexpected error in auth chain");

        next(err);
    }
}

module.exports = orgGateway;
