/**
 * widget.controllers.js
 * Analytics Domain — Thin controllers per widget endpoint.
 * Each delegates to a projection + DTO builder. All hardening rules are
 * applied in _prep.js and in the projection itself.
 */

"use strict";

const logger = require("@utils/logger");
const { prepare } = require("./_prep");
const dto = require("../../../dto/analytics.dto");

const revenueProjection = require("../projections/revenue.projection");
const appointmentsProjection = require("../projections/appointments.projection");
const patientsProjection = require("../projections/patients.projection");
const proceduresProjection = require("../projections/procedures.projection");
const doctorsProjection = require("../projections/doctors.projection");
const chairProjection = require("../projections/chair.projection");
const labProjection = require("../projections/lab.projection");
const inventoryProjection = require("../projections/inventory.projection");
const branchesProjection = require("../projections/branches.projection");

function makeController(name, fn) {
    return async (req, res) => {
        try {
            const prep = await prepare(req);
            if (!prep.ok) return res.status(prep.status).json(prep.body);
            const body = await fn(req, prep);
            return res.json(body);
        } catch (err) {
            logger.error({ err: err.message, path: req.originalUrl }, `[Analytics] ${name} error`);
            return res.status(500).json({ error: `ANALYTICS_${name.toUpperCase()}_FAILED` });
        }
    };
}

exports.getRevenue = makeController("revenue", async (req, { meta, branchFilter }) => {
    const result = await revenueProjection.getRevenueSeries(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
        granularity: meta.granularity,
        timezone: meta.timezone,
    });
    return dto.buildRevenueDTO({ meta, series: result.series, totals: result.totals });
});

exports.getAppointments = makeController("appointments", async (req, { meta, branchFilter }) => {
    const result = await appointmentsProjection.getAppointmentFunnel(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
    });
    return dto.buildAppointmentsDTO({
        meta,
        funnel: result.funnel,
        totals: result.totals,
    });
});

exports.getPatients = makeController("patients", async (req, { meta, branchFilter }) => {
    const result = await patientsProjection.getPatientGrowth(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
        granularity: meta.granularity,
        timezone: meta.timezone,
    });
    return dto.buildPatientsDTO({ meta, series: result.series, totals: result.totals });
});

exports.getProcedures = makeController("procedures", async (req, { meta, branchFilter }) => {
    const result = await proceduresProjection.getProcedureMix(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
    });
    return dto.buildProceduresDTO({ meta, slices: result.slices, totals: result.totals });
});

exports.getDoctors = makeController("doctors", async (req, { meta, branchFilter }) => {
    const result = await doctorsProjection.getDoctorLeaderboard(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
    });
    return dto.buildDoctorsDTO({ meta, rows: result.rows });
});

exports.getChair = makeController("chair", async (req, { meta, branchFilter }) => {
    const result = await chairProjection.getChairUtilization(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
    });
    return dto.buildChairDTO({ meta, rows: result.rows });
});

exports.getBranches = makeController("branches", async (req, { meta, branchFilter }) => {
    const result = await branchesProjection.getBranchComparison(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
    });
    return dto.buildBranchesDTO({ meta, rows: result.rows });
});

exports.getLab = makeController("lab", async (req, { meta, branchFilter }) => {
    const result = await labProjection.getLabSLA(req, {
        from: meta.from,
        to: meta.to,
        branchFilter,
        granularity: meta.granularity,
        timezone: meta.timezone,
    });
    return dto.buildLabDTO({ meta, series: result.series, totals: result.totals });
});

exports.getInventory = makeController("inventory", async (req, { meta, branchFilter }) => {
    const [alerts, burn] = await Promise.all([
        inventoryProjection.getInventoryAlerts(req, { branchFilter }),
        inventoryProjection.getInventoryBurn(req, {
            from: meta.from,
            to: meta.to,
            branchFilter,
        }),
    ]);
    return dto.buildInventoryDTO({ meta, alerts, burn });
});
