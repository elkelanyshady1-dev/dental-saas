/**
 * rateLimiter.js — Unified Rate Limiter Factory
 * v2.0 — IPv6-safe, centralized, express-rate-limit v8+ compliant.
 *
 * REMOVED: validate.ipAddress, normalizeIP, custom req.ip keyGenerators
 * USES:    ipKeyGenerator (built-in IPv6-safe helper from express-rate-limit)
 *
 * PLANE: Org + Portal + Platform (any plane can import createLimiter)
 *
 * @module middleware/rateLimiter
 */

"use strict";

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a standardized rate limiter middleware.
 *
 * @param {object} opts
 * @param {number} [opts.windowMs=15*60*1000] — Rolling window in ms
 * @param {number} [opts.max=100]             — Max requests per window
 * @param {string} [opts.keyType="ip"]        — "ip" | "user" | "patient"
 * @param {string|Function} [opts.message]    — Error message or handler function
 * @returns {import("express").RequestHandler}
 */
function createLimiter({
    windowMs = 15 * 60 * 1000,
    max = 100,
    keyType = "ip",
    message,
} = {}) {
    return rateLimit({
        windowMs,
        limit: max,

        standardHeaders: true,
        legacyHeaders: false,

        keyGenerator: (req) => {
            // ✅ USER-BASED (preferred for authenticated org routes)
            if (keyType === "user" && req.user?.id) {
                return `user:${req.user.id}`;
            }
            // ✅ PATIENT-BASED (portal routes)
            if (keyType === "patient" && req.patientId) {
                return `patient:${req.patientId}`;
            }
            // ✅ IPV6-SAFE (REQUIRED — no custom parsing)
            return ipKeyGenerator(req);
        },

        // If message is a function, use it as a custom handler; otherwise wrap in standard error shape
        ...(typeof message === "function"
            ? { handler: message }
            : {
                message: {
                    success: false,
                    error: {
                        code: "RATE_LIMIT_EXCEEDED",
                        message: message || "Too many requests. Please slow down.",
                    },
                },
            }),
    });
}

// ── Standardized portal error handler ───────────────────────────────────────

const createLimitHandler = (action) => (req, res) => {
    return res.status(429).json({
        success: false,
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: `Too many ${action}. Please try again later.`,
        },
    });
};

// ═══════════════════════════════════════════════════════════════════════════════
// Settings Hub Limiters (from settingsRateLimit.js)
// ═══════════════════════════════════════════════════════════════════════════════

const supportCreateLimiter = createLimiter({
    windowMs: 60_000,
    max: 10,
    keyType: "user",
    message: "Too many ticket creation requests. Maximum 10 per minute.",
});

const supportCommentLimiter = createLimiter({
    windowMs: 60_000,
    max: 15,
    keyType: "user",
    message: "Too many comment requests. Maximum 15 per minute.",
});

const billingReadLimiter = createLimiter({
    windowMs: 60_000,
    max: 30,
    keyType: "user",
    message: "Too many billing requests. Please slow down.",
});

// ═══════════════════════════════════════════════════════════════════════════════
// Intake Limiters (from intakeRateLimit.js)
// ═══════════════════════════════════════════════════════════════════════════════

const intakeValidateLimiter = createLimiter({
    windowMs: parseInt(process.env.INTAKE_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.INTAKE_RATE_LIMIT_MAX, 10) || 10,
    keyType: "ip",
    message: "Too many requests. Please try again later.",
});

const intakeSubmitLimiter = createLimiter({
    windowMs: parseInt(process.env.INTAKE_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.INTAKE_SUBMIT_LIMIT_MAX, 10) || 5,
    keyType: "ip",
    message: "Too many submission attempts. Please try again later.",
});

// ═══════════════════════════════════════════════════════════════════════════════
// Security Dashboard Limiters (from securityRateLimit.js)
// ═══════════════════════════════════════════════════════════════════════════════

const simulationLimiter = createLimiter({
    windowMs: 60_000,
    max: 20,
    keyType: "user",
    message: "Too many simulation requests. Maximum 20 per minute.",
});

const exportLimiter = createLimiter({
    windowMs: 60_000,
    max: 5,
    keyType: "user",
    message: "Too many export requests. Maximum 5 per minute.",
});

const dashboardLimiter = createLimiter({
    windowMs: 60_000,
    max: 60,
    keyType: "user",
    message: "Too many requests. Please slow down.",
});

// ═══════════════════════════════════════════════════════════════════════════════
// Portal Limiters (from portalRateLimit.js)
// ═══════════════════════════════════════════════════════════════════════════════

const portalPhotoLimiter = createLimiter({
    windowMs: 60_000,
    max: 10,
    keyType: "patient",
    message: createLimitHandler("photo uploads"),
});

const portalMessageLimiter = createLimiter({
    windowMs: 60_000,
    max: 20,
    keyType: "patient",
    message: createLimitHandler("messages"),
});

const portalMonitoringLimiter = createLimiter({
    windowMs: 5 * 60_000,
    max: 5,
    keyType: "patient",
    message: createLimitHandler("monitoring submissions"),
});

const portalProgressLimiter = createLimiter({
    windowMs: 60_000,
    max: 15,
    keyType: "patient",
    message: createLimitHandler("progress updates"),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    // Factory
    createLimiter,

    // Settings Hub
    supportCreateLimiter,
    supportCommentLimiter,
    billingReadLimiter,

    // Intake
    intakeValidateLimiter,
    intakeSubmitLimiter,

    // Security
    simulationLimiter,
    exportLimiter,
    dashboardLimiter,

    // Portal
    portalPhotoLimiter,
    portalMessageLimiter,
    portalMonitoringLimiter,
    portalProgressLimiter,
};
