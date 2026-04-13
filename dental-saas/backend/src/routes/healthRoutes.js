const express = require("express");
const router = express.Router();
const { getHealthStatus, getMetrics } = require("../controllers/healthController");

// ─── GET /api/health ────────────────────────────────────────────────────────
router.get("/", getHealthStatus);

// ─── GET /api/health/metrics — v24.0 PHASE 5: EventBus Observability ────────
router.get("/metrics", getMetrics);

module.exports = router;
