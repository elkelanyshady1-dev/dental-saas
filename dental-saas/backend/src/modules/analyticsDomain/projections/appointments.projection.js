/**
 * appointments.projection.js
 * Analytics Domain — Appointment funnel + completion/no-show rates
 *
 * HR-1: single $match leads the pipeline; (branchId, status, startTime) indexed.
 * HR-6: funnel counts transitions via statusHistory, not just terminal status.
 *       An appointment that reached checked-in but was then cancelled still
 *       counts as "reached checked-in".
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");

async function getAppointmentFunnel(req, { from, to, branchFilter }) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);

    const match = {
        ...branchFilter,
        startTime: { $gte: new Date(from), $lte: new Date(to) },
        isActive: true,
    };

    const pipeline = [
        { $match: match },
        {
            $facet: {
                total: [{ $count: "c" }],
                byStatus: [
                    { $group: { _id: "$status", count: { $sum: 1 } } },
                ],
                reachedConfirmed: [
                    {
                        $match: {
                            $or: [
                                { status: { $in: ["confirmed", "checked-in", "in-progress", "completed"] } },
                                { "statusHistory.status": "confirmed" },
                            ],
                        },
                    },
                    { $count: "c" },
                ],
                reachedCheckedIn: [
                    {
                        $match: {
                            $or: [
                                { status: { $in: ["checked-in", "in-progress", "completed"] } },
                                { "statusHistory.status": "checked-in" },
                            ],
                        },
                    },
                    { $count: "c" },
                ],
            },
        },
    ];

    const [facet] = await Appointment.aggregate(pipeline).allowDiskUse(false);
    const total = facet?.total?.[0]?.c || 0;
    const statusMap = Object.fromEntries((facet?.byStatus || []).map((s) => [s._id, s.count]));
    const reachedConfirmed = facet?.reachedConfirmed?.[0]?.c || 0;
    const reachedCheckedIn = facet?.reachedCheckedIn?.[0]?.c || 0;

    const completed = statusMap.completed || 0;
    const cancelled = statusMap.cancelled || 0;
    const noShow = statusMap["no-show"] || 0;

    const funnel = [
        { status: "booked", count: total },
        { status: "confirmed", count: reachedConfirmed },
        { status: "checked-in", count: reachedCheckedIn },
        { status: "completed", count: completed },
        { status: "cancelled", count: cancelled },
        { status: "no-show", count: noShow },
    ];

    return {
        funnel,
        totals: { total, completed, cancelled, noShow },
    };
}

/**
 * getAppointmentScalars — for the Overview KPI strip (previous-period compare).
 */
async function getAppointmentScalars(req, { from, to, branchFilter }) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);

    const rows = await Appointment.aggregate([
        {
            $match: {
                ...branchFilter,
                startTime: { $gte: new Date(from), $lte: new Date(to) },
                isActive: true,
            },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).allowDiskUse(false);

    const statusMap = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    const total = rows.reduce((a, r) => a + r.count, 0);
    return {
        total,
        completed: statusMap.completed || 0,
        cancelled: statusMap.cancelled || 0,
        noShow: statusMap["no-show"] || 0,
    };
}

module.exports = { getAppointmentFunnel, getAppointmentScalars };
