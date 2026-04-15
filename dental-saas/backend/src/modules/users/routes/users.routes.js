/**
 * users.routes.js — User Management Routes
 * Phase 1 — Organization Access Layer
 *
 * All routes require:
 *   - orgProtect (enforces org token + injects organizationId)
 *   - requireOrgPermission (RBAC guard)
 *
 * Mounted at: /api/v1/users
 *
 * @swagger
 * tags:
 *   name: Users
 *   description: Organization user management (CRUD)
 */

"use strict";

const express = require("express");
const router = express.Router();
const orgProtect = require("@middleware/orgProtect");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P } = require("@rbac/orgPermissions");
const usersController = require("../controllers/users.controller");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const policyMiddleware = require("@rbac/policyMiddleware");
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");
const limitGuard = require("@middleware/limitGuard");
const UserDef = require("../../../shared/models/User");
const getModel = require("../../../core/db/getModel");

const profileController = require("../controllers/profile.controller");
const rolesController = require("../../authorization/roles/roles.controller");

// ─── Auth guard (idempotent with parent orgV1Routes — required for standalone module mounting) ──
router.use(orgProtect);

// ─── Profile Completion Routes (must be before /:id param routes) ─────────────
/**
 * @swagger
 * /api/v1/org/users/me:
 *   get:
 *     summary: Get the authenticated user's own profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get("/me", profileController.getMyProfile);

/**
 * @swagger
 * /api/v1/org/users/me/complete-profile:
 *   patch:
 *     summary: Complete the authenticated user's profile (first login flow)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               speciality:
 *                 type: string
 *               jobTitle:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile completed successfully
 *       400:
 *         description: Validation error
 */
router.patch("/me/complete-profile", profileController.completeProfile);

/**
 * PATCH /api/v1/org/users/me
 * Self-service profile update — any authenticated org user.
 * Only safe fields (name, phone, realEmail, profileImage, jobTitle) are accepted.
 * Role / permissions / system email are immutable via this endpoint.
 */
router.patch("/me", profileController.updateMyProfile);

/**
 * @swagger
 * /api/v1/org/users/check-username:
 *   get:
 *     summary: Live-check if a staff name will produce a taken email
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: firstName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: lastName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: |
 *           { available: true, email } — name is free
 *           { available: false, email, suggestedEmail } — name taken, suggestion provided
 */
router.get(
    "/check-username",
    requireOrgPermission(P.USERS_CREATE),
    usersController.checkUsername
);

/**
 * @swagger
 * /api/v1/org/users/practitioners:
 *   get:
 *     summary: Get active practitioners (doctors) for scheduling
 *     description: |
 *       Returns users with role name "doctor" who are active in this org.
 *       Includes branchAccess[] for branch-aware filtering on the frontend.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: |
 *           { practitioners: [{ _id, name, specialty, avatarUrl, branchAccess[], hasFullBranchAccess }] }
 */
router.get(
    "/practitioners",
    requireOrgPermission(P.USERS_READ),
    usersController.getPractitioners
);

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create a new user in the organization
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - password
 *               - roleId
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: "Aya"
 *               lastName:
 *                 type: string
 *                 example: "Ahmed"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: "Initial password for the staff member"
 *               roleId:
 *                 type: string
 *                 description: "ObjectId of a Role in this organization"
 *               branchIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               hasFullBranchAccess:
 *                 type: boolean
 *                 default: false
 *               phone:
 *                 type: string
 *               jobTitle:
 *                 type: string
 *               department:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created — email field in response contains the generated org email
 *       400:
 *         description: Validation error
 *       409:
 *         description: |
 *           EMAIL_ALREADY_EXISTS_IN_ORG — 100+ staff share the same name (auto-increment exhausted)
 */
router.post(
    "/",
    requireOrgPermission(P.USERS_CREATE),
    limitGuard("maxUsers"),
    policyMiddleware(P.USERS_CREATE),
    fieldWriteGuardMiddleware("user"),
    usersController.createUser
);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: List users in the organization
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Paginated user list
 */
router.get(
    "/",
    requireOrgPermission(P.USERS_READ),
    fieldFilterMiddleware("user"),
    usersController.listUsers
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get a user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 */
router.get(
    "/:id",
    requireOrgPermission(P.USERS_READ),
    fieldFilterMiddleware("user"),
    usersController.getUserById
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   patch:
 *     summary: Update a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               roleId:
 *                 type: string
 *               branchAccess:
 *                 type: array
 *                 items:
 *                   type: string
 *               hasFullBranchAccess:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 */
router.patch(
    "/:id",
    requireOrgPermission(P.USERS_UPDATE),
    // @rls-pbac-prefetch — user routes — findById for PBAC policy evaluation
    policyMiddleware(P.USERS_UPDATE, async (req) => getModel(req.dbConnection, UserDef).findById(req.params.id)),
    fieldWriteGuardMiddleware("user"),
    usersController.updateUser
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Soft-delete a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted
 *       404:
 *         description: User not found
 */
router.delete(
    "/:id",
    requireOrgPermission(P.USERS_DELETE),
    // @rls-pbac-prefetch — user routes — findById for PBAC policy evaluation
    policyMiddleware(P.USERS_DELETE, async (req) => getModel(req.dbConnection, UserDef).findById(req.params.id)),
    usersController.deleteUser
);

// ─── Staff Profile Photo Upload ───────────────────────────────────────────────
// POST /org/users/:id/avatar
// Accepts multipart/form-data with field "photo". Stores in /uploads/staff/.
// Updates user.profileImage with the served URL path.

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload directory exists
const STAFF_UPLOAD_DIR = path.join(__dirname, "../../../uploads/staff");
if (!fs.existsSync(STAFF_UPLOAD_DIR)) {
    fs.mkdirSync(STAFF_UPLOAD_DIR, { recursive: true });
}

const staffPhotoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STAFF_UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
        cb(null, `staff-${req.params.id}-${Date.now()}${ext}`);
    },
});

const staffPhotoUpload = multer({
    storage: staffPhotoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
        }
    },
});

/**
 * POST /api/v1/org/users/:userId/role
 *
 * Assign a role to a user. REST-canonical counterpart of the UI-convenience
 * endpoint POST /api/v1/org/roles/assign. Same controller family, same
 * validator, same service — the only difference is that this route sources
 * `userId` from req.params (unambiguous) while the roles-router variant
 * sources it from req.body.
 *
 * Security: requires BOTH STAFF_MANAGE (role governance) AND USERS_UPDATE
 * (because it mutates User.roleId + User.tokenVersion). Double-gated with
 * RBAC + PBAC per CLAUDE.md §3.
 */
router.post(
    "/:userId/role",
    requireOrgPermission(P.STAFF_MANAGE),
    requireOrgPermission(P.USERS_UPDATE),
    policyMiddleware(P.STAFF_MANAGE),
    policyMiddleware(P.USERS_UPDATE),
    rolesController.assignRoleByUserParam,
);

/**
 * POST /api/v1/org/users/:id/avatar
 * Upload a profile photo for a staff member.
 * Returns { profileImage: "/uploads/staff/staff-<id>-<ts>.jpg" }
 */
router.post(
    "/:id/avatar",
    requireOrgPermission(P.USERS_UPDATE),
    staffPhotoUpload.single("photo"),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: "No photo file provided" });
            }

            const { User } = { User: getModel(req.dbConnection, UserDef) };
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            // Store URL path served by static /uploads
            const profileImage = `/uploads/staff/${req.file.filename}`;
            user.profileImage = profileImage;
            await user.save();

            return res.json({
                success: true,
                data: { profileImage },
                message: "Profile photo uploaded successfully",
            });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;

