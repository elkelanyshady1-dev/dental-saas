/**
 * patients.projection.js
 * Analytics Domain — Patient growth (new patients by period + cumulative)
 *
 * HR-1/HR-3/HR-10 compliant.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const PatientDef = require("../../../organization/patient/models/patient.model");
const { dateTruncStage, fillGaps } = require("../helpers/dateBucket");

async function getPatientGrowth(req, { from, to, branchFilter, granularity, timezone }) {
    const Patient = getModel(req.dbConnection, PatientDef);

    const match = {
        ...pickBranchMatch(branchFilter, "primaryBranchId"),
        createdAt: { $gte: new Date(from), $lte: new Date(to) },
    };

    const rows = await Patient.aggregate([
        { $match: match },
        {
            $group: {
                _id: dateTruncStage("createdAt", granularity, timezone),
                newPatients: { $sum: 1 },
                privatePatients: {
                    $sum: { $cond: [{ $eq: ["$careType", "PRIVATE"] }, 1, 0] },
                },
                academicPatients: {
                    $sum: { $cond: [{ $eq: ["$careType", "ACADEMIC"] }, 1, 0] },
                },
            },
        },
        { $project: { _id: 0, bucket: "$_id", newPatients: 1, privatePatients: 1, academicPatients: 1 } },
        { $sort: { bucket: 1 } },
    ]).allowDiskUse(false);

    const filled = fillGaps(rows.map((r) => ({ ...r, bucket: r.bucket.toISOString() })), {
        from, to, granularity, timezone,
        zero: { newPatients: 0, privatePatients: 0, academicPatients: 0 },
    });

    let running = 0;
    const series = filled.map((p) => {
        running += p.newPatients;
        return { bucket: p.bucket, newPatients: p.newPatients, cumulative: running };
    });

    const totals = rows.reduce(
        (acc, r) => {
            acc.newPatients += r.newPatients;
            acc.privatePatients += r.privatePatients;
            acc.academicPatients += r.academicPatients;
            return acc;
        },
        { newPatients: 0, privatePatients: 0, academicPatients: 0 },
    );

    return { series, totals };
}

async function getNewPatientsCount(req, { from, to, branchFilter }) {
    const Patient = getModel(req.dbConnection, PatientDef);
    const rows = await Patient.aggregate([
        {
            $match: {
                ...pickBranchMatch(branchFilter, "primaryBranchId"),
                createdAt: { $gte: new Date(from), $lte: new Date(to) },
            },
        },
        { $count: "c" },
    ]).allowDiskUse(false);
    return rows[0]?.c || 0;
}

// Patient's branch field is primaryBranchId, not branchId — remap the scope filter.
function pickBranchMatch(branchFilter, field) {
    if (!branchFilter || !branchFilter.branchId) return {};
    return { [field]: branchFilter.branchId };
}

module.exports = { getPatientGrowth, getNewPatientsCount };
