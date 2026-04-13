/**
 * review.controller.js — Academic Review Controller
 *
 * Endpoints:
 *   POST /supervisor/cases/:caseId/reviews                  — Create review stage (org-side)
 *   GET  /supervisor/cases/:caseId/reviews                  — List review stages
 *   GET  /supervisor/reviews/:reviewId                      — Get review with comments
 *   PATCH /supervisor/reviews/:reviewId/start               — Start review (PENDING → IN_REVIEW)
 *   PATCH /supervisor/reviews/:reviewId/decision            — Submit decision (approve/reject)
 *   POST /supervisor/reviews/:reviewId/comments             — Add comment
 *   GET  /supervisor/reviews/:reviewId/comments             — List comments
 *   GET  /supervisor/cases/:caseId/review-summary           — Review summary for case
 *
 * PLANE: Supervisor (cross-org via CaseAccess).
 */

"use strict";

const reviewService = require("../services/review.service");
const ReviewStageDef = require("../models/ReviewStage");
const CaseAccessDef = require("../models/CaseAccess");
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");
const logger = require("@utils/logger");

// ═══════════════════════════════════════════════════════════════════════════════
// Review Stage Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /supervisor/cases/:caseId/reviews
 * Create a new review stage request.
 * Can be called by a doctor (org context) OR supervisor (supervisor context).
 */
async function createReview(req, res) {
    try {
        const { stageType, snapshotId } = req.body;

        if (!stageType) {
            return res.status(400).json({
                success: false,
                error: "stageType is required (DIAGNOSIS, TREATMENT_PLAN, PROGRESS, FINISHING).",
            });
        }

        // Determine requester context (doctor via org or supervisor)
        const requestedBy = req.user?._id || req.supervisor?.supervisorId;
        const organizationId = req.caseAccess?.organizationId || req.organizationId;

        const review = await reviewService.createReviewStage({
            caseId: req.params.caseId,
            organizationId,
            stageType,
            requestedBy,
            snapshotId,
        });

        res.status(201).json({
            success: true,
            data: review,
        });
    } catch (error) {
        logger.error({
            event: "REVIEW_CREATE_ERROR",
            error: error.message,
            caseId: req.params.caseId,
        });

        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * GET /supervisor/cases/:caseId/reviews
 * List all review stages for a case.
 */
async function listReviews(req, res) {
    try {
        const { status } = req.query;

        const reviews = await reviewService.listReviewStages({
            caseId: req.params.caseId,
            status,
        });

        res.json({
            success: true,
            data: reviews,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * GET /supervisor/reviews/:reviewId
 * Get single review stage with comments.
 */
async function getReview(req, res) {
    try {
        const data = await reviewService.getReviewStage(req.params.reviewId);

        res.json({
            success: true,
            data,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * PATCH /supervisor/reviews/:reviewId/start
 * Start reviewing a stage (PENDING → IN_REVIEW).
 */
async function startReview(req, res) {
    try {
        const review = await reviewService.startReview({
            reviewId: req.params.reviewId,
            supervisorId: req.supervisor.supervisorId,
        });

        res.json({
            success: true,
            data: review,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * PATCH /supervisor/reviews/:reviewId/decision
 * Submit a review decision (APPROVED, REJECTED, REVISION_REQUESTED).
 */
async function submitDecision(req, res) {
    try {
        const { decision, decisionNote, grade, instructions } = req.body;

        if (!decision) {
            return res.status(400).json({
                success: false,
                error: "decision is required (APPROVED, REJECTED, REVISION_REQUESTED).",
            });
        }

        const review = await reviewService.submitDecision({
            reviewId: req.params.reviewId,
            supervisorId: req.supervisor.supervisorId,
            decision,
            decisionNote,
            grade,
            instructions,
        });

        res.json({
            success: true,
            data: review,
        });
    } catch (error) {
        logger.error({
            event: "REVIEW_DECISION_ERROR",
            error: error.message,
            reviewId: req.params.reviewId,
        });

        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Review Comment Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /supervisor/reviews/:reviewId/comments
 * Add a comment to a review stage.
 */
async function addComment(req, res) {
    try {
        const { content, type, attachments, parentCommentId } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                error: "content is required.",
            });
        }

        // Determine the caseId from the review stage
        const ReviewStage = getModel(getPlatformConnection(), ReviewStageDef);
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const review = await ReviewStage.findById(req.params.reviewId).lean();
        if (!review) {
            return res.status(404).json({
                success: false,
                error: "Review stage not found.",
            });
        }

        // Validate CaseAccess for comment permission
        const CaseAccess = getModel(getPlatformConnection(), CaseAccessDef);
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const access = await CaseAccess.findOne({
            supervisorId: req.supervisor.supervisorId,
            caseId: review.caseId,
            status: "ACTIVE",
        }).lean();

        if (!access) {
            return res.status(403).json({
                success: false,
                error: "No access to this case.",
            });
        }

        if (!access.permissions?.canComment) {
            return res.status(403).json({
                success: false,
                error: "You do not have comment permission for this case.",
            });
        }

        const comment = await reviewService.addComment({
            caseId: review.caseId,
            reviewStageId: req.params.reviewId,
            authorType: "SUPERVISOR",
            authorId: req.supervisor.supervisorId,
            authorName: req.supervisor.name,
            type,
            content,
            attachments,
            parentCommentId,
        });

        res.status(201).json({
            success: true,
            data: comment,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * GET /supervisor/reviews/:reviewId/comments
 * List comments for a review stage.
 */
async function listComments(req, res) {
    try {
        const comments = await reviewService.listComments(req.params.reviewId);

        res.json({
            success: true,
            data: comments,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * GET /supervisor/cases/:caseId/review-summary
 * Get review summary for a case.
 */
async function getReviewSummary(req, res) {
    try {
        const summary = await reviewService.getReviewSummary(req.params.caseId);

        res.json({
            success: true,
            data: summary,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

module.exports = {
    createReview,
    listReviews,
    getReview,
    startReview,
    submitDecision,
    addComment,
    listComments,
    getReviewSummary,
};
