/**
 * procedures.projection.js
 * Analytics Domain — Procedure mix by category + revenue
 *
 * Derives the mix from completed appointments' immutable treatment snapshot
 * plus revenueAmount. Joins the Procedure catalog for category. Falls back
 * to "other" when the catalog entry has been deleted since booking.
 *
 * HR-1: $match first; (branchId, status, startTime) indexed.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const ProcedureDef = require("../../procedures/models/Procedure.model");

async function getProcedureMix(req, { from, to, branchFilter }) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    const Procedure = getModel(req.dbConnection, ProcedureDef);

    const rows = await Appointment.aggregate([
        {
            $match: {
                ...branchFilter,
                status: "completed",
                startTime: { $gte: new Date(from), $lte: new Date(to) },
                isActive: true,
            },
        },
        {
            $group: {
                _id: "$treatment.procedureId",
                count: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$revenueAmount", 0] } },
            },
        },
    ]).allowDiskUse(false);

    // Resolve categories by procedureId in a single batch.
    const procIds = rows.map((r) => r._id).filter(Boolean);
    const procedures = procIds.length
        ? await Procedure.find({ _id: { $in: procIds } }).select("category code name").lean()
        : [];
    const catById = new Map(procedures.map((p) => [String(p._id), p.category || "other"]));

    const byCategory = new Map();
    for (const r of rows) {
        const cat = catById.get(String(r._id)) || "other";
        const existing = byCategory.get(cat) || { category: cat, count: 0, revenue: 0 };
        existing.count += r.count;
        existing.revenue += r.revenue;
        byCategory.set(cat, existing);
    }

    const slices = Array.from(byCategory.values()).sort((a, b) => b.count - a.count);
    const totals = slices.reduce(
        (acc, s) => ({ count: acc.count + s.count, revenue: acc.revenue + s.revenue }),
        { count: 0, revenue: 0 },
    );

    return { slices, totals };
}

module.exports = { getProcedureMix };
