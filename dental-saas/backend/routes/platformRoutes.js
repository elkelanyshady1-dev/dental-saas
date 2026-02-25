const express = require("express");
const router = express.Router();
const platformProtect = require("../middleware/platformProtect");
const superAdminOnly = require("../middleware/superAdminOnly");
const authorizePlatformPermission = require("../middleware/authorizePlatformPermission");
const { getAuditLogs } = require("../controllers/platformAuditController");

const {
    getOrganizations,
    createOrganization,
    updateOrganizationStatus,
    updateOrganizationPlan,
    globalSearch
} = require("../controllers/platformController");

const { getPlatformAnalytics, getLatestEvents } = require("../controllers/platformAnalyticsController");

const {
    getPlatformRevenueAnalytics,
    getOrganizationDetails,
    getOrganizationAnalytics,
    getOrganizationUsers,
    updateOrganizationUser,
    getOrganizationUserDetails,
    getOrganizationBranches,
    createBranch,
    updateBranch,
    updateBranchStatus,
    getOrganizationAuditLogs,
    updateOrganizationModules,
    getBranchAnalytics,
    getOrganizationConfiguration,
    updateOrganizationConfiguration,
    getBranchDetails,
    getBranchConfiguration,
    updateBranchConfiguration,
    createOrganizationProvisioned
} = require("../controllers/platformOrganizationController");

const {
    upgradeOrganizationPlan,
    extendSubscription,
    suspendOrganization,
    reactivateOrganization,
    getSubscriptionHistory,
    previewProration,
    changeOrganizationPlan,
    schedulePlanChange,
    cancelScheduledPlanChange
} = require("../controllers/platformSubscriptionController");

const {
    getOrganizationInvoices,
    getInvoiceDetails,
    updateInvoiceStatus,
    getEmailLogs,
} = require("../controllers/platformBillingController");

const platformNotificationController = require("../controllers/platformNotificationController");
const platformSettingsController = require("../controllers/platformSettingsController");
const platformUserController = require("../controllers/platformUserController");
const {
    platformLogin,
    verify2FA,
    setup2FA,
    complete2FASetup,
    disable2FA
} = require("../controllers/platformAuthController");

const validate = require("../middleware/validate");
const { provisionOrgSchema } = require("../validators/organizationValidator");

const pOrgRead = [platformProtect, authorizePlatformPermission("platform.analytics.organizations")];
const pUpdate = [platformProtect, authorizePlatformPermission("organizations.update")];
const pBranch = [platformProtect, authorizePlatformPermission("branches.manage")];
const pSub = [platformProtect, authorizePlatformPermission("subscriptions.manage")];
const pRev = [platformProtect, authorizePlatformPermission("platform.analytics.revenue")];
const pBillingRead = [platformProtect, authorizePlatformPermission("platform.billing.read")];
const pBillingUpdate = [platformProtect, authorizePlatformPermission("platform.billing.update")];


// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get("/dashboard", platformProtect, (req, res) => {
    res.json({
        message: "Platform dashboard",
        user: {
            id: req.platformUser._id,
            name: req.platformUser.name,
            email: req.platformUser.email,
            role: req.platformUser.role,
            permissions: req.platformUser.permissions
        }
    });
});

// ─── Global Search ───────────────────────────────────────────────────────────
router.get("/search", platformProtect, globalSearch);

// ─── Platform Analytics ───────────────────────────────────────────────────
router.get("/analytics", platformProtect, authorizePlatformPermission("analytics.read"), getPlatformAnalytics);
router.get("/analytics/events", platformProtect, authorizePlatformPermission("analytics.read"), getLatestEvents);

// ─── Platform Audit Logs ──────────────────────────────────────────────────
router.get("/audit-logs", platformProtect, superAdminOnly, authorizePlatformPermission("auditLogs.read"), getAuditLogs);

// ─── Platform Analytics ───────────────────────────────────────────────────
router.get("/analytics/revenue", ...pRev, getPlatformRevenueAnalytics);

// ─── Organizations List + Create ─────────────────────────────────────────
router.get("/organizations", ...pOrgRead, getOrganizations);
router.post("/organizations", platformProtect, superAdminOnly, authorizePlatformPermission("organizations.create"), validate(provisionOrgSchema), createOrganizationProvisioned); // Phase 34
router.post("/create-organization", platformProtect, superAdminOnly, authorizePlatformPermission("organizations.create"), createOrganization); // Legacy

// ─── Organization Detail ──────────────────────────────────────────────────
router.get("/organizations/:id", ...pOrgRead, getOrganizationDetails);
router.get("/organizations/:id/analytics", ...pOrgRead, getOrganizationAnalytics);
router.patch("/organizations/:id/status", platformProtect, authorizePlatformPermission("organizations.suspend"), updateOrganizationStatus);
router.patch("/organizations/:id/plan", ...pUpdate, updateOrganizationPlan);
router.patch("/organizations/:id/modules", ...pUpdate, updateOrganizationModules); // @deprecated — use /configuration

// ─── Organization Configuration ───────────────────────────────────────────
router.get("/organizations/:id/configuration", ...pOrgRead, getOrganizationConfiguration);
router.patch("/organizations/:id/configuration", ...pUpdate, updateOrganizationConfiguration);

// ─── Organization Users ───────────────────────────────────────────────────
router.get("/organizations/:id/users", ...pOrgRead, getOrganizationUsers);
router.get("/organizations/:id/users/:userId", ...pOrgRead, getOrganizationUserDetails);
router.patch("/organizations/:id/users/:userId", ...pUpdate, updateOrganizationUser);

// ─── Organization Branches ────────────────────────────────────────────────
router.get("/organizations/:id/branches", ...pOrgRead, getOrganizationBranches);
router.post("/organizations/:id/branches", ...pBranch, createBranch);
router.patch("/organizations/:id/branches/:branchId", ...pBranch, updateBranch);
router.patch("/organizations/:id/branches/:branchId/status", ...pBranch, updateBranchStatus);

// ─── Organization Audit Logs ──────────────────────────────────────────────
router.get("/organizations/:id/audit-logs", ...pOrgRead, getOrganizationAuditLogs);

// ─── Subscription Lifecycle ───────────────────────────────────────────────
router.patch("/organizations/:id/upgrade", platformProtect, superAdminOnly, authorizePlatformPermission("subscriptions.manage"), upgradeOrganizationPlan);
router.patch("/organizations/:id/extend", platformProtect, superAdminOnly, authorizePlatformPermission("subscriptions.manage"), extendSubscription);
router.patch("/organizations/:id/suspend", platformProtect, superAdminOnly, authorizePlatformPermission("subscriptions.manage"), suspendOrganization);
router.patch("/organizations/:id/reactivate", platformProtect, superAdminOnly, authorizePlatformPermission("subscriptions.manage"), reactivateOrganization);
router.get("/organizations/:id/subscription/history", ...pOrgRead, getSubscriptionHistory);

// ─── Enterprise Proration (Mid-Cycle) ──────────────────────────────────────
router.get("/organizations/:id/proration-preview", ...pBillingUpdate, previewProration);
router.patch("/organizations/:id/change-plan", ...pBillingUpdate, changeOrganizationPlan);

// ─── Enterprise Plan Scheduling (Next Cycle) ──────────────────────────────
router.post("/organizations/:id/schedule-plan-change", ...pBillingUpdate, schedulePlanChange);
router.delete("/organizations/:id/schedule-plan-change", ...pBillingUpdate, cancelScheduledPlanChange);

// ─── Enterprise Billing Ledger ──────────────────────────────────────────────
router.get("/organizations/:id/invoices", ...pBillingRead, getOrganizationInvoices);
router.get("/organizations/:id/email-logs", ...pBillingRead, getEmailLogs);
router.get("/invoices/:invoiceId", ...pBillingRead, getInvoiceDetails);
router.patch("/invoices/:invoiceId/status", ...pBillingUpdate, updateInvoiceStatus);

// ─── Branch Analytics ─────────────────────────────────────────────────────
router.get("/organizations/:id/branches/:branchId/analytics", ...pOrgRead, getBranchAnalytics);

// ─── Branch Details + Configuration ──────────────────────────────────────────
router.get("/organizations/:id/branches/:branchId", ...pOrgRead, getBranchDetails);
router.get("/organizations/:id/branches/:branchId/configuration", ...pOrgRead, getBranchConfiguration);
router.patch("/organizations/:id/branches/:branchId/configuration", ...pUpdate, updateBranchConfiguration);

// ─── Platform Notifications ───────────────────────────────────────────────
router.get("/notifications", platformProtect, platformNotificationController.getNotifications);
router.patch("/notifications/read-all", platformProtect, platformNotificationController.markAllRead);
router.patch("/notifications/:id/read", platformProtect, platformNotificationController.markAsRead);

// ─── Platform Global Settings ─────────────────────────────────────────────
router.get("/settings", platformProtect, platformSettingsController.getSettings);
router.put("/settings", platformProtect, superAdminOnly, authorizePlatformPermission("platform.settings.manage"), platformSettingsController.updateSettings);

// ─── Platform User Profile (Me) ───────────────────────────────────────────
router.get("/me", platformProtect, platformUserController.getMe);
router.put("/me", platformProtect, platformUserController.updateMe);
router.put("/change-password", platformProtect, platformUserController.changePassword);
router.patch("/users/:userId/manage-credentials", platformProtect, platformUserController.manageCredentials);

// 🔒 v1.3.5 - 2FA Management
router.post("/2fa/setup", platformProtect, setup2FA);
router.post("/2fa/complete-setup", platformProtect, complete2FASetup);
router.post("/2fa/disable", platformProtect, disable2FA);

// ─── Platform Features (Phase 33) ─────────────────────────────────────────
router.get("/features", platformProtect, platformFeatureController.getAllFeatures);
router.post("/features", platformProtect, superAdminOnly, authorizePlatformPermission("platform.settings.manage"), platformFeatureController.createFeature);
router.put("/features/:id", platformProtect, superAdminOnly, authorizePlatformPermission("platform.settings.manage"), platformFeatureController.updateFeature);
router.patch("/org/:orgId/feature/:key", platformProtect, authorizePlatformPermission("organizations.update"), platformFeatureController.overrideOrganizationFeature);

module.exports = router;
