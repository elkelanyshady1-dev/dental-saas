/**
 * systemHealth.routes.js — GET /api/internal/health (S5)
 *
 * Enterprise-grade health probe covering every subsystem the app depends
 * on at runtime. Distinct from the existing /api/health route (which is
 * a minimal liveness probe): this endpoint is a **readiness** probe —
 * used by load balancers, dashboards, and oncall runbooks to detect
 * partial degradation BEFORE it turns into a 5xx spike.
 *
 * Checks:
 *   - db.primary       MongoDB primary connection readyState
 *   - db.outboxLag     number of pending outbox events (SLO: < 100)
 *   - sockets.active   live Socket.IO connections
 *   - auth.integrity   JWT_ORG_SECRET / JWT_PLATFORM_SECRET presence
 *
 * Response shape is stable so dashboards can parse deterministically.
 * Status codes:
 *   200 — all checks pass
 *   503 — at least one "hard" check failed (DB down, auth misconfigured)
 *
 * Authentication: none — mounted under /api/internal, which should be
 * restricted at the ingress/LB layer (not exposed on the public edge).
 *
 * PLANE: Infrastructure / internal.
 */

"use strict";

const getSharedModel = require("@core/db/getSharedModel");
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const logger = require("@utils/logger");
const DB_STATE_NAMES = ["disconnected", "connected", "connecting", "disconnecting"];
router.get("/", async (req, res) => {
  const started = Date.now();

  // ── DB ───────────────────────────────────────────────────────────────
  // Step 5d: readyState comes from the platform sibling, not the removed
  // global mongoose root.
  const platformConnection = require("@core/db/platformConnection");
  const readyState = platformConnection.isReady() ? platformConnection.get().readyState : 0;
  const dbConnected = readyState === 1;
  const dbState = DB_STATE_NAMES[readyState] ?? "unknown";

  // ── Outbox backlog (platform DB) ─────────────────────────────────────
  // Lag is a soft check — a momentary spike is expected, sustained > 100
  // pending is an alerting threshold.
  let outboxLag = null;
  let outboxHealthy = true;
  try {
    const OutboxDef = require("@core/outbox/Outbox.model");
    const Outbox = getSharedModel(OutboxDef);
    outboxLag = await Outbox.countDocuments({
      status: "pending"
    }).maxTimeMS(2000).exec();
    outboxHealthy = outboxLag < 100;
  } catch (err) {
    outboxHealthy = false;
    logger.warn({
      err: err.message
    }, "[InternalHealth] Outbox lag probe failed");
  }

  // ── Active socket count ──────────────────────────────────────────────
  let activeSockets = 0;
  try {
    const {
      getConnectionMetrics
    } = require("@infra/realtime/socketServer");
    const m = getConnectionMetrics();
    activeSockets = m.activeConnections ?? 0;
  } catch {
    // Socket server not initialized (e.g., during graceful shutdown) — 0 is fine.
  }

  // ── Auth system integrity ────────────────────────────────────────────
  // In production the two plane secrets are required AND distinct. The
  // boot-time guard in server.js already aborts if either is missing;
  // this runtime check catches hot-reload / process-group drift.
  const orgSecret = process.env.JWT_ORG_SECRET;
  const platformSecret = process.env.JWT_PLATFORM_SECRET;
  const authHealthy = Boolean(orgSecret && platformSecret && orgSecret !== platformSecret);
  const elapsed = Date.now() - started;
  const allHealthy = dbConnected && authHealthy;
  const payload = {
    status: allHealthy ? "ok" : "degraded",
    checks: {
      db: {
        state: dbState,
        connected: dbConnected
      },
      outboxLag,
      outboxHealthy,
      sockets: {
        active: activeSockets
      },
      auth: authHealthy ? "healthy" : "degraded"
    },
    probeDurationMs: elapsed,
    timestamp: new Date().toISOString()
  };
  res.status(allHealthy ? 200 : 503).json(payload);
});
module.exports = router;