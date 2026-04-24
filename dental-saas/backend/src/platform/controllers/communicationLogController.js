/**
 * communicationLogController.js
 * Platform Controller — Dispatcher-era CommunicationLog read API
 *
 * Routes (mounted under /api/platform/communication/logs in communication.routes.js):
 *   GET /summary   — counters + rates over a window (default 24h)
 *   GET /recent    — latest N logs (default 50, max 500)
 *   GET /failures  — latest failed / security-failed logs
 *   GET /stats     — group-by (channel, type, mode) within window
 *
 * Performance: every endpoint filters on `createdAt` within a bounded window.
 * The TTL index on the model caps the collection at ~30 days worth of rows;
 * aggregations inside that window are cheap against the (status,createdAt),
 * (channel,createdAt), (mode,createdAt) compound indexes.
 *
 * RBAC: VIEW_COMMUNICATION_METRICS (read-only — no mutations here).
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const getSharedModel = require("@core/db/getSharedModel");
const logger = require("@utils/logger");
const CommunicationLogDef = require("../models/CommunicationLog.model");
let _CommunicationLog_cache = null;
function CommunicationLog() {
    return _CommunicationLog_cache || (_CommunicationLog_cache = getSharedModel(CommunicationLogDef));
} // ─── Helpers ─────────────────────────────────────────────────────────────────
function _clampInt(value, {
  min,
  max,
  fallback
}) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function _windowStart(hours) {
  const h = _clampInt(hours, {
    min: 1,
    max: 30 * 24,
    fallback: 24
  });
  return {
    start: new Date(Date.now() - h * 3600 * 1000),
    hours: h
  };
}

// ─── GET /summary ────────────────────────────────────────────────────────────
// Aggregated counters for the window: totals, success rate, fallback count,
// security failures, avg attempts. One aggregation pipeline → one response.
//
// Success-rate math: fallback rows represent SUCCESSFUL delivery via the
// degraded path. So `successful = sent + fallback`. Rate denominator is
// terminal-only (excludes `queued` in-flight markers).
async function getSummary(req, res) {
  try {
    const {
      start,
      hours
    } = _windowStart(req.query.hours);

    // Orphan threshold: rows still "queued" older than this are stuck —
    // either a dispatcher crashed mid-publish or QStash never delivered.
    // 5 minutes is long enough to exclude normal in-flight jobs.
    const ORPHAN_AGE_MS = 5 * 60 * 1000;
    const orphanCutoff = new Date(Date.now() - ORPHAN_AGE_MS);

    // Single aggregation: all counters + latency stats in one pass.
    // `$percentile` (method: "approximate") is a MongoDB 7.0+ accumulator;
    // we prefer it over pushing durations into a client-side array, which
    // would OOM on 30-day windows at 10k+ events/day.
    // Parallel countDocuments for orphans — uses (status,createdAt) index.
    const [[agg], orphanCount] = await Promise.all([CommunicationLog().aggregate([{
      $match: {
        createdAt: {
          $gte: start
        }
      }
    }, {
      $group: {
        _id: null,
        total: {
          $sum: 1
        },
        sent: {
          $sum: {
            $cond: [{
              $eq: ["$status", "sent"]
            }, 1, 0]
          }
        },
        failed: {
          $sum: {
            $cond: [{
              $eq: ["$status", "failed"]
            }, 1, 0]
          }
        },
        queued: {
          $sum: {
            $cond: [{
              $eq: ["$status", "queued"]
            }, 1, 0]
          }
        },
        fallback: {
          $sum: {
            $cond: [{
              $eq: ["$status", "fallback"]
            }, 1, 0]
          }
        },
        securityFailed: {
          $sum: {
            $cond: [{
              $eq: ["$mode", "security-failed"]
            }, 1, 0]
          }
        },
        // Phase 5.1 — dedicated counter for CASE_LINK failures so the
        // dashboard can surface synchronous-path regressions as a
        // distinct alert instead of burying them in `failed`.
        caseLinkFailures: {
          $sum: {
            $cond: [{
              $and: [{
                $eq: ["$type", "CASE_LINK"]
              }, {
                $eq: ["$status", "failed"]
              }]
            }, 1, 0]
          }
        },
        avgAttempts: {
          $avg: "$attempts"
        },
        // Latency stats — only sync-path rows carry durationMs.
        // $avg / $max / $percentile silently skip null/undefined.
        avgDurationMs: {
          $avg: "$durationMs"
        },
        maxDurationMs: {
          $max: "$durationMs"
        },
        p95DurationMs: {
          $percentile: {
            input: "$durationMs",
            p: [0.95],
            method: "approximate"
          }
        }
      }
    }]),
    // Orphan definition: status="queued" AND mode="qstash" older than cutoff.
    // Filtering on mode="qstash" only (publisher-side rows) excludes
    // mode="qstash-received" transient observability markers which sit
    // in "queued" for the dispatch duration and would produce false
    // positives if counted. Uses the (status,mode,createdAt) compound.
    CommunicationLog().countDocuments({
      status: "queued",
      mode: "qstash",
      createdAt: {
        $lt: orphanCutoff
      }
    })]);
    const total = agg?.total || 0;
    const sent = agg?.sent || 0;
    const failed = agg?.failed || 0;
    const fallback = agg?.fallback || 0;
    const successful = sent + fallback;
    const terminalDenominator = successful + failed;

    // $percentile returns an array per the `p` input; unwrap the single p95 value.
    // Optional-chain + nullish coalesce handles (a) no rows in window → agg is undefined,
    // (b) all rows null durationMs → $percentile returns [null], (c) normal case.
    const p95 = agg?.p95DurationMs?.[0] ?? null;
    return res.json({
      windowHours: hours,
      total,
      sent,
      failed,
      queued: agg?.queued || 0,
      fallback,
      securityFailed: agg?.securityFailed || 0,
      // Phase 5.1 — CaseLink synchronous-path failures. Separate from
      // generic `failed` so the dashboard can alert on them distinctly.
      caseLinkFailures: agg?.caseLinkFailures || 0,
      // Stuck rows: status="queued" older than 5 min. Non-zero = stuck
      // dispatch, lost ASYNC worker, or QStash delivery gap.
      orphanCount,
      successRatePct: terminalDenominator ? Number((successful / terminalDenominator * 100).toFixed(2)) : null,
      failureRatePct: terminalDenominator ? Number((failed / terminalDenominator * 100).toFixed(2)) : null,
      fallbackRatePct: terminalDenominator ? Number((fallback / terminalDenominator * 100).toFixed(2)) : null,
      avgAttempts: agg?.avgAttempts ? Number(agg.avgAttempts.toFixed(2)) : null,
      avgDurationMs: agg?.avgDurationMs != null ? Math.round(agg.avgDurationMs) : null,
      p95DurationMs: p95 != null ? Math.round(p95) : null,
      maxDurationMs: agg?.maxDurationMs != null ? Math.round(agg.maxDurationMs) : null
    });
  } catch (err) {
    logger.error({
      err: err.message
    }, "[commLog.getSummary] failed");
    return res.status(500).json({
      error: "summary unavailable"
    });
  }
}

// ─── GET /recent ─────────────────────────────────────────────────────────────
// Tail of latest rows. Bounded by both (a) createdAt window and (b) limit —
// the window is belt-and-suspenders against the TTL (itself capped at 30d).
async function getRecent(req, res) {
  try {
    const limit = _clampInt(req.query.limit, {
      min: 1,
      max: 500,
      fallback: 50
    });
    const {
      start
    } = _windowStart(req.query.hours);
    const docs = await CommunicationLog().find({
      createdAt: {
        $gte: start
      }
    }).sort({
      createdAt: -1
    }).limit(limit).lean();
    return res.json({
      count: docs.length,
      logs: docs
    });
  } catch (err) {
    logger.error({
      err: err.message
    }, "[commLog.getRecent] failed");
    return res.status(500).json({
      error: "recent unavailable"
    });
  }
}

// ─── GET /failures ───────────────────────────────────────────────────────────
// Only rows with status="failed" OR mode="security-failed". Uses the
// (status,createdAt) and (mode,createdAt) compound indexes.
async function getFailures(req, res) {
  try {
    const limit = _clampInt(req.query.limit, {
      min: 1,
      max: 500,
      fallback: 50
    });
    const {
      start
    } = _windowStart(req.query.hours);
    const docs = await CommunicationLog().find({
      createdAt: {
        $gte: start
      },
      $or: [{
        status: "failed"
      }, {
        mode: "security-failed"
      }]
    }).sort({
      createdAt: -1
    }).limit(limit).lean();
    return res.json({
      count: docs.length,
      logs: docs
    });
  } catch (err) {
    logger.error({
      err: err.message
    }, "[commLog.getFailures] failed");
    return res.status(500).json({
      error: "failures unavailable"
    });
  }
}

// ─── GET /stats ──────────────────────────────────────────────────────────────
// Grouped counts per channel/type/mode within a window. Powers the pie chart
// + per-channel breakdown cards in the dashboard.
async function getStats(req, res) {
  try {
    const {
      start,
      hours
    } = _windowStart(req.query.hours);
    const [byChannel, byType, byMode] = await Promise.all([CommunicationLog().aggregate([{
      $match: {
        createdAt: {
          $gte: start
        }
      }
    }, {
      $group: {
        _id: "$channel",
        count: {
          $sum: 1
        }
      }
    }, {
      $sort: {
        count: -1
      }
    }]), CommunicationLog().aggregate([{
      $match: {
        createdAt: {
          $gte: start
        }
      }
    }, {
      $group: {
        _id: "$type",
        count: {
          $sum: 1
        }
      }
    }, {
      $sort: {
        count: -1
      }
    }, {
      $limit: 25
    }]), CommunicationLog().aggregate([{
      $match: {
        createdAt: {
          $gte: start
        }
      }
    }, {
      $group: {
        _id: "$mode",
        count: {
          $sum: 1
        }
      }
    }, {
      $sort: {
        count: -1
      }
    }])]);
    return res.json({
      windowHours: hours,
      byChannel: byChannel.map(r => ({
        key: r._id,
        count: r.count
      })),
      byType: byType.map(r => ({
        key: r._id,
        count: r.count
      })),
      byMode: byMode.map(r => ({
        key: r._id,
        count: r.count
      }))
    });
  } catch (err) {
    logger.error({
      err: err.message
    }, "[commLog.getStats] failed");
    return res.status(500).json({
      error: "stats unavailable"
    });
  }
}
module.exports = {
  getSummary,
  getRecent,
  getFailures,
  getStats
};