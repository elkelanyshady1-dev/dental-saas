/**
 * supervisor.routes.js — Supervisor Plane Router
 *
 * Mounted at: /api/v1/supervisor
 * Auth: Supervisor JWT (type: "supervisor") — COMPLETELY ISOLATED from org plane
 *
 * Route Groups:
 *   1. Auth (register, login, profile)         — public + protected
 *   2. Invitations (list, accept, decline)     — protected
 *   3. Dashboard (multi-org aggregation)       — protected
 *   4. Cases (detail, reviews, comments)       — protected + CaseAccess guard
 *   5. Reviews (start, decide, comment)        — protected + CaseAccess guard
 *
 * SENTINEL COMPLIANCE:
 *   ✅ No org middleware (orgProtect, organizationContext, subscriptionGuard)
 *   ✅ No req.organizationId set — cross-org context comes from CaseAccess
 *   ✅ Complete plane isolation
 *   ✅ All case data access goes through CaseAccess
 *
 * @swagger
 * tags:
 *   - name: SupervisorAuth
 *     description: Supervisor authentication endpoints
 *   - name: SupervisorInvitations
 *     description: Invitation management for supervisors
 *   - name: SupervisorDashboard
 *     description: Multi-org supervisor dashboard
 *   - name: SupervisorCases
 *     description: Case access and review management
 *   - name: SupervisorReviews
 *     description: Academic review workflow
 */

"use strict";

const express = require("express");
const { createLimiter } = require("../../../middleware/rateLimiter");
const router = express.Router();

// ─── Middleware ──────────────────────────────────────────────────────────────
const supervisorProtect = require("../middleware/supervisorProtect");
const { supervisorAccessGuard, requireSupervisorPermission } = require("../middleware/supervisorAccessGuard");

// ─── Controllers ────────────────────────────────────────────────────────────
const authCtrl = require("../controllers/supervisorAuth.controller");
const invitationCtrl = require("../controllers/invitation.controller");
const dashboardCtrl = require("../controllers/dashboard.controller");
const reviewCtrl = require("../controllers/review.controller");

// ─── Rate Limiters (IPv6-safe via centralized factory) ──────────────────────
const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyType: "ip",
    message: "Too many authentication attempts. Please try again later.",
});

const apiLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyType: "user",
    message: "Rate limit exceeded.",
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Authentication (Public)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /supervisor/auth/register:
 *   post:
 *     summary: Register a new supervisor account
 *     tags: [SupervisorAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *               title: { type: string }
 *               institution: { type: string }
 *     responses:
 *       201:
 *         description: Supervisor registered successfully
 *       409:
 *         description: Email already exists
 */
router.post("/auth/register", authLimiter, authCtrl.register);

/**
 * @swagger
 * /supervisor/auth/login:
 *   post:
 *     summary: Authenticate supervisor and get JWT token
 *     tags: [SupervisorAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful, token returned
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked
 */
router.post("/auth/login", authLimiter, authCtrl.login);

// ═══════════════════════════════════════════════════════════════════════════════
// ALL ROUTES BELOW REQUIRE SUPERVISOR AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

router.use(supervisorProtect);
router.use(apiLimiter);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Profile
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /supervisor/auth/me:
 *   get:
 *     summary: Get current supervisor profile
 *     tags: [SupervisorAuth]
 *     security:
 *       - supervisorBearerAuth: []
 *     responses:
 *       200:
 *         description: Supervisor profile
 */
router.get("/auth/me", authCtrl.getProfile);

/**
 * @swagger
 * /supervisor/auth/me:
 *   patch:
 *     summary: Update supervisor profile
 *     tags: [SupervisorAuth]
 *     security:
 *       - supervisorBearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               title: { type: string }
 *               institution: { type: string }
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.patch("/auth/me", authCtrl.updateProfile);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Invitations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /supervisor/invitations:
 *   get:
 *     summary: List pending invitations for the authenticated supervisor
 *     tags: [SupervisorInvitations]
 *     security:
 *       - supervisorBearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending invitations
 */
router.get("/invitations", invitationCtrl.listMyInvitations);

/**
 * @swagger
 * /supervisor/invitations/{id}/accept:
 *   post:
 *     summary: Accept an invitation (creates CaseAccess)
 *     tags: [SupervisorInvitations]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invitation accepted, CaseAccess granted
 *       403:
 *         description: Email mismatch
 *       410:
 *         description: Invitation expired
 */
router.post("/invitations/:id/accept", invitationCtrl.acceptInvitation);

/**
 * @swagger
 * /supervisor/invitations/{id}/decline:
 *   post:
 *     summary: Decline an invitation
 *     tags: [SupervisorInvitations]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invitation declined
 */
router.post("/invitations/:id/decline", invitationCtrl.declineInvitation);

/**
 * @swagger
 * /supervisor/invitations/accept-by-token:
 *   post:
 *     summary: Accept invitation via token (email link flow)
 *     tags: [SupervisorInvitations]
 *     security:
 *       - supervisorBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200:
 *         description: Invitation accepted via token
 */
router.post("/invitations/accept-by-token", invitationCtrl.acceptByToken);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /supervisor/dashboard:
 *   get:
 *     summary: Get supervisor dashboard (multi-org case aggregation)
 *     tags: [SupervisorDashboard]
 *     security:
 *       - supervisorBearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data with cases, stats, and pending reviews
 */
router.get("/dashboard", dashboardCtrl.getDashboard);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Cases
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /supervisor/cases:
 *   get:
 *     summary: List all accessible cases (paginated)
 *     tags: [SupervisorCases]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, diagnosis, treatment_planning, active, completed] }
 *       - in: query
 *         name: organizationId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated case list
 */
router.get("/cases", dashboardCtrl.listCases);

/**
 * @swagger
 * /supervisor/cases/{caseId}:
 *   get:
 *     summary: Get case detail (requires CaseAccess)
 *     tags: [SupervisorCases]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Case detail with reviews and supervisors
 *       403:
 *         description: No CaseAccess
 */
router.get("/cases/:caseId", supervisorAccessGuard, dashboardCtrl.getCaseDetail);

/**
 * @swagger
 * /supervisor/cases/{caseId}/review-summary:
 *   get:
 *     summary: Get review summary for a case
 *     tags: [SupervisorCases]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Review summary with stage counts
 */
router.get("/cases/:caseId/review-summary", supervisorAccessGuard, reviewCtrl.getReviewSummary);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Reviews (under case context)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /supervisor/cases/{caseId}/reviews:
 *   get:
 *     summary: List review stages for a case
 *     tags: [SupervisorReviews]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, IN_REVIEW, APPROVED, REJECTED, REVISION_REQUESTED] }
 *     responses:
 *       200:
 *         description: List of review stages
 */
router.get("/cases/:caseId/reviews", supervisorAccessGuard, reviewCtrl.listReviews);

/**
 * @swagger
 * /supervisor/cases/{caseId}/reviews:
 *   post:
 *     summary: Create a new review stage request
 *     tags: [SupervisorReviews]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stageType]
 *             properties:
 *               stageType: { type: string, enum: [DIAGNOSIS, TREATMENT_PLAN, PROGRESS, FINISHING] }
 *               snapshotId: { type: string }
 *     responses:
 *       201:
 *         description: Review stage created
 *       409:
 *         description: Active review already exists for this stage
 */
router.post("/cases/:caseId/reviews", supervisorAccessGuard, reviewCtrl.createReview);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Review Actions (by reviewId)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /supervisor/reviews/{reviewId}:
 *   get:
 *     summary: Get review stage detail with comments
 *     tags: [SupervisorReviews]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Review detail with comments
 */
router.get("/reviews/:reviewId", reviewCtrl.getReview);

/**
 * @swagger
 * /supervisor/reviews/{reviewId}/start:
 *   patch:
 *     summary: Start reviewing (PENDING → IN_REVIEW)
 *     tags: [SupervisorReviews]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Review started
 */
router.patch("/reviews/:reviewId/start", reviewCtrl.startReview);

/**
 * @swagger
 * /supervisor/reviews/{reviewId}/decision:
 *   patch:
 *     summary: Submit review decision (APPROVED, REJECTED, REVISION_REQUESTED)
 *     tags: [SupervisorReviews]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [APPROVED, REJECTED, REVISION_REQUESTED] }
 *               decisionNote: { type: string }
 *               grade: { type: string }
 *               instructions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     text: { type: string }
 *                     priority: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *     responses:
 *       200:
 *         description: Decision submitted
 *       400:
 *         description: Invalid status transition
 */
router.patch("/reviews/:reviewId/decision", reviewCtrl.submitDecision);

/**
 * @swagger
 * /supervisor/reviews/{reviewId}/comments:
 *   get:
 *     summary: List comments for a review stage
 *     tags: [SupervisorReviews]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Comment list
 */
router.get("/reviews/:reviewId/comments", reviewCtrl.listComments);

/**
 * @swagger
 * /supervisor/reviews/{reviewId}/comments:
 *   post:
 *     summary: Add a comment to a review stage
 *     tags: [SupervisorReviews]
 *     security:
 *       - supervisorBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, maxLength: 5000 }
 *               type: { type: string, enum: [COMMENT, INSTRUCTION, WARNING, QUESTION], default: COMMENT }
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url: { type: string }
 *                     fileName: { type: string }
 *                     fileType: { type: string }
 *               parentCommentId: { type: string }
 *     responses:
 *       201:
 *         description: Comment added
 *       403:
 *         description: No comment permission
 */
router.post("/reviews/:reviewId/comments", reviewCtrl.addComment);

module.exports = router;
