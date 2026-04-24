/**
 * analytics.dto.js — Analytics DTO Builders (HR-4 contract enforcement)
 *
 * Every analytics controller returns a DTO produced here. Builders:
 *   1. Normalize shape (strings for IDs, rounded currency).
 *   2. Freeze every layer via contractEnforcer.
 *   3. Run Zod validation against analytics.response.schema in dev/prod.
 *
 * Rule: Frontend renders these fields as-is — no domain computation client-side.
 */

"use strict";

const { enforce } = require("../schemas/contractEnforcer");
const schemas = require("../schemas/analytics.response.schema");
const { round2, pct } = require("../modules/analyticsDomain/helpers/dateBucket");

function buildMeta({ from, to, granularity, timezone, branchId, currency }) {
    return {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        granularity,
        timezone,
        branchId: branchId ? String(branchId) : null,
        currency: currency || "AED",
        generatedAt: new Date().toISOString(),
    };
}

function buildOverviewDTO({ meta, cards }) {
    const dto = {
        meta: buildMeta(meta),
        cards: cards.map((c) => ({
            key: c.key,
            label: c.label,
            value: round2(c.value),
            previousValue: round2(c.previousValue),
            delta: round2(c.value - c.previousValue),
            deltaPct: pct(c.value - c.previousValue, c.previousValue),
            unit: c.unit,
            sparkline: Array.isArray(c.sparkline) ? c.sparkline.map(round2) : [],
        })),
    };
    return enforce(dto, schemas.overviewSchema, "buildOverviewDTO");
}

function buildRevenueDTO({ meta, series, totals }) {
    const dto = {
        meta: buildMeta(meta),
        series: series.map((p) => ({
            bucket: p.bucket,
            paid: round2(p.paid),
            invoiced: round2(p.invoiced),
            outstanding: round2(p.outstanding),
        })),
        totals: {
            paid: round2(totals.paid),
            invoiced: round2(totals.invoiced),
            outstanding: round2(totals.outstanding),
            invoiceCount: totals.invoiceCount || 0,
            paymentCount: totals.paymentCount || 0,
        },
    };
    return enforce(dto, schemas.revenueSchema, "buildRevenueDTO");
}

function buildAppointmentsDTO({ meta, funnel, totals }) {
    const total = totals.total || 0;
    const funnelWithPct = funnel.map((f) => ({
        status: f.status,
        count: f.count,
        pct: pct(f.count, total),
    }));
    const dto = {
        meta: buildMeta(meta),
        funnel: funnelWithPct,
        rates: {
            completionRate: pct(totals.completed, total),
            noShowRate: pct(totals.noShow, total),
            cancellationRate: pct(totals.cancelled, total),
        },
        totals: {
            total,
            completed: totals.completed || 0,
            cancelled: totals.cancelled || 0,
            noShow: totals.noShow || 0,
        },
    };
    return enforce(dto, schemas.appointmentsSchema, "buildAppointmentsDTO");
}

function buildPatientsDTO({ meta, series, totals }) {
    const dto = {
        meta: buildMeta(meta),
        series: series.map((p) => ({
            bucket: p.bucket,
            newPatients: p.newPatients || 0,
            cumulative: p.cumulative || 0,
        })),
        totals: {
            newPatients: totals.newPatients || 0,
            privatePatients: totals.privatePatients || 0,
            academicPatients: totals.academicPatients || 0,
        },
    };
    return enforce(dto, schemas.patientsSchema, "buildPatientsDTO");
}

function buildProceduresDTO({ meta, slices, totals }) {
    const total = totals.count || 0;
    const dto = {
        meta: buildMeta(meta),
        slices: slices.map((s) => ({
            category: s.category || "other",
            count: s.count || 0,
            revenue: round2(s.revenue || 0),
            pct: pct(s.count, total),
        })),
        totals: {
            count: total,
            revenue: round2(totals.revenue || 0),
        },
    };
    return enforce(dto, schemas.proceduresSchema, "buildProceduresDTO");
}

function buildDoctorsDTO({ meta, rows }) {
    const dto = {
        meta: buildMeta(meta),
        rows: rows.map((r) => ({
            doctorId: String(r.doctorId),
            displayName: r.displayName || "—",
            appointments: r.appointments || 0,
            completed: r.completed || 0,
            completionRate: pct(r.completed, r.appointments),
            revenue: round2(r.revenue || 0),
        })),
    };
    return enforce(dto, schemas.doctorsSchema, "buildDoctorsDTO");
}

function buildChairDTO({ meta, rows }) {
    const totals = rows.reduce(
        (acc, r) => {
            acc.bookedMinutes += r.bookedMinutes || 0;
            acc.availableMinutes += r.availableMinutes || 0;
            return acc;
        },
        { bookedMinutes: 0, availableMinutes: 0 },
    );
    const dto = {
        meta: buildMeta(meta),
        rows: rows.map((r) => ({
            branchId: String(r.branchId),
            branchName: r.branchName || "—",
            chairId: String(r.chairId),
            chairName: r.chairName || "—",
            bookedMinutes: r.bookedMinutes || 0,
            availableMinutes: r.availableMinutes || 0,
            utilization: pct(r.bookedMinutes, r.availableMinutes),
        })),
        totals: {
            bookedMinutes: totals.bookedMinutes,
            availableMinutes: totals.availableMinutes,
            utilization: pct(totals.bookedMinutes, totals.availableMinutes),
        },
    };
    return enforce(dto, schemas.chairSchema, "buildChairDTO");
}

function buildBranchesDTO({ meta, rows }) {
    const dto = {
        meta: buildMeta(meta),
        rows: rows.map((r) => ({
            branchId: String(r.branchId),
            branchName: r.branchName || "—",
            revenue: round2(r.revenue || 0),
            appointments: r.appointments || 0,
            newPatients: r.newPatients || 0,
            completionRate: pct(r.completed, r.appointments),
        })),
    };
    return enforce(dto, schemas.branchesSchema, "buildBranchesDTO");
}

function buildLabDTO({ meta, series, totals }) {
    const dto = {
        meta: buildMeta(meta),
        series: series.map((p) => ({
            bucket: p.bucket,
            onTime: p.onTime || 0,
            late: p.late || 0,
            pending: p.pending || 0,
        })),
        totals: {
            cases: totals.cases || 0,
            onTime: totals.onTime || 0,
            late: totals.late || 0,
            pending: totals.pending || 0,
            onTimePct: pct(totals.onTime, totals.onTime + totals.late),
        },
    };
    return enforce(dto, schemas.labSchema, "buildLabDTO");
}

function buildInventoryDTO({ meta, alerts, burn }) {
    const dto = {
        meta: buildMeta(meta),
        alerts: alerts.map((a) => ({
            itemId: String(a.itemId),
            name: a.name || "—",
            stockLevel: a.stockLevel || 0,
            minStockLevel: a.minStockLevel || 0,
            deficit: Math.max(0, (a.minStockLevel || 0) - (a.stockLevel || 0)),
        })),
        burn: burn.map((b) => ({
            itemId: String(b.itemId),
            name: b.name || "—",
            totalBurn: b.totalBurn || 0,
        })),
        totals: {
            alertCount: alerts.length,
            burnItemCount: burn.length,
        },
    };
    return enforce(dto, schemas.inventorySchema, "buildInventoryDTO");
}

module.exports = {
    buildMeta,
    buildOverviewDTO,
    buildRevenueDTO,
    buildAppointmentsDTO,
    buildPatientsDTO,
    buildProceduresDTO,
    buildDoctorsDTO,
    buildChairDTO,
    buildBranchesDTO,
    buildLabDTO,
    buildInventoryDTO,
};
