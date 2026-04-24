/**
 * lab.projection.js
 * Analytics Domain — Lab case SLA
 *
 * On-time = delivered by expectedDelivery.
 * Late    = delivered after expectedDelivery OR still pending past expected.
 * Pending = not yet delivered and expectedDelivery in the future.
 *
 * HR-1/HR-3/HR-10 compliant.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const LabCaseDef = require("../../labDomain/models/labCase.model");
const { dateTruncStage, fillGaps } = require("../helpers/dateBucket");

async function getLabSLA(req, { from, to, branchFilter, granularity, timezone }) {
    const LabCase = getModel(req.dbConnection, LabCaseDef);

    const match = {
        ...branchFilter,
        createdAt: { $gte: new Date(from), $lte: new Date(to) },
    };

    const rows = await LabCase.aggregate([
        { $match: match },
        {
            $project: {
                bucket: dateTruncStage("createdAt", granularity, timezone),
                status: 1,
                expectedDelivery: 1,
                actualDelivery: 1,
            },
        },
        {
            $group: {
                _id: "$bucket",
                onTime: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ["$actualDelivery", null] },
                                    { $lte: ["$actualDelivery", "$expectedDelivery"] },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                late: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ["$actualDelivery", null] },
                                    { $gt: ["$actualDelivery", "$expectedDelivery"] },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                pending: {
                    $sum: {
                        $cond: [{ $eq: ["$actualDelivery", null] }, 1, 0],
                    },
                },
            },
        },
        { $project: { _id: 0, bucket: "$_id", onTime: 1, late: 1, pending: 1 } },
        { $sort: { bucket: 1 } },
    ]).allowDiskUse(false);

    const series = fillGaps(
        rows.map((r) => ({ ...r, bucket: r.bucket.toISOString() })),
        {
            from, to, granularity, timezone,
            zero: { onTime: 0, late: 0, pending: 0 },
        },
    );

    const totals = series.reduce(
        (acc, s) => ({
            onTime: acc.onTime + s.onTime,
            late: acc.late + s.late,
            pending: acc.pending + s.pending,
            cases: acc.cases + s.onTime + s.late + s.pending,
        }),
        { onTime: 0, late: 0, pending: 0, cases: 0 },
    );

    return { series, totals };
}

module.exports = { getLabSLA };
