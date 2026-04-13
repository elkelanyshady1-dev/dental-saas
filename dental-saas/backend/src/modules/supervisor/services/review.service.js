/**
 * review.service.js — Academic Review Service
 *
 * Handles the review stage lifecycle:
 *   Diagnosis → Treatment Plan → Progress → Finishing
 *
 * Each stage can be: PENDING → IN_REVIEW → APPROVED / REJECTED / REVISION_REQUESTED
 *
 * Includes comment threading, instruction management, and approval workflow.
 *
 * PLANE: Supervisor (cross-org via CaseAccess validation).
 */

"use strict";

const ReviewStageDef = require("../models/ReviewStage");
const ReviewCommentDef = require("../models/ReviewComment");
const CaseAccessDef = require("../models/CaseAccess");
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");
const logger = require("@utils/logger");

// Platform-level models
function _getModels() {
    const conn = getPlatformConnection();
    return {
        ReviewStage: getModel(conn, ReviewStageDef),
        ReviewComment: getModel(conn, ReviewCommentDef),
        CaseAccess: getModel(conn, CaseAccessDef),
    };
}

// Allowed status transitions for review stages
const REVIEW_TRANSITIONS = {
    PENDING: ["IN_REVIEW"],
    IN_REVIEW: ["APPROVED", "REJECTED", "REVISION_REQUESTED"],
    REVISION_REQUESTED: ["PENDING", "IN_REVIEW"],
    REJECTED: ["PENDING"],  // Allow re-submission
    APPROVED: [],           // Terminal state
};

class ReviewService {

    // ─── Review Stage CRUD ──────────────────────────────────────────────────

    /**
     * Create a review stage request (called by org-plane doctor).
     *
     * @param {{
     *   caseId: string,
     *   organizationId: string,
     *   stageType: string,
     *   requestedBy: string,
     *   snapshotId?: string,
     * }} params
     * @returns {object} review stage
     */
    async createReviewStage({ caseId, organizationId, stageType, requestedBy, snapshotId }) {
        const { ReviewStage } = _getModels();
        // Check if there's already an active review for this stage
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const existing = await ReviewStage.findOne({
            caseId,
            stageType,
            status: { $in: ["PENDING", "IN_REVIEW"] },
        }).lean();

        if (existing) {
            const err = new Error(
                `A ${stageType} review is already ${existing.status.toLowerCase()}. ` +
                "Complete or cancel it before creating a new one."
            );
            err.statusCode = 409;
            throw err;
        }

        // Calculate stage number (how many times this stage type has been reviewed)
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const previousCount = await ReviewStage.countDocuments({ caseId, stageType });

        const review = await ReviewStage.create({
            caseId,
            organizationId,
            stageType,
            stageNumber: previousCount + 1,
            status: "PENDING",
            requestedBy,
            requestedAt: new Date(),
            snapshotId: snapshotId || null,
        });

        logger.info({
            event: "REVIEW_STAGE_CREATED",
            reviewId: review._id,
            caseId,
            stageType,
            stageNumber: review.stageNumber,
            requestedBy,
        });

        // TODO: Notify supervisors
        // eventBus.emit("review.requested", { review, caseId });

        return review;
    }

    /**
     * List review stages for a case.
     *
     * @param {{ caseId: string, status?: string }} params
     * @returns {object[]} review stages
     */
    async listReviewStages({ caseId, status }) {
        const { ReviewStage } = _getModels();
        const query = { caseId };
        if (status) query.status = status;

        return ReviewStage.find(query)
            .populate("requestedBy", "name email")
            .populate("reviewedBy", "name email title")
            .sort({ stageType: 1, stageNumber: 1 })
            .lean();
    }

    /**
     * Get a single review stage with comments.
     *
     * @param {string} reviewId
     * @returns {{ review: object, comments: object[] }}
     */
    async getReviewStage(reviewId) {
        const { ReviewStage, ReviewComment } = _getModels();
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const review = await ReviewStage.findById(reviewId)
            .populate("requestedBy", "name email")
            .populate("reviewedBy", "name email title")
            .lean();

        if (!review) {
            const err = new Error("Review stage not found.");
            err.statusCode = 404;
            throw err;
        }

        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const comments = await ReviewComment.find({ reviewStageId: reviewId })
            .sort({ createdAt: 1 })
            .lean();

        return { review, comments };
    }

    /**
     * Submit a review decision (approve / reject / request revision).
     *
     * @param {{
     *   reviewId: string,
     *   supervisorId: string,
     *   decision: string,
     *   decisionNote?: string,
     *   grade?: string,
     *   instructions?: object[],
     * }} params
     * @returns {object} updated review
     */
    async submitDecision({ reviewId, supervisorId, decision, decisionNote, grade, instructions }) {
        const { ReviewStage, CaseAccess } = _getModels();
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const review = await ReviewStage.findById(reviewId);
        if (!review) {
            const err = new Error("Review stage not found.");
            err.statusCode = 404;
            throw err;
        }

        // Validate CaseAccess for this supervisor
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const access = await CaseAccess.findOne({
            supervisorId,
            caseId: review.caseId,
            status: "ACTIVE",
        }).lean();

        if (!access) {
            const err = new Error("No access to this case.");
            err.statusCode = 403;
            throw err;
        }

        if (!access.permissions?.canApprove) {
            const err = new Error("You do not have approval permission for this case.");
            err.statusCode = 403;
            throw err;
        }

        // Validate status transition
        const currentStatus = review.status;
        const allowed = REVIEW_TRANSITIONS[currentStatus];
        if (!allowed || !allowed.includes(decision)) {
            const err = new Error(
                `Cannot transition from '${currentStatus}' to '${decision}'. ` +
                `Allowed: [${(allowed || []).join(", ")}]`
            );
            err.statusCode = 400;
            throw err;
        }

        // Apply decision
        review.status = decision;
        review.reviewedBy = supervisorId;
        review.reviewedAt = new Date();
        review.decisionNote = decisionNote || null;

        if (grade) {
            review.grade = grade;
        }

        // Add instructions if provided (for REVISION_REQUESTED)
        if (instructions && Array.isArray(instructions)) {
            for (const instruction of instructions) {
                review.instructions.push({
                    text: instruction.text,
                    priority: instruction.priority || "MEDIUM",
                    createdAt: new Date(),
                });
            }
        }

        await review.save();

        logger.info({
            event: "REVIEW_DECISION_SUBMITTED",
            reviewId: review._id,
            caseId: review.caseId,
            supervisorId,
            decision,
            grade: grade || null,
        });

        // TODO: Notify requesting doctor
        // eventBus.emit("review.stage_decided", { review, decision, supervisorId });

        return review;
    }

    /**
     * Start a review (move from PENDING → IN_REVIEW).
     *
     * @param {{ reviewId: string, supervisorId: string }} params
     * @returns {object} updated review
     */
    async startReview({ reviewId, supervisorId }) {
        return this.submitDecision({
            reviewId,
            supervisorId,
            decision: "IN_REVIEW",
        });
    }

    // ─── Review Comments ────────────────────────────────────────────────────

    /**
     * Add a comment to a review stage.
     *
     * @param {{
     *   caseId: string,
     *   reviewStageId: string,
     *   authorType: string,
     *   authorId: string,
     *   authorName: string,
     *   type?: string,
     *   content: string,
     *   attachments?: object[],
     *   parentCommentId?: string,
     * }} params
     * @returns {object} comment
     */
    async addComment({ caseId, reviewStageId, authorType, authorId, authorName, type, content, attachments, parentCommentId }) {
        const { ReviewStage, ReviewComment } = _getModels();
        // Verify review stage exists and belongs to this case
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const review = await ReviewStage.findOne({
            _id: reviewStageId,
            caseId,
        }).lean();

        if (!review) {
            const err = new Error("Review stage not found.");
            err.statusCode = 404;
            throw err;
        }

        const comment = await ReviewComment.create({
            caseId,
            reviewStageId,
            authorType,
            authorId,
            authorName,
            type: type || "COMMENT",
            content,
            attachments: attachments || [],
            parentCommentId: parentCommentId || null,
        });

        logger.info({
            event: "REVIEW_COMMENT_ADDED",
            commentId: comment._id,
            reviewStageId,
            caseId,
            authorType,
            authorId,
            type: comment.type,
        });

        // TODO: Notify other participants
        // eventBus.emit("review.comment_added", { comment, caseId, reviewStageId });

        return comment;
    }

    /**
     * List comments for a review stage.
     *
     * @param {string} reviewStageId
     * @returns {object[]} comments
     */
    async listComments(reviewStageId) {
        const { ReviewComment } = _getModels();
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        return ReviewComment.find({ reviewStageId })
            .sort({ createdAt: 1 })
            .lean();
    }

    /**
     * Get review summary for a case — overview of all stages and their statuses.
     *
     * @param {string} caseId
     * @returns {object} summary
     */
    async getReviewSummary(caseId) {
        const { ReviewStage, ReviewComment } = _getModels();
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const stages = await ReviewStage.find({ caseId })
            .sort({ stageType: 1, stageNumber: -1 })
            .lean();

        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const commentCounts = await ReviewComment.aggregate([
            { $match: { caseId: require("mongoose").Types.ObjectId.createFromHexString(caseId) } },
            { $group: { _id: "$reviewStageId", count: { $sum: 1 } } },
        ]);

        const commentMap = {};
        for (const c of commentCounts) {
            commentMap[c._id.toString()] = c.count;
        }

        // Get latest stage per type
        const latestByType = {};
        for (const stage of stages) {
            if (!latestByType[stage.stageType] || stage.stageNumber > latestByType[stage.stageType].stageNumber) {
                latestByType[stage.stageType] = {
                    ...stage,
                    commentCount: commentMap[stage._id.toString()] || 0,
                };
            }
        }

        return {
            stages: latestByType,
            totalReviews: stages.length,
            pendingCount: stages.filter(s => s.status === "PENDING" || s.status === "IN_REVIEW").length,
            approvedCount: stages.filter(s => s.status === "APPROVED").length,
            rejectedCount: stages.filter(s => s.status === "REJECTED").length,
        };
    }
}

module.exports = new ReviewService();
