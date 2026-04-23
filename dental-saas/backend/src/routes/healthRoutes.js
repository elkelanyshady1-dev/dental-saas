const express = require("express");
const router = express.Router();
const { getHealthStatus, getMetrics, getDbHealth } = require("../controllers/healthController");

// ─── GET /api/health ────────────────────────────────────────────────────────
router.get("/", getHealthStatus);

// ─── GET /api/health/metrics — v24.0 PHASE 5: EventBus Observability ────────
router.get("/metrics", getMetrics);

// ─── GET /api/health/db — 3-Layer DB status ─────────────────────────────────
// Reports platform + shared sibling connections and per-cluster tenant stats.
// Returns HTTP 503 if platform or shared is disconnected.
router.get("/db", getDbHealth);

module.exports = router;
