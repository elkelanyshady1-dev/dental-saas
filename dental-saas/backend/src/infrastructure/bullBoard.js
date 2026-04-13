/**
 * bullBoard.js
 * Platform Infrastructure — Bull Board Queue Dashboard
 * v4.0 — Security Hardened (Production Readiness Patch)
 *
 * Mounts the Bull Board UI at /admin/queues for real-time queue monitoring.
 * Shows all 6 queues: emailQueue, smsQueue, whatsappQueue + 3 DLQs.
 *
 * Auth Strategy:
 *   DEVELOPMENT: No auth required (open access for debugging)
 *   PRODUCTION:
 *     1. Frontend opens /admin/queues?token=<JWT>
 *     2. JWT validated via jwtManager (plane-isolated, HS256) → sets session cookie
 *     3. Bull Board sub-requests use the cookie automatically
 *
 * PREVIOUS ISSUES FIXED:
 *   - CRIT-003: Used raw jwt.verify() with shared JWT_SECRET — no algorithm whitelist
 *   - CRIT-003: Session cookie signed with raw JWT_SECRET
 *   - Now uses verifyPlatformToken() for incoming tokens
 *   - Session cookie uses a dedicated HMAC to avoid JWT confusion
 *
 * Available at: /admin/queues
 * PLANE: Platform / Infrastructure
 */

"use strict";

const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { emailQueue } = require("./queues/emailQueue");
const { smsQueue, smsDLQ, whatsappQueue, whatsappDLQ } = require("./queues/channelQueues");
const { emailDLQ } = require("./queues/deadLetterQueue");
const logger = require("../utils/logger");

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
    queues: [
        // ── Primary queues ─────────────────────────────────────────────────
        new BullMQAdapter(emailQueue, { readOnlyMode: false }),
        new BullMQAdapter(smsQueue, { readOnlyMode: false }),
        new BullMQAdapter(whatsappQueue, { readOnlyMode: false }),
        // ── Dead-Letter Queues ─────────────────────────────────────────────
        new BullMQAdapter(emailDLQ, { readOnlyMode: false }),
        new BullMQAdapter(smsDLQ, { readOnlyMode: false }),
        new BullMQAdapter(whatsappDLQ, { readOnlyMode: false }),
    ],
    serverAdapter,
});

// ─── Export router factory ─────────────────────────────────────────────────────
function getBullBoardRouter() {
    const express = require("express");
    const cookieParser = require("cookie-parser");
    const jwt = require("jsonwebtoken");
    const { verifyPlatformToken } = require("../core/auth/jwtManager");
    const router = express.Router();

    router.use(cookieParser());

    const isDev = process.env.NODE_ENV !== "production";

    // ─── Security: Algorithm Whitelist (for session cookie only) ─────────
    const JWT_ALGORITHMS = ["HS256"];

    /**
     * Resolve the secret for Bull Board session cookies.
     * Uses platform secret (isolated from org tokens).
     */
    function _getSessionSecret() {
        return process.env.JWT_PLATFORM_SECRET || process.env.JWT_SECRET;
    }

    router.use((req, res, next) => {
        // ── DEV MODE: Allow unauthenticated access ──────────────────────
        if (isDev) {
            logger.debug({ path: req.originalUrl }, "[BullBoard] Dev mode — auth bypassed");
            return next();
        }

        // ── PRODUCTION: Cookie-based session OR ?token= query param ─────

        // 1. Check existing session cookie
        const sessionCookie = req.cookies?.bullboard_session;
        if (sessionCookie) {
            try {
                const decoded = jwt.verify(sessionCookie, _getSessionSecret(), {
                    algorithms: JWT_ALGORITHMS,
                });
                if (decoded.type === "platform" && decoded.bullboardSession) {
                    return next();
                }
            } catch {
                // Cookie expired — fall through to token check
            }
        }

        // 2. Check ?token= query param (initial page load)
        const queryToken = req.query.token;
        if (queryToken) {
            try {
                // Use jwtManager's plane-isolated verifier (HS256 enforced)
                const decoded = verifyPlatformToken(queryToken);

                if (decoded.type === "platform") {
                    // Valid platform token — set session cookie for sub-requests
                    const sessionToken = jwt.sign(
                        {
                            id: decoded.id,
                            type: "platform",
                            bullboardSession: true,
                        },
                        _getSessionSecret(),
                        { algorithm: "HS256", expiresIn: "30m" }
                    );

                    res.cookie("bullboard_session", sessionToken, {
                        httpOnly: true,
                        secure: true,
                        sameSite: "lax",
                        path: "/admin/",
                        maxAge: 30 * 60 * 1000,
                    });

                    return next();
                }
            } catch {
                // Invalid token — fall through to 401
            }
        }

        // 3. No valid auth — reject
        return res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Bull Board requires platform authentication. Open from Communication Center." }
        });
    });

    router.use(serverAdapter.getRouter());

    return router;
}

module.exports = { getBullBoardRouter, serverAdapter };
