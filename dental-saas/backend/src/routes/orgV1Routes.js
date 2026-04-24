/**
 * orgV1Routes.js (v3.0) — Unified Org API namespace
 * Phase B — Runtime Module Engine
 *
 * Mounts all organization-scoped routes under /api/v1/org/.
 *
 * ── Middleware stack applied to ALL routes here ───────────────────────────────
 *  authMiddleware  →  (inside orgProtect)
 *  orgProtect      →  enforces token.type === "org", injects organizationId from JWT
 *  organizationContext → loads org from DB, validates isActive
 *
 * Module-specific routes are mounted via the moduleLoader engine
 * which validates dependencies, gates environment-only modules,
 * and adds requireModule() middleware per route group.
 *
 * ── PROTECTED: Platform routes (/api/v1/platform) are NOT touched here. ─────
 *
 * Phase 22: All routes now have RBAC permission guards.
 * Phase B:  Static module mounts replaced by MODULE_REGISTRY-driven loader.
 */

"use strict";

const express = require("express");
const router = express.Router();

// ─── Core middleware ──────────────────────────────────────────────────────────
const dbContext = require("../middleware/dbContext");
const { authorize } = require("../utils/authorize");
const { P } = require("../rbac/orgPermissions");

// ─── Org-level controllers (not module-specific) ──────────────────────────────
const dashboardController = require("../organization/controllers/dashboardController");
const commandController = require("../organization/controllers/commandController");
const contextController = require("../organization/controllers/contextController");
const brandingController = require("../organization/controllers/orgBrandingController");
const orgSettingsController = require("../organization/controllers/organizationSettingsController");

// ─── OrgRuntime module engine (Phase B) ──────────────────────────────────────
const { loadOrgModules, getLoaderHealth } = require("../orgRuntime/moduleLoader");

// ─── Context Actions controller (new in v2.0) ─────────────────────────────────
const orgRuntimeController = require("../orgRuntime/orgRuntimeController");
const { getRegistryManifest } = require("../platform/featureRegistry");

// ═══════════════════════════════════════════════════════════════════════════════
// Base middleware — already applied by parent (app.js)
// Auth (protect), Branch (branchContext), RLS (rlsContext)
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// Core Infrastructure Routes
// ═══════════════════════════════════════════════════════════════════════════════

// Dashboard Actions (Phase 8: RBAC moved to controller)
router.post("/dashboard/action", dashboardController.handleAction);
router.get("/dashboard/overview", dashboardController.getOverview);

// Command Search (AUTH_ONLY — all org users need search)
router.get("/command/search", commandController.globalSearch);

// Context Management (AUTH_ONLY — branch switching is fundamental)
router.get("/context/branches", contextController.getBranches);
router.post("/context/switch", contextController.switchBranch);

// ─── Context Actions API (v2.0) ───────────────────────────────────────────────
// Returns module-filtered, RBAC-filtered action allowlist for the GlobalActionBar.
// Frontend: OrgGlobalActionBar → useContextActions → GET /org/context/actions?context=X
router.get("/context/actions", orgRuntimeController.getContextActions);

// ─── Org Module Status (platform-visible, org self-read) ─────────────────────
router.get("/context/modules", orgRuntimeController.getEnabledModules);

// ─── Sprint 3: Unified Capability Snapshot ───────────────────────────────────
// Returns req.capabilities (set by unifiedCapabilityMiddleware) to the frontend.
// Powers useOrgCapabilities() hook — single authority for all frontend guards.
// No controller needed — pure data projection. AUTH_ONLY.
router.get("/capabilities", (req, res) => {
    return res.json({ success: true, data: req.capabilities || {} });
});

// ─── Phase C: Roles Listing Route (migrated from app.js /v1/roles) ──────────
// Returns roles scoped to the authenticated user's org.
// Used by UsersPage to populate role dropdowns in create/edit modals.
// orgProtect + organizationContext + dbContext already applied by parent router.use().
// DB_MODE=per-org: Model resolved per-request via getModel(req.dbConnection).
const RoleDef = require("../shared/models/Role");
const getModel = require("../core/db/getModel");
router.get("/roles", async (req, res, next) => {
    try {
        const Role = getModel(req.dbConnection, RoleDef);
        const roles = await Role.find({}) // organizationId auto-injected via secureModel
            .select("name permissions isSystemRole")
            .sort({ isSystemRole: -1, name: 1 })
            .lean();
        return res.json({ success: true, data: { roles } });
    } catch (err) {
        next(err);
    }
});



// ─── Org Settings & Branding (direct routes) ─────────────────────────────────
router.get("/settings/profile",
    brandingController.getOrgProfile);

router.put("/settings/logo",
    brandingController.logoUploadMiddleware,
    brandingController.uploadOrgLogo);

router.patch("/settings/organization",
    orgSettingsController.updateOrgProfileRateLimiter,
    orgSettingsController.updateOrganizationProfile);

// ─── Settings Hub Sub-Router (Phase S2: consolidated mount) ──────────────────
// Mounts billing, support, language, and org settings READ under /org/settings/*
// Previously at /api/v1/settings — now inherits full orgV1 security chain.
const settingsRoutes = require("./settingsRoutes");
router.use("/settings", settingsRoutes);

// ─── Appointments (Phase S2: migrated from v1Router /appointments) ───────────
// All appointment routes now inherit the orgV1 security chain instead of
// running their own orgProtect + organizationContext.
const appointmentRoutes = require("./appointmentRoutes");
router.use("/appointments", appointmentRoutes);

// ─── Recalls (Phase S2: migrated from v1Router /recalls) ─────────────────────
const recallRoutes = require("./recallRoutes");
router.use("/recalls", recallRoutes);

// ─── Families (Phase S2: migrated from v1Router /families) ───────────────────
const familyRoutes = require("./familyRoutes");
router.use("/families", familyRoutes);

// ─── Add-Ons (Phase S2: migrated from v1Router /org/addons) ──────────────────
const addOnRoutes = require("./addOnRoutes");
router.use("/addons", addOnRoutes);

// ─── Org Self-Serve Billing (Phase 22: now RBAC-guarded) ──────────────────────
// orgProtect + organizationContext already applied via router.use() above.
// organizationId is from the verified org JWT — controller MUST NOT read it from body.
const checkoutController = require("../organization/billing/checkout/checkout.controller");

router.post("/billing/checkout-session", checkoutController.createSession);

// Phase 4 — Unified Checkout (provider-agnostic, single pipeline).
// Request: { planVersionId, interval, provider }
// Response: { success, data: { checkoutUrl, provider, contractId, invoiceId } }
router.post("/checkout", checkoutController.createUnified);

// ═══════════════════════════════════════════════════════════════════════════════
// Phase B — Module Runtime Engine
// ═══════════════════════════════════════════════════════════════════════════════
//
// ALL org modules are now loaded via the moduleLoader engine.
// This replaces the previous static mounts for:
//   security, features-control, audit, debug, notifications
// and the registerOrgRoutes() call.
//
// Each module receives requireModule() middleware for access enforcement.
// Self-contained modules (users, branches, procedures, treatments, invoices,
// payments, finance, orthodonticCases) additionally apply their own
// orgProtect + organizationContext + subscriptionGuard internally.
//
// Access is enforced at runtime — mounting is always unconditional.
// ═══════════════════════════════════════════════════════════════════════════════
loadOrgModules(router);

// ─── Phase v9.1 — Support Engine ─────────────────────────────────────────────
// Auth: orgProtect + organizationContext inherited from parent router.use()
// Phase A: RBAC guards added — support.create / support.read
const supportController = require("../shared/controllers/orgSupport.controller");
router.post("/support/ticket", supportController.createTicket);
router.get("/support/tickets", supportController.getOrgTickets);
router.post("/support/ticket/:id/message", supportController.addMessage);

// ─── Orthodontic Tooth Numbering & Missing Detection (v1.0) ───────────────────
// GET /api/v1/org/case/:caseId/teeth
// Returns FDI tooth chart + orthodontic measurements for an orthodontic case.
// Auth: orgProtect + organizationContext applied by parent router.use() above.
// Phase 22: Now RBAC-guarded with orthodontics.read
// ✅ Phase 4 — Controllers moved from orthodonticDomain/ → orthodontics/controllers/
const orthodonticTeethController = require("../modules/orthodontics/controllers/orthodonticTeeth.controller");
router.get("/case/:caseId/teeth", orthodonticTeethController.getTeethChart);

// ─── Orthodontic Landmark Detection (v2.0) ──────────────────────────────────
// GET /api/v1/org/case/:caseId/landmarks
// GET /api/v1/org/case/:caseId/patches
// Stage 3: cusp tips, incisal edges, grooves, contact points + patch metadata.
// Auth: inherited from parent router (orgProtect + organizationContext).
// Phase 22: Now RBAC-guarded with orthodontics.read
// ✅ Phase 4 — Controller moved from orthodonticDomain/ → orthodontics/controllers/
const landmarksController = require("../modules/orthodontics/controllers/landmarks.controller");
router.get("/case/:caseId/landmarks", landmarksController.getLandmarks);
router.get("/case/:caseId/patches", landmarksController.getPatches);

// ═══════════════════════════════════════════════════════════════════════════════
// Phase B — Runtime Diagnostic Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/org/runtime/manifest:
 *   get:
 *     summary: Get the module registry manifest
 *     description: Returns all registered modules with their metadata (no function refs). Used by frontend FeatureGate system.
 *     tags: [OrgRuntime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Module manifest
 */
router.get("/runtime/manifest", (req, res) => {
    return res.json({
        success: true,
        data: {
            modules: getRegistryManifest(),
            organizationId: req.context?.organizationId || req.organizationId,
        },
    });
});

/**
 * @swagger
 * /api/v1/org/runtime/health:
 *   get:
 *     summary: Get module loader health status
 *     description: Returns boot-time diagnostic info about the module loader (mounted/skipped counts, mount paths).
 *     tags: [OrgRuntime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Loader health snapshot
 */
router.get("/runtime/health", async (req, res) => {
    authorize(req, "dashboard.read");
    return res.json({
        success: true,
        data: getLoaderHealth(),
    });
});

// ─── Storage Usage Self-Serve (Phase 9) ──────────────────────────────────────
// GET /api/v1/org/storage-usage
// Returns storage consumption + plan limit for the current organization.
// Auth: orgProtect + organizationContext inherited from parent router.use().
// Phase A: RBAC-guarded with storage.read
const storageUsage = require("@core/storage/storageUsage.service");
const { getStorageLimit } = require("../platform/billing/services/entitlementResolver.service");

/**
 * @swagger
 * /api/v1/org/storage-usage:
 *   get:
 *     summary: Get organization storage usage
 *     description: Returns storage consumption breakdown and plan limit for the authenticated organization.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Storage usage data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalBytes:
 *                       type: number
 *                     totalMB:
 *                       type: number
 *                     totalGB:
 *                       type: number
 *                     totalFiles:
 *                       type: number
 *                     maxStorageMB:
 *                       type: number
 *                     percentUsed:
 *                       type: number
 *                     breakdown:
 *                       type: object
 *                     fileCount:
 *                       type: object
 *                     lastUploadAt:
 *                       type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (missing storage.read)
 */
router.get("/storage-usage", async (req, res) => {
    try {
        authorize(req, "storage.read");
        const organizationId = req.organizationId;

        const [usage, maxStorageMB] = await Promise.all([
            storageUsage.getUsage(organizationId),
            getStorageLimit(organizationId),
        ]);

        // Calculate percentage used (only meaningful when limit is positive)
        let percentUsed = 0;
        if (maxStorageMB > 0) {
            percentUsed = Math.round(((usage.totalMB || 0) / maxStorageMB) * 10000) / 100;
        }

        return res.json({
            success: true,
            data: {
                totalBytes: usage.totalBytes || 0,
                totalMB: usage.totalMB || 0,
                totalGB: usage.totalGB || 0,
                totalFiles: usage.totalFiles || 0,
                maxStorageMB,
                percentUsed,
                breakdown: usage.breakdown || { photos: 0, stl: 0, audio: 0, documents: 0, other: 0 },
                fileCount: usage.fileCount || { photos: 0, stl: 0, audio: 0, documents: 0, other: 0 },
                lastUploadAt: usage.lastUploadAt || null,
            },
        });
    } catch (err) {
        const logger = require("@utils/logger");
        logger.error({ err, orgId: req.organizationId }, "[StorageUsage] Failed to fetch storage usage");
        return res.status(500).json({ success: false, message: "Failed to retrieve storage usage" });
    }
});

// ─── Phase 4.0g: Unified Usage Dashboard API ─────────────────────────────────
// GET /api/v1/org/usage
// Returns usage counters + plan limits for all resource types (users, patients,
// branches, storage). Powers the frontend OrgUsageDashboard component.
// Auth: orgProtect + organizationContext inherited from parent router.use().
const orgUsageService = require("@core/usage/orgUsage.service");

/**
 * @swagger
 * /api/v1/org/usage:
 *   get:
 *     summary: Get unified organization usage dashboard data
 *     description: |
 *       Returns current usage counters and plan limits for all resource types.
 *       Used by the frontend dashboard to display progress bars and limit warnings.
 *       Storage data is sourced from both OrgUsage and StorageUsage for accuracy.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usage dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: object
 *                       properties:
 *                         used: { type: integer, example: 4 }
 *                         limit: { type: integer, nullable: true, example: 5 }
 *                     patients:
 *                       type: object
 *                       properties:
 *                         used: { type: integer, example: 1200 }
 *                         limit: { type: integer, nullable: true }
 *                     branches:
 *                       type: object
 *                       properties:
 *                         used: { type: integer, example: 2 }
 *                         limit: { type: integer, nullable: true, example: 3 }
 *                     storage:
 *                       type: object
 *                       properties:
 *                         usedMB: { type: number, example: 320 }
 *                         limitMB: { type: integer, nullable: true, example: 500 }
 */
router.get("/usage", async (req, res) => {
    try {
        authorize(req, "dashboard.read");
        const organizationId = req.organizationId;
        const capabilities = req.capabilities || {};

        // Fetch usage counters from OrgUsage + accurate storage from StorageUsage
        const [usage, storageData] = await Promise.all([
            orgUsageService.getOrgUsage(organizationId),
            storageUsage.getUsage(organizationId),
        ]);

        // Resolve limits — 0 and -1 are treated as null (unlimited) for the frontend
        const normLimit = (val) => (!val || val <= 0 || val === -1) ? null : val;

        // Storage limit: prefer quotas.storageMB, fallback to limits.maxStorageMB
        const storageLimitMB = normLimit(
            capabilities.quotas?.storageMB ||
            capabilities.limits?.maxStorageMB
        );

        return res.json({
            success: true,
            data: {
                users: {
                    used: usage.usersCount || 0,
                    limit: normLimit(capabilities.limits?.maxUsers),
                },
                patients: {
                    used: usage.patientsCount || 0,
                    limit: normLimit(capabilities.limits?.maxPatients),
                },
                branches: {
                    used: usage.branchesCount || 0,
                    limit: normLimit(capabilities.limits?.maxBranches),
                },
                storage: {
                    usedMB: storageData?.totalMB || 0,
                    limitMB: storageLimitMB,
                },
            },
        });
    } catch (err) {
        const logger = require("@utils/logger");
        logger.error({ err, orgId: req.organizationId }, "[OrgUsage] Failed to fetch usage dashboard");
        return res.status(500).json({ success: false, message: "Failed to retrieve usage data" });
    }
});

module.exports = router;


