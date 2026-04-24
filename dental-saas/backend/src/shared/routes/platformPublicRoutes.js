/**
 * platformPublicRoutes.js
 * v22.0 — Public API Routes (Shared Plane)
 *
 * Bridges platform pricing controllers and organization public controllers.
 * Mounted at /api/public in app.js.
 *
 * This file is intentionally in src/shared/ because it spans both planes:
 *   - Organization controllers (signup, verify-phone, whatsapp-lead)
 *   - Platform controllers (pricing, addons)
 *   - Billing domain (stripe webhooks)
 *
 * No authentication required — all routes are public.
 */
const express = require("express");
const router = express.Router();

const {
    signup,
    getPublicPlans,
    getSiteContent,
    submitWhatsAppLead
} = require("@root/organization/controllers/publicController");

const {
    requestOtp,
    verifyOtp,
    verifyEmailOtpPublic,
    resendEmailOtpPublic,
} = require("@root/organization/controllers/otpController");

const {
    getPublicPricing,
    getPricingMatrix,
    getPublicAddOns
} = require("@platform/domain/controllers/platformPublicPricing.controller");

const { DEV_AUTH_MODE, devPassThrough } = require("@config/authConfig");

// v24.0 PHASE 6: Redis-backed signup abuse protection (scales across instances)
const { signupRateLimit } = require("@middleware/signupRateLimit.middleware");

// Native In-Memory Rate Limiter avoiding external dependencies for robust demo execution
const memoryRateLimit = (windowMs, max) => {
    const hits = new Map();
    return (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();
        const record = hits.get(ip) || { count: 0, resetTime: now + windowMs };

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
        } else {
            record.count++;
        }

        hits.set(ip, record);

        if (record.count > max) {
            return res.status(429).json({ message: "Too many requests, please try again later." });
        }
        next();
    };
};

const defaultLimiter = DEV_AUTH_MODE ? devPassThrough : memoryRateLimit(15 * 60 * 1000, 100);
const signupLimiter = DEV_AUTH_MODE ? devPassThrough : memoryRateLimit(60 * 60 * 1000, 5);
const leadLimiter   = DEV_AUTH_MODE ? devPassThrough : memoryRateLimit(60 * 60 * 1000, 10);
const otpLimiter    = DEV_AUTH_MODE ? devPassThrough : memoryRateLimit(10 * 60 * 1000, 10);

if (DEV_AUTH_MODE) {
    const logger = require("@utils/logger");
    logger.warn("[PUBLIC ROUTES] DEV_AUTH_MODE active — all rate limits disabled");
}

router.use(defaultLimiter);

router.post("/signup", signupLimiter, signupRateLimit, signup);

// ─── v22.0 — Phone-Based OTP Verification (Geo Routing + Pricing Gate) ───────
router.post("/request-otp", otpLimiter, requestOtp);
router.post("/verify-otp", otpLimiter, verifyOtp);

// ─── v30.0 — Email OTP Verification (pre-signup, immediately after phone OTP) ─
router.post("/verify-email-otp", otpLimiter, verifyEmailOtpPublic);
router.post("/resend-email-otp", otpLimiter, resendEmailOtpPublic);

router.get("/site-content", getSiteContent);
router.post("/whatsapp-lead", leadLimiter, submitWhatsAppLead);

// ─── Phase 7+8 — Dynamic Regional Pricing ───────────────────────────────────
// GET /public/plans?country=EG — returns currency-aware plan data from PlanTemplate
router.get("/plans", getPublicPlans);

// ─── Phase v5.3 — Legacy Pricing (kept for backward compat) ─────────────────
router.get("/pricing", getPublicPricing);
router.get("/pricing/matrix", getPricingMatrix);
router.get("/addons", getPublicAddOns);

// ─── Phase v14.1 — Region-Aware Webhook Gateway (Platform Plane) ──────────────
// Controller relocated to platform/billing/controllers for cross-plane isolation
const stripeWebhookController = require("@billing/controllers/stripe.webhook.controller");
router.post("/webhooks/:regionCode/stripe", stripeWebhookController.handleWebhook);

// DEPRECATED: Global webhook path (v13.0)
router.post("/stripe/webhook", stripeWebhookController.handleWebhook);

// ─── Phase 2 — Kashier Webhook (EG, one-time payments) ──────────────────────
// Mounted in app.js with route-scoped raw-body capture (mirroring the Stripe
// + QStash patterns). Mounting it here as well would create a duplicate
// registration that the global express.json could intercept first, stripping
// req.rawBody before the handler sees it. Keep this comment so the next
// reviewer knows where to look.

module.exports = router;
