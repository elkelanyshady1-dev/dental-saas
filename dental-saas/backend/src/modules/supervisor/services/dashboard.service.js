/**
 * dashboard.service.js — Supervisor Dashboard Service
 *
 * Aggregates case data across multiple organizations for the supervisor dashboard.
 * ALL data access is gated through CaseAccess — no direct OrthodonticCase queries.
 *
 * PLANE: Supervisor only.
 */

"use strict";

const mongoose = require("mongoose");
const CaseAccessDef = require("../models/CaseAccess");
const ReviewStageDef = require("../models/ReviewStage");
const OrthodonticCaseDef = require("../../orthodontics/models/orthodonticCase.model"); // ✅ Phase 4 — canonical domain
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");
const dbManager = require("../../../core/db/dbManager");
const logger = require("@utils/logger");

function _getPlatformModels() {
    const conn = getPlatformConnection();
    return {
        CaseAccess: getModel(conn, CaseAccessDef),
        ReviewStage: getModel(conn, ReviewStageDef),
    };
}

class DashboardService {

    /**
     * Get supervisor dashboard data — multi-org case aggregation.
     *
     * Returns:
     *   - cases grouped by organization
     *   - case status distribution
     *   - pending review count
     *   - recent activity
     *
     * @param {string} supervisorId
     * @returns {object} dashboard data
     */
    async getDashboard(supervisorId) {
        const { CaseAccess, ReviewStage } = _getPlatformModels();
        const supervisorOid = new mongoose.Types.ObjectId(supervisorId);

        // ─── Aggregate Cases via CaseAccess ─────────────────────────────
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const casesData = await CaseAccess.aggregate([
            {
                $match: {
                    supervisorId: supervisorOid,
                    status: "ACTIVE",
                },
            },
            // Join with OrthodonticCase
            {
                $lookup: {
                    from: "orthodonticcases",
                    localField: "caseId",
                    foreignField: "_id",
                    as: "case",
                    pipeline: [
                        {
                            $project: {
                                patientId: 1,
                                status: 1,
                                caseType: 1,
                                malocclusionClass: 1,
                                createdAt: 1,
                                updatedAt: 1,
                                "workflowData.currentStep": 1,
                            },
                        },
                    ],
                },
            },
            { $unwind: { path: "$case", preserveNullAndEmptyArrays: false } },
            // Join with Organization for display name
            {
                $lookup: {
                    from: "organizations",
                    localField: "organizationId",
                    foreignField: "_id",
                    as: "organization",
                    pipeline: [
                        { $project: { name: 1, logoUrl: 1, country: 1 } },
                    ],
                },
            },
            { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
            // Sort by most recently updated
            { $sort: { "case.updatedAt": -1 } },
        ]);

        // ─── Pending Reviews ────────────────────────────────────────────
        const caseIds = casesData.map(c => c.caseId);
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const pendingReviews = await ReviewStage.find({
            caseId: { $in: caseIds },
            status: { $in: ["PENDING", "IN_REVIEW"] },
        })
            .sort({ requestedAt: -1 })
            .limit(20)
            .lean();

        // ─── Stats Aggregation ──────────────────────────────────────────
        const stats = {
            totalCases: casesData.length,
            byOrganization: {},
            byStatus: {},
            pendingReviewCount: pendingReviews.length,
        };

        for (const item of casesData) {
            // By organization
            const orgName = item.organization?.name || "Unknown";
            stats.byOrganization[orgName] = (stats.byOrganization[orgName] || 0) + 1;

            // By case status
            const status = item.case?.status || "unknown";
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
        }

        return {
            cases: casesData,
            pendingReviews,
            stats,
        };
    }

    /**
     * List all accessible cases for a supervisor (paginated).
     *
     * @param {{ supervisorId: string, page?: number, limit?: number, status?: string, organizationId?: string }} params
     * @returns {{ cases: object[], pagination: object }}
     */
    async listCases({ supervisorId, page = 1, limit = 20, status, organizationId }) {
        const { CaseAccess } = _getPlatformModels();
        const query = {
            supervisorId: new mongoose.Types.ObjectId(supervisorId),
            status: "ACTIVE",
        };

        if (organizationId) {
            query.organizationId = new mongoose.Types.ObjectId(organizationId);
        }

        const skip = (page - 1) * limit;

        // Build aggregation pipeline
        const pipeline = [
            { $match: query },
            {
                $lookup: {
                    from: "orthodonticcases",
                    localField: "caseId",
                    foreignField: "_id",
                    as: "case",
                    pipeline: [
                        {
                            $project: {
                                patientId: 1,
                                status: 1,
                                caseType: 1,
                                malocclusionClass: 1,
                                createdAt: 1,
                                updatedAt: 1,
                                "workflowData.currentStep": 1,
                            },
                        },
                    ],
                },
            },
            { $unwind: { path: "$case", preserveNullAndEmptyArrays: false } },
        ];

        // Filter by case status if provided
        if (status) {
            pipeline.push({ $match: { "case.status": status } });
        }

        // Join organization
        pipeline.push({
            $lookup: {
                from: "organizations",
                localField: "organizationId",
                foreignField: "_id",
                as: "organization",
                pipeline: [
                    { $project: { name: 1, logoUrl: 1, country: 1 } },
                ],
            },
        });
        pipeline.push({ $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } });

        // Count total
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await CaseAccess.aggregate(countPipeline);
        const total = countResult[0]?.total || 0;

        // Paginate
        pipeline.push({ $sort: { "case.updatedAt": -1 } });
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const cases = await CaseAccess.aggregate(pipeline);

        return {
            cases,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get a single case with full detail (via CaseAccess).
     * CaseAccess MUST be pre-validated by supervisorAccessGuard.
     *
     * @param {{ caseId: string, caseAccess: object }} params
     * @returns {object} case data
     */
    async getCaseDetail({ caseId, caseAccess }) {
        const { CaseAccess, ReviewStage } = _getPlatformModels();
        // Resolve OrthodonticCase from org connection
        const conn = await dbManager.getConnection(caseAccess.organizationId.toString());
        const OrthodonticCase = getModel(conn, OrthodonticCaseDef);

        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const orthoCase = await OrthodonticCase.findById(caseId)
            .populate("patientId", "name dateOfBirth gender")
            .lean();

        if (!orthoCase) {
            const err = new Error("Case not found.");
            err.statusCode = 404;
            throw err;
        }

        // Get review stages for this case
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const reviews = await ReviewStage.find({ caseId })
            .sort({ stageType: 1, createdAt: -1 })
            .lean();

        // Get supervisors who have access to this case
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const supervisors = await CaseAccess.find({
            caseId,
            status: "ACTIVE",
        })
            .populate("supervisorId", "name email title institution")
            .lean();

        return {
            case: orthoCase,
            reviews,
            supervisors,
            accessRole: caseAccess.role,
            accessPermissions: caseAccess.permissions,
        };
    }
}

module.exports = new DashboardService();
