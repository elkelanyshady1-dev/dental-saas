/**
 * chair.projection.js
 * Analytics Domain — Chair utilization
 *
 * HR-7 replacement for the "requires sensor integration" stub.
 * Formula:
 *   utilization = bookedMinutes / availableMinutes
 *   bookedMinutes   = Σ appointment.duration (status ∉ cancelled/no-show)
 *   availableMinutes = Σ chair-enabled weekday minutes × chairs in [from, to]
 *
 * HR-3 timezone: availableMinutes uses Branch.workingHours in Branch.timezone.
 * HR-1: $match first; appointment query is indexed on (branchId, chairId, startTime).
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const BranchDef = require("../../../shared/models/Branch");
const { wallTimeIterator } = require("./chair.helpers");

async function getChairUtilization(req, { from, to, branchFilter }) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    const Branch = getModel(req.dbConnection, BranchDef);

    const branchMatch = branchFilter && branchFilter.branchId
        ? { _id: branchFilter.branchId, isActive: true }
        : { isActive: true };

    const branches = await Branch.find(branchMatch)
        .select("name timezone chairs workingHours")
        .lean();

    if (branches.length === 0) return { rows: [] };

    // Booked minutes per (branch, chair).
    const bookedRows = await Appointment.aggregate([
        {
            $match: {
                ...branchFilter,
                startTime: { $gte: new Date(from), $lte: new Date(to) },
                status: { $nin: ["cancelled", "no-show"] },
                isActive: true,
            },
        },
        {
            $group: {
                _id: { branchId: "$branchId", chairId: "$chairId" },
                bookedMinutes: { $sum: { $ifNull: ["$duration", 0] } },
            },
        },
    ]).allowDiskUse(false);

    const bookedByKey = new Map(
        bookedRows.map((r) => [
            `${String(r._id.branchId)}:${String(r._id.chairId)}`,
            r.bookedMinutes,
        ]),
    );

    const rows = [];
    for (const branch of branches) {
        const tz = branch.timezone || "UTC";
        const availablePerChair = workingMinutesInRange(branch.workingHours, from, to, tz);
        const activeChairs = (branch.chairs || []).filter((c) => c.isActive);
        for (const chair of activeChairs) {
            const key = `${String(branch._id)}:${String(chair._id)}`;
            const bookedMinutes = bookedByKey.get(key) || 0;
            rows.push({
                branchId: String(branch._id),
                branchName: branch.name || "—",
                chairId: String(chair._id),
                chairName: chair.name || "—",
                bookedMinutes,
                availableMinutes: availablePerChair,
            });
        }
    }

    rows.sort((a, b) => (b.bookedMinutes / Math.max(1, b.availableMinutes)) - (a.bookedMinutes / Math.max(1, a.availableMinutes)));
    return { rows };
}

/**
 * workingMinutesInRange — totals the enabled weekday minutes of a branch
 * over [from, to] using the branch's timezone.
 */
function workingMinutesInRange(workingHours, from, to, timezone) {
    if (!workingHours) return 0;
    const daysByIdx = [
        "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    ];
    let total = 0;
    for (const { year, month, day, dayOfWeek } of wallTimeIterator(from, to, timezone)) {
        const key = daysByIdx[dayOfWeek];
        const wh = workingHours[key];
        if (!wh || !wh.enabled) continue;
        total += parseHHMMRange(wh.start, wh.end);
        // suppress unused vars
        void year; void month; void day;
    }
    return total;
}

function parseHHMMRange(start, end) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return Math.max(0, e - s);
}

module.exports = { getChairUtilization };
