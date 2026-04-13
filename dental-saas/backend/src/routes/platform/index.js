/**
 * Platform Routes — Index
 *
 * Combines all platform domain route modules into a single router.
 * Mounted at /api/platform in app.js.
 *
 * Split from the original monolithic platformRoutes.js for maintainability.
 */
const express = require("express");
const router = express.Router();

// Import domain route modules
const authRoutes = require("./auth.routes");
const organizationRoutes = require("./organization.routes");
const billingRoutes = require("./billing.routes");
const analyticsRoutes = require("./analytics.routes");
const governanceRoutes = require("./governance.routes");
const userRoutes = require("./user.routes");
const contractRoutes = require("./contracts.routes"); // Sprint 2 — Contract Engine
const guardianRoutes = require("../../platform/guardian/guardian.routes"); // Guardian Layer
const searchNotifRoutes = require("./search-notifications.routes"); // Search + Notifications
const auditRoutes = require("./audit.routes");         // v21.0 — Audit Trail Explorer
const communicationRoutes = require("./communication.routes"); // v3.1 — Communication Center
const monitoringRoutes = require("./monitoring.routes");    // v4.0 — Monitoring Dashboard
const featureRegistryRoutes = require("../../platform/domain/routes/featureRegistry.routes"); // Phase 12.1 — Feature Registry

// Mount all sub-routers (no prefix — paths are absolute within /api/platform)
router.use(authRoutes);
router.use(organizationRoutes);
router.use(billingRoutes);
router.use(analyticsRoutes);
router.use(governanceRoutes);
router.use(userRoutes);
router.use(contractRoutes);           // Sprint 2 — Contract Engine
router.use(guardianRoutes);           // Platform Guardian Layer
router.use(searchNotifRoutes);        // Unified Search + Notifications
router.use(auditRoutes);              // v21.0 — Audit Trail Explorer
router.use("/communication", communicationRoutes); // v3.1 — Communication Center
router.use("/monitoring", monitoringRoutes);    // v4.0 — Monitoring Dashboard
router.use(featureRegistryRoutes);    // Phase 12.1 — Feature Registry Admin

// ─── Enterprise chain verification ───────────────────────────────────────────
const { isEnterprise } = require("../../config/platformMode");
const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");
const { getAuditLogs, verifyChain } = require("../../platform/controllers/platformAuditController");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES: CAP } = require('@contracts/platformContract.cjs.js');

// Audit logs (kept in index since cross-domain)
/**
 * @swagger
 * /api/platform/audit-logs:
 *   get:
 *     summary: Get platform audit logs
 *     description: Returns paginated audit logs. Requires VIEW_AUDIT_LOGS capability.
 *     tags: [Platform Audit]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Audit log list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 */
router.get("/audit-logs", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.VIEW_AUDIT_LOGS), getAuditLogs);
if (isEnterprise()) {
    /**
     * @swagger
     * /api/platform/audit/verify-chain:
     *   get:
     *     summary: Verify audit chain integrity
     *     description: Enterprise-only. Verifies the tamper-proof audit chain. Superadmin only.
     *     tags: [Platform Audit]
     *     security:
     *       - platformToken: []
     *     responses:
     *       200:
     *         description: Chain verification result
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 valid:
     *                   type: boolean
     *                 chainLength:
     *                   type: integer
     */
    router.get("/audit/verify-chain", platformProtect, superAdminOnly, verifyChain);
}

// Feature flag stream (conditional)
if (process.env.SSE_FEATURE_FLAGS === "true") {
    const { streamFeatureFlags } = require("../../controllers/platformFlagStreamController");
    /**
     * @swagger
     * /api/platform/feature-flags/stream:
     *   get:
     *     summary: Stream feature flag updates
     *     description: SSE endpoint for real-time feature flag changes. AUTH_ONLY.
     *     tags: [Platform Metadata]
     *     security:
     *       - platformToken: []
     *     responses:
     *       200:
     *         description: SSE event stream
     *         content:
     *           text/event-stream:
     *             schema:
     *               type: string
     */
    router.get("/feature-flags/stream", platformProtect, streamFeatureFlags);
}

// v12.0 Structural Safety Guard
router.stack.forEach((layer) => {
    if (layer.route) {
        layer.route.stack.forEach((slot) => {
            if (typeof slot.handle !== "function") {
                console.error(`[PlatformRoutes] CRITICAL: Invalid handler for ${layer.route.path}`);
                throw new Error(`Route handler for ${layer.route.path} is not a function (${typeof slot.handle})`);
            }
        });
    }
});

// v19.2 Route Integrity Governance
const platformRouteManifest = require("../../integrity/platformRouteManifest");
const { generateRouteChecksum } = require("../../integrity/routeChecksum");
const STRICT_ROUTES = process.env.ROUTE_INTEGRITY_STRICT === "true";

const registeredRoutes = [];
router.stack.forEach((layer) => {
    if (layer.route) {
        const methods = Object.keys(layer.route.methods);
        methods.forEach((method) => {
            registeredRoutes.push({ method: method.toUpperCase(), path: layer.route.path });
        });
    }
    // Also check nested routers
    if (layer.name === "router" && layer.handle && layer.handle.stack) {
        layer.handle.stack.forEach((subLayer) => {
            if (subLayer.route) {
                const methods = Object.keys(subLayer.route.methods);
                methods.forEach((method) => {
                    registeredRoutes.push({ method: method.toUpperCase(), path: subLayer.route.path });
                });
            }
        });
    }
});

let manifestPassed = true;
platformRouteManifest.forEach(({ method, path }) => {
    const found = registeredRoutes.some(r => r.method === method && r.path === path);
    if (!found) {
        manifestPassed = false;
        const msg = `[RouteIntegrity] MISSING required route: ${method} ${path}`;
        if (STRICT_ROUTES) {
            throw new Error(msg);
        } else {
            console.error(msg);
        }
    }
});

if (manifestPassed) {
    console.log("[PLATFORM_ROUTE_INTEGRITY] PASS — all manifest routes registered");
}

const routeChecksum = generateRouteChecksum(registeredRoutes);
console.log(`[PLATFORM_ROUTE_CHECKSUM] ${routeChecksum}`);

if (process.env.ROUTE_CHECKSUM_EXPECTED) {
    if (routeChecksum !== process.env.ROUTE_CHECKSUM_EXPECTED) {
        const msg = `[RouteIntegrity] CHECKSUM MISMATCH — expected ${process.env.ROUTE_CHECKSUM_EXPECTED}, got ${routeChecksum}`;
        if (STRICT_ROUTES) {
            throw new Error(msg);
        } else {
            console.error(msg);
        }
    } else {
        console.log("[PLATFORM_ROUTE_CHECKSUM] VERIFIED — topology matches expected.");
    }
}

module.exports = router;
