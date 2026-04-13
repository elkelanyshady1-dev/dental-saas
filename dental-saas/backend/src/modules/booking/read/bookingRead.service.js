/**
 * bookingRead.service.js — Booking Domain Read Model (CQRS Read Side)
 *
 * AUDIT-007 Remediation: CQRS read separation for bookingDomain.
 * All reads flow through here. Controllers stay thin.
 *
 * ISOLATION: All queries scoped to organizationId via BookingRequest model.
 * PLANE: Org only.
 */

"use strict";

const BookingRequestDef = require("../bookingRequest.model");
const getModel          = require("../../../core/db/getModel");

function _getModel(conn) {
    return getModel(conn, BookingRequestDef);
}

/**
 * listByStatus — Get all booking requests by status (staff dashboard).
 */
async function listByStatus(conn, { organizationId, branchId, status, page = 1, limit = 20 }) {
    if (!conn) throw new Error("ORG_CONNECTION_REQUIRED");

    const BookingRequest = _getModel(conn);
    const query = { organizationId };
    if (branchId) query.branchId = branchId;
    if (status)   query.status = status;

    const skip  = (page - 1) * limit;
    const [data, total] = await Promise.all([
        BookingRequest.find(query).sort({ requestedDate: 1, requestedTime: 1 }).skip(skip).limit(limit).lean(),
        BookingRequest.countDocuments(query),
    ]);

    return { data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
}

/**
 * getById — Get a single booking request by ID.
 */
async function getById(conn, { requestId, organizationId }) {
    if (!conn) throw new Error("ORG_CONNECTION_REQUIRED");

    const BookingRequest = _getModel(conn);
    const request = await BookingRequest.findOne({ _id: requestId, organizationId }).lean();
    if (!request) { const e = new Error("Booking request not found"); e.statusCode = 404; throw e; }
    return request;
}

/**
 * stats — Summary counts (pending/approved/rejected) for a branch.
 */
async function stats(conn, { organizationId, branchId }) {
    if (!conn) throw new Error("ORG_CONNECTION_REQUIRED");

    const BookingRequest = _getModel(conn);
    const matchFilter = { organizationId };
    if (branchId) matchFilter.branchId = branchId;

    const result = await BookingRequest.aggregate([
        { $match: matchFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const stats = { pending: 0, approved: 0, rejected: 0 };
    for (const row of result) {
        if (stats[row._id] !== undefined) stats[row._id] = row.count;
    }
    return stats;
}

module.exports = { listByStatus, getById, stats };
