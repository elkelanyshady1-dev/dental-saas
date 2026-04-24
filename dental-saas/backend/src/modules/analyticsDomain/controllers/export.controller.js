/**
 * export.controller.js
 * GET /api/v1/org/analytics/export — streaming CSV export.
 *
 * HR-5 hardening:
 *   - max range enforced in analytics.schema.js (12 months).
 *   - row-by-row streaming via res.write() — no full buffer.
 *   - Transfer-Encoding: chunked + 30s socket timeout.
 *   - autoAudit entry on every call.
 *   - CSV escaping for quotes, commas, newlines.
 *
 * By default, exports the Revenue series in daily buckets. Additional
 * `widgets` CSV param (future: "revenue,doctors,appointments") can extend
 * to multi-sheet ZIP — v1 is single-sheet.
 */

"use strict";

const logger = require("@utils/logger");
const auditService = require("@services/auditService");
const {
  prepare
} = require("./_prep");
const {
  getRevenueSeries
} = require("../projections/revenue.projection");
const {
  getDoctorLeaderboard
} = require("../projections/doctors.projection");
const {
  getAppointmentFunnel
} = require("../projections/appointments.projection");
const EXPORT_TIMEOUT_MS = 30_000;
exports.exportCsv = async (req, res) => {
  try {
    res.setTimeout(EXPORT_TIMEOUT_MS);
    const prep = await prepare(req, {
      exportMode: true
    });
    if (!prep.ok) return res.status(prep.status).json(prep.body);
    const {
      meta,
      branchFilter
    } = prep;
    auditService.createAuditRecord({
      actorId: req.user?._id,
      actorType: "tenant_user",
      action: "analytics.export",
      entity: "AnalyticsExport",
      branchId: meta.branchId || "000000000000000000000000",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      correlationId: req.requestId,
      success: true,
      details: {
        from: meta.from,
        to: meta.to,
        branchId: meta.branchId,
        widgets: String(req.query.widgets || "revenue")
      }
    }).catch(() => {});
    const filename = `analytics_${meta.from.slice(0, 10)}_to_${meta.to.slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-store");
    const widgets = String(req.query.widgets || "revenue").split(",").map(s => s.trim()).filter(Boolean);
    res.write(`# DentalSaaS Analytics Export\n`);
    res.write(`# Period: ${meta.from} to ${meta.to}\n`);
    res.write(`# Branch: ${meta.branchId || "ALL"}\n`);
    res.write(`# Timezone: ${meta.timezone}\n`);
    res.write(`# Generated: ${new Date().toISOString()}\n\n`);
    if (widgets.includes("revenue")) {
      const {
        series
      } = await getRevenueSeries(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
        granularity: meta.granularity,
        timezone: meta.timezone
      });
      res.write(`# Revenue\nbucket,paid,invoiced,outstanding\n`);
      for (const row of series) {
        res.write(`${csv(row.bucket)},${csv(row.paid)},${csv(row.invoiced)},${csv(row.outstanding)}\n`);
      }
      res.write(`\n`);
    }
    if (widgets.includes("doctors")) {
      const {
        rows
      } = await getDoctorLeaderboard(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
        limit: 100
      });
      res.write(`# Doctor Leaderboard\ndoctorId,displayName,appointments,completed,revenue\n`);
      for (const row of rows) {
        res.write(`${csv(row.doctorId)},${csv(row.displayName)},${csv(row.appointments)},${csv(row.completed)},${csv(row.revenue)}\n`);
      }
      res.write(`\n`);
    }
    if (widgets.includes("appointments")) {
      const {
        funnel,
        totals
      } = await getAppointmentFunnel(req, {
        from: meta.from,
        to: meta.to,
        branchFilter
      });
      res.write(`# Appointment Funnel\nstatus,count\n`);
      for (const row of funnel) {
        res.write(`${csv(row.status)},${csv(row.count)}\n`);
      }
      res.write(`# Appointment Totals\nmetric,value\n`);
      res.write(`total,${totals.total}\n`);
      res.write(`completed,${totals.completed}\n`);
      res.write(`cancelled,${totals.cancelled}\n`);
      res.write(`noShow,${totals.noShow}\n\n`);
    }
    res.end();
  } catch (err) {
    logger.error({
      err: err.message,
      path: req.originalUrl
    }, "[Analytics] export error");
    if (!res.headersSent) {
      res.status(500).json({
        error: "ANALYTICS_EXPORT_FAILED"
      });
    } else {
      res.end();
    }
  }
};
function csv(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}