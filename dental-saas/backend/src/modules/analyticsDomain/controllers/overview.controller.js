/**
 * overview.controller.js
 * GET /api/v1/org/analytics/overview
 *
 * Returns KPI strip data: Revenue Paid, Outstanding AR, New Patients,
 * Completion Rate, No-show Rate, Avg Ticket — with previous-period deltas
 * and mini sparklines.
 */

"use strict";

const logger = require("@utils/logger");
const { prepare } = require("./_prep");
const { buildOverviewDTO } = require("../../../dto/analytics.dto");
const { getRevenueTotals, getRevenueSeries } = require("../projections/revenue.projection");
const { getAppointmentScalars } = require("../projections/appointments.projection");
const { getNewPatientsCount } = require("../projections/patients.projection");
const { pct } = require("../helpers/dateBucket");

exports.getOverview = async (req, res) => {
    try {
        const prep = await prepare(req);
        if (!prep.ok) return res.status(prep.status).json(prep.body);
        const { meta, branchFilter } = prep;

        // Previous window = same length, ending at `from`.
        const fromDate = new Date(meta.from);
        const toDate = new Date(meta.to);
        const span = toDate - fromDate;
        const prevTo = new Date(fromDate.getTime() - 1);
        const prevFrom = new Date(prevTo.getTime() - span);

        const [
            revenueNow,
            revenuePrev,
            apptNow,
            apptPrev,
            newPatientsNow,
            newPatientsPrev,
            revenueSeriesForSparkline,
        ] = await Promise.all([
            getRevenueTotals(req, { from: meta.from, to: meta.to, branchFilter }),
            getRevenueTotals(req, { from: prevFrom, to: prevTo, branchFilter }),
            getAppointmentScalars(req, { from: meta.from, to: meta.to, branchFilter }),
            getAppointmentScalars(req, { from: prevFrom, to: prevTo, branchFilter }),
            getNewPatientsCount(req, { from: meta.from, to: meta.to, branchFilter }),
            getNewPatientsCount(req, { from: prevFrom, to: prevTo, branchFilter }),
            getRevenueSeries(req, {
                from: meta.from,
                to: meta.to,
                branchFilter,
                granularity: meta.granularity,
                timezone: meta.timezone,
            }),
        ]);

        const avgTicketNow = revenueNow.invoiceCount > 0
            ? revenueNow.paid / revenueNow.invoiceCount
            : 0;
        const avgTicketPrev = revenuePrev.invoiceCount > 0
            ? revenuePrev.paid / revenuePrev.invoiceCount
            : 0;

        const cards = [
            {
                key: "revenuePaid",
                label: "Revenue Paid",
                unit: "currency",
                value: revenueNow.paid,
                previousValue: revenuePrev.paid,
                sparkline: revenueSeriesForSparkline.series.map((s) => s.paid),
            },
            {
                key: "outstandingAR",
                label: "Outstanding AR",
                unit: "currency",
                value: revenueNow.outstanding,
                previousValue: revenuePrev.outstanding,
                sparkline: revenueSeriesForSparkline.series.map((s) => s.outstanding),
            },
            {
                key: "newPatients",
                label: "New Patients",
                unit: "count",
                value: newPatientsNow,
                previousValue: newPatientsPrev,
                sparkline: [],
            },
            {
                key: "completionRate",
                label: "Completion Rate",
                unit: "percent",
                value: pct(apptNow.completed, apptNow.total),
                previousValue: pct(apptPrev.completed, apptPrev.total),
                sparkline: [],
            },
            {
                key: "noShowRate",
                label: "No-show Rate",
                unit: "percent",
                value: pct(apptNow.noShow, apptNow.total),
                previousValue: pct(apptPrev.noShow, apptPrev.total),
                sparkline: [],
            },
            {
                key: "avgTicket",
                label: "Avg Ticket",
                unit: "currency",
                value: avgTicketNow,
                previousValue: avgTicketPrev,
                sparkline: [],
            },
        ];

        return res.json(buildOverviewDTO({ meta, cards }));
    } catch (err) {
        logger.error({ err: err.message, path: req.originalUrl }, "[Analytics] overview error");
        return res.status(500).json({ error: "ANALYTICS_OVERVIEW_FAILED" });
    }
};
