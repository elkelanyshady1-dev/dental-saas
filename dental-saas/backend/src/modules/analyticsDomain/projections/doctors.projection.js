/**
 * doctors.projection.js
 * Analytics Domain — Doctor leaderboard
 *
 * Per-doctor: total appointments, completed count, revenue from completed
 * appointments. Sorted by revenue desc. Limited to top N (default 20).
 *
 * HR-1: $match first on (branchId, startTime, dentistId) indexed.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const UserDef = require("../../../shared/models/User");

async function getDoctorLeaderboard(req, { from, to, branchFilter, limit = 20 }) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    const User = getModel(req.dbConnection, UserDef);

    const rows = await Appointment.aggregate([
        {
            $match: {
                ...branchFilter,
                startTime: { $gte: new Date(from), $lte: new Date(to) },
                isActive: true,
            },
        },
        {
            $group: {
                _id: "$dentistId",
                appointments: { $sum: 1 },
                completed: {
                    $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
                },
                revenue: {
                    $sum: {
                        $cond: [
                            { $eq: ["$status", "completed"] },
                            { $ifNull: ["$revenueAmount", 0] },
                            0,
                        ],
                    },
                },
            },
        },
        { $sort: { revenue: -1, appointments: -1 } },
        { $limit: limit },
        { $project: { _id: 0, doctorId: "$_id", appointments: 1, completed: 1, revenue: 1 } },
    ]).allowDiskUse(false);

    if (rows.length === 0) return { rows: [] };

    const doctorIds = rows.map((r) => r.doctorId).filter(Boolean);
    const users = await User.find({ _id: { $in: doctorIds } })
        .select("fullName firstName lastName email")
        .lean();
    const nameById = new Map(
        users.map((u) => [
            String(u._id),
            u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "—",
        ]),
    );

    const enriched = rows.map((r) => ({
        doctorId: String(r.doctorId),
        displayName: nameById.get(String(r.doctorId)) || "—",
        appointments: r.appointments,
        completed: r.completed,
        revenue: r.revenue,
    }));

    return { rows: enriched };
}

module.exports = { getDoctorLeaderboard };
