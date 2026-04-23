"use strict";

/**
 * shareLink.routes.js — Public Share-Link Resolver
 *
 * Mounted at: /api/v1/public/share-links (NO AUTH)
 *
 * This router deliberately does NOT include orgProtect / requireEntitlement.
 * The token carried in the URL is the capability — the controller enforces
 * expiration, resource existence, and the asset fileType contract.
 *
 * POST-SHIP HARDENING §1 — rate-limited at 60 req/min/IP to frustrate
 * token scraping + brute-force attempts. The token space is already large
 * enough (min 32 chars per §2 entropy guard), but a rate cap narrows the
 * attack surface further and bounds resource usage on a public endpoint.
 */

const express = require("express");
const router  = express.Router();

const { createLimiter } = require("../../../middleware/rateLimiter");
const ctrl = require("../controllers/shareLink.controller");

// POST-SHIP HARDENING §1 — IP-keyed rate limit.
const shareLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyType: "ip",
    message: "Too many share-link requests from this IP. Please try again in a minute.",
});

// POST-SHIP HARDENING §8 — health endpoint. Declared BEFORE /:token so the
// literal path wins over the param matcher.
router.get("/_health", ctrl.health);

router.get("/:token", shareLimiter, ctrl.resolve);

module.exports = router;
