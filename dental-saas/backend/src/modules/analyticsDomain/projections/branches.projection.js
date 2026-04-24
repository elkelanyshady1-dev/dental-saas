/**
 * branches.projection.js
 * Analytics Domain — Cross-branch comparison
 *
 * Per-branch aggregates for the period: revenue, appointments, new patients,
 * completion rate. Branch-scoped users see only their allowed set.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const BranchDef = require("../../../shared/models/Branch");
const PatientDef = require("../../../organization/patient/models/patient.model");

async function getBranchComparison(req, { from, to, branchFilter }) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    const Branch = getModel(req.dbConnection, BranchDef);
    const Patient = getModel(req.dbConnection, PatientDef);

    const branchMatch = branchFilter && branchFilter.branchId
        ? { _id: branchFilter.branchId, isActive: true }
        : { isActive: true };

    const branches = await Branch.find(branchMatch).select("_id name").lean();
    if (branches.length === 0) return { rows: [] };

    const branchIds = branches.map((b) => b._id);

    const [apptAgg, patientAgg] = await Promise.all([
        Appointment.aggregate([
            {
                $match: {
                    branchId: { $in: branchIds },
                    startTime: { $gte: new Date(from), $lte: new Date(to) },
                    isActive: true,
                },
            },
            {
                $group: {
                    _id: "$branchId",
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
        ]).allowDiskUse(false),

        Patient.aggregate([
            {
                $match: {
                    primaryBranchId: { $in: branchIds },
                    createdAt: { $gte: new Date(from), $lte: new Date(to) },
                },
            },
            { $group: { _id: "$primaryBranchId", newPatients: { $sum: 1 } } },
        ]).allowDiskUse(false),
    ]);

    const apptMap = new Map(apptAgg.map((a) => [String(a._id), a]));
    const patientMap = new Map(patientAgg.map((p) => [String(p._id), p.newPatients]));

    return {
        rows: branches.map((b) => {
            const a = apptMap.get(String(b._id)) || { appointments: 0, completed: 0, revenue: 0 };
            return {
                branchId: String(b._id),
                branchName: b.name || "—",
                revenue: a.revenue || 0,
                appointments: a.appointments || 0,
                completed: a.completed || 0,
                newPatients: patientMap.get(String(b._id)) || 0,
            };
        }),
    };
}

module.exports = { getBranchComparison };
