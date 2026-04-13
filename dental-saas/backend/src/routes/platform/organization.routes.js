/**
 * Platform Organization Routes
 * Auto-split from platformRoutes.js
 */
const express = require("express");
const router = express.Router();
const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES } = require('@contracts/platformContract.cjs.js');
const CAP = PLATFORM_CAPABILITIES;

const validate = require("../../middleware/validate");
const { provisionOrgSchema } = require("../../validators/organizationValidator");

const {
    getOrganizations,
    updateOrganizationStatus,
    globalSearch
} = require("../../platform/controllers/platformController");

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
    createOrganizationProvisioned,
    archiveOrganization,
    restoreOrganization,
    getOrganizationContracts,
    checkDuplicateOrganizations,
    addContact,
    updateContact,
    deleteContact,
    addCrmNote,
    deleteCrmNote,
    getCrm,
    addCrmTag,
    removeCrmTag,
    addCrmTask,
    updateCrmTask,
} = require("../../platform/controllers/platformOrganizationController");

const platformNotificationController = require("../../controllers/platformNotificationController");
const platformSettingsController = require("../../controllers/platformSettingsController");
const platformFeatureController = require("../../platform/controllers/platformFeatureController");

const supportController = require("../../platform/support/controllers/platformSupport.controller");

const pOrgRead = [platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS)];
const pUpdate = [platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS)];
const pBranch = [platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS)];
const pBillingRead = [platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS)];

const {
    getOrganizationInvoices,
} = require("../../platform/controllers/platformBillingController");

const orgEntitlementController = require("../../platform/billing/controllers/orgEntitlement.controller");



// ─── Global Search ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/search:
 *   get:
 *     summary: Global platform search
 *     description: "Searches across organizations, branches, users, and platform users. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Search]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query string
 *     responses:
 *       200:
 *         description: Search results grouped by entity type
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
 *                     organizations:
 *                       type: array
 *                       items:
 *                         type: object
 *                     branches:
 *                       type: array
 *                       items:
 *                         type: object
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                     platformUsers:
 *                       type: array
 *                       items:
 *                         type: object
 */
// v20.1 Wave3 — Guarded: VIEW_ORGANIZATIONS
router.get("/search", platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS), globalSearch);



// ─── Organizations List + Create ─────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations:
 *   get:
 *     summary: List all organizations
 *     description: "Returns paginated list of organizations. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *     responses:
 *       200:
 *         description: Paginated list of organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                     limit:
 *                       type: integer
 */
router.get("/organizations", ...pOrgRead, getOrganizations);


// ⚠️  ROUTE ORDER IS CRITICAL: /organizations/check-duplicates MUST be declared
// before /organizations/:id, otherwise Express treats "check-duplicates" as an
// ObjectId param and routes to getOrganizationDetails instead.
/**
 * @swagger
 * /api/platform/organizations/check-duplicates:
 *   get:
 *     summary: Check for duplicate organization names before provisioning
 *     description: |
 *       Returns up to 5 existing organizations whose names match the query string,
 *       either by case-insensitive regex or normalizedName equality.
 *       Used to surface a non-blocking warning in the Create Organization modal.
 *       Required capability: VIEW_ORGANIZATIONS.
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Organization name to search for (partial or full)
 *     responses:
 *       200:
 *         description: List of matching organizations (may be empty)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matches:
 *                   type: array
 *                   maxItems: 5
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       country:
 *                         type: string
 *                         description: ISO 3166-1 alpha-2 country code
 *                       status:
 *                         type: string
 *                         enum: [trial, active, suspended, expired, cancelled, unknown]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       isExactMatch:
 *                         type: boolean
 *                         description: True when the normalized names are identical
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient capability
 */
router.get("/organizations/check-duplicates", ...pOrgRead, checkDuplicateOrganizations);


/**
 * @swagger
 * /api/platform/organizations:
 *   post:
 *     summary: Create (provision) a new organization with trial contract
 *     description: |
 *       Creates a new organization with a 14-day trial OrgContract (TDS).
 *       Returns the organization, admin credentials, and trial contract details.
 *       Required capability: MANAGE_ORGANIZATIONS. SuperAdmin only.
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationName, adminEmail, country]
 *             properties:
 *               organizationName:
 *                 type: string
 *               adminEmail:
 *                 type: string
 *                 format: email
 *               country:
 *                 type: string
 *                 description: ISO 3166-1 alpha-2 country code (e.g., EG, SA, AE)
 *               slug:
 *                 type: string
 *               trialDays:
 *                 type: integer
 *                 default: 14
 *     responses:
 *       201:
 *         description: Organization provisioned with active trial contract
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Organization provisioned successfully
 *                 organization:
 *                   type: object
 *                 adminUser:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                 tempPassword:
 *                   type: string
 *                 currentContractId:
 *                   type: string
 *                   description: The activated trial OrgContract._id (mirrors org.currentContractId)
 *                 contractStatus:
 *                   type: string
 *                   enum: [active]
 *                   example: active
 *                 trialEndsAt:
 *                   type: string
 *                   format: date-time
 *                   description: ISO date when the 14-day trial expires
 *       400:
 *         description: Validation error or missing PlanVersion
 *       409:
 *         description: Organization name or slug already in use
 */
router.post("/organizations", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS), validate(provisionOrgSchema), createOrganizationProvisioned); // Phase 34 — canonical endpoint

// POST /create-organization — REMOVED Wave3 (retired legacy duplicate)

// ─── Organization Contracts ───────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/contracts:
 *   get:
 *     summary: Get contract history + invoice history for an organization
 *     description: |
 *       Returns the current active contract, full contract history, and invoice history.
 *       READ-ONLY — all mutations must go through the contract engine.
 *       Required capability: VIEW_ORGANIZATIONS.
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Contract and invoice data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentContract:
 *                   type: object
 *                   nullable: true
 *                   description: The currently active OrgContract (null if no contract)
 *                 contracts:
 *                   type: array
 *                   description: Full contract history (newest first)
 *                 invoices:
 *                   type: array
 *                   description: Full invoice history (newest first)
 *       404:
 *         description: Organization not found
 */
router.get("/organizations/:id/contracts", ...pOrgRead, getOrganizationContracts);

// ─── Organization Entitlements ─────────────────────────────────────────────
// ROUTE ORDER: must be declared BEFORE /organizations/:id to prevent
// Express from treating the literal word "entitlements" as an ObjectId param.
/**
 * @swagger
 * /api/platform/organizations/{id}/entitlements:
 *   get:
 *     summary: Get resolved entitlements for an organization
 *     description: |
 *       Returns the merged entitlement object for the given organization:
 *       plan defaults from the active PlanVersion + any platform-admin overrides.
 *       For trial organizations with no active contract, returns a safe empty object.
 *       Required capability: VIEW_ORGANIZATIONS.
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Resolved entitlement object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: object
 *                       description: Map of module name to enabled boolean
 *                     limits:
 *                       type: object
 *                       description: Numeric limits from the plan (maxUsers, maxBranches)
 *                     addons:
 *                       type: array
 *                       items:
 *                         type: string
 *                     capabilities:
 *                       type: object
 *                       description: Derived boolean capability flags
 *       400:
 *         description: Invalid organization ID format
 *       404:
 *         description: Organization not found
 */
router.get("/organizations/:id/entitlements", ...pOrgRead, (req, res, next) => {
    // Bridge: orgEntitlement controller uses :orgId, org route uses :id
    req.params.orgId = req.params.id;
    return orgEntitlementController.getOrgEntitlement(req, res, next);
});

/**
 * @swagger
 * /api/platform/organizations/{id}:
 *   get:
 *     summary: Get organization detail (full control surface)
 *     description: "Returns the complete organization detail including identity, commercial context (from OrgContract), subscription health, and runtime usage counts. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Full organization detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 slug:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *                 isArchived:
 *                   type: boolean
 *                 planId:
 *                   type: string
 *                 version:
 *                   type: integer
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 subscription:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [active, trial, suspended, cancelled, expired]
 *                     trialEndsAt:
 *                       type: string
 *                     autoRenew:
 *                       type: boolean
 *                     paymentProvider:
 *                       type: string
 *                 commercial:
 *                   type: object
 *                   description: Resolved from OrgContract (Sprint 4 dual-read)
 *                   properties:
 *                     planCode:
 *                       type: string
 *                     planVersionTag:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     lockedPrice:
 *                       type: number
 *                     autoRenew:
 *                       type: boolean
 *                     _source:
 *                       type: string
 *                       enum: [contract, subscription_fallback]
 *                     _contractId:
 *                       type: string
 *                 branchCount:
 *                   type: integer
 *                 userCount:
 *                   type: integer
 *                 activeUsers:
 *                   type: integer
 *                 suspendedUsers:
 *                   type: integer
 *                 auditCount:
 *                   type: integer
 *                 subscriptionHealth:
 *                   type: object
 *                 serverNow:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Organization not found
 *       403:
 *         description: Insufficient capability
 */
router.get("/organizations/:id", ...pOrgRead, getOrganizationDetails);



/**
 * @swagger
 * /api/platform/organizations/{id}/analytics:
 *   get:
 *     summary: Get organization analytics
 *     description: "Returns analytics for a specific organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalBranches:
 *                   type: integer
 *                 totalUsers:
 *                   type: integer
 *                 activeUsers:
 *                   type: integer
 *                 suspendedUsers:
 *                   type: integer
 *                 auditEventsCount:
 *                   type: integer
 *                 totalPatients:
 *                   type: integer
 *                 totalAppointments:
 *                   type: integer
 *                 appointmentsThisMonth:
 *                   type: integer
 *                 patientsThisMonth:
 *                   type: integer
 *                 appointmentsByBranch:
 *                   type: array
 *                   items:
 *                     type: object
 *                 subscription:
 *                   type: object
 *                 trialRemainingDays:
 *                   type: integer
 *                 activeBranches:
 *                   type: integer
 *                 archivedBranches:
 *                   type: integer
 */
router.get("/organizations/:id/analytics", ...pOrgRead, getOrganizationAnalytics);


/**
 * @swagger
 * /api/platform/organizations/{id}/status:
 *   patch:
 *     summary: Update organization status
 *     description: "Updates organization active/inactive status. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated organization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 organization:
 *                   type: object
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 subscription:
 *                   type: object
 *                 isActive:
 *                   type: boolean
 */
router.patch("/organizations/:id/status", platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS), updateOrganizationStatus);


/**
 * @swagger
 * /api/platform/organizations/{id}/modules:
 *   patch:
 *     summary: Update organization modules (deprecated)
 *     description: "Updates organization modules. Deprecated — use PATCH /organizations/{id}/configuration. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated modules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 modules:
 *                   type: object
 *     deprecated: true
 */
router.patch("/organizations/:id/modules", ...pUpdate, updateOrganizationModules); // @deprecated — use /configuration


/**
 * @swagger
 * /api/platform/organizations/{id}/archive:
 *   patch:
 *     summary: Archive organization
 *     description: "Soft-deletes an organization by setting isArchived flag. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Archived organization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isArchived:
 *                   type: boolean
 *                 archivedAt:
 *                   type: string
 *                   format: date-time
 */
// v19.3 Soft Delete / Archive
router.patch("/organizations/:id/archive", ...pUpdate, archiveOrganization);


/**
 * @swagger
 * /api/platform/organizations/{id}/restore:
 *   patch:
 *     summary: Restore archived organization
 *     description: "Restores a previously archived organization. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Restored organization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isArchived:
 *                   type: boolean
 */
router.patch("/organizations/:id/restore", ...pUpdate, restoreOrganization);


// ─── Organisation Contacts (multi) ───────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/contacts:
 *   post:
 *     summary: Add a contact to the organization
 *     description: "Appends a new contact (role, name, phone) to the contacts array. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [owner, it, finance, operations, sales, other]
 *               ownerName:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated contacts array
 *       400:
 *         description: Validation error
 *       404:
 *         description: Organization not found
 */
router.post("/organizations/:id/contacts", ...pUpdate, addContact);

/**
 * @swagger
 * /api/platform/organizations/{id}/contacts/{contactId}:
 *   patch:
 *     summary: Update a specific contact
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *               ownerName:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated contacts array
 *       404:
 *         description: Organization or contact not found
 *   delete:
 *     summary: Delete a specific contact
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contact deleted
 */
router.patch("/organizations/:id/contacts/:contactId", ...pUpdate, updateContact);
router.delete("/organizations/:id/contacts/:contactId", ...pUpdate, deleteContact);


// ─── Organization CRM ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/crm:
 *   get:
 *     summary: Get organization CRM data (notes, tags, tasks)
 *     description: "Returns the full CRM payload for an organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform CRM]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CRM data
 */
router.get("/organizations/:id/crm", ...pOrgRead, getCrm);

/**
 * @swagger
 * /api/platform/organizations/{id}/crm/notes:
 *   post:
 *     summary: Add a CRM note
 *     tags: [Platform CRM]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated CRM notes
 */
router.post("/organizations/:id/crm/notes", ...pUpdate, addCrmNote);

/**
 * @swagger
 * /api/platform/organizations/{id}/crm/notes/{noteId}:
 *   delete:
 *     summary: Delete a CRM note
 *     tags: [Platform CRM]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Note deleted
 */
router.delete("/organizations/:id/crm/notes/:noteId", ...pUpdate, deleteCrmNote);

/**
 * @swagger
 * /api/platform/organizations/{id}/crm/tags:
 *   post:
 *     summary: Add a CRM tag
 *     tags: [Platform CRM]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tag]
 *             properties:
 *               tag:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated tags
 */
router.post("/organizations/:id/crm/tags", ...pUpdate, addCrmTag);

/**
 * @swagger
 * /api/platform/organizations/{id}/crm/tags/{tag}:
 *   delete:
 *     summary: Remove a CRM tag
 *     tags: [Platform CRM]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tag removed
 */
router.delete("/organizations/:id/crm/tags/:tag", ...pUpdate, removeCrmTag);

/**
 * @swagger
 * /api/platform/organizations/{id}/crm/tasks:
 *   post:
 *     summary: Add a CRM task
 *     tags: [Platform CRM]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Task added
 */
router.post("/organizations/:id/crm/tasks", ...pUpdate, addCrmTask);

/**
 * @swagger
 * /api/platform/organizations/{id}/crm/tasks/{taskId}:
 *   patch:
 *     summary: Update a CRM task (status, title, dueDate)
 *     tags: [Platform CRM]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, done]
 *               title:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Task updated
 */
router.patch("/organizations/:id/crm/tasks/:taskId", ...pUpdate, updateCrmTask);


// ─── Organization Configuration ───────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/configuration:
 *   get:
 *     summary: Get organization configuration
 *     description: "Returns organization modules and settings. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 modules:
 *                   type: object
 *                 organizationSettings:
 *                   type: object
 */
router.get("/organizations/:id/configuration", ...pOrgRead, getOrganizationConfiguration);


/**
 * @swagger
 * /api/platform/organizations/{id}/configuration:
 *   patch:
 *     summary: Update organization configuration
 *     description: "Updates organization modules and settings. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 modules:
 *                   type: object
 *                 organizationSettings:
 *                   type: object
 */
router.patch("/organizations/:id/configuration", ...pUpdate, updateOrganizationConfiguration);


// ─── Organization Users ───────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/users:
 *   get:
 *     summary: List organization users
 *     description: "Returns users belonging to an organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization users list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/organizations/:id/users", ...pOrgRead, getOrganizationUsers);


/**
 * @swagger
 * /api/platform/organizations/{id}/users/{userId}:
 *   get:
 *     summary: Get organization user details
 *     description: "Returns details of a specific user within an organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details with audit context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                 organization:
 *                   type: object
 *                 auditLogs:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get("/organizations/:id/users/:userId", ...pOrgRead, getOrganizationUserDetails);


/**
 * @swagger
 * /api/platform/organizations/{id}/users/{userId}:
 *   patch:
 *     summary: Update organization user
 *     description: "Updates a user within an organization. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 */
router.patch("/organizations/:id/users/:userId", ...pUpdate, updateOrganizationUser);


// ─── Organization Branches ────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/branches:
 *   get:
 *     summary: List organization branches
 *     description: "Returns all branches of an organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of branch objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/organizations/:id/branches", ...pOrgRead, getOrganizationBranches);


/**
 * @swagger
 * /api/platform/organizations/{id}/branches:
 *   post:
 *     summary: Create organization branch
 *     description: "Creates a new branch for an organization. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created branch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 branch:
 *                   type: object
 */
router.post("/organizations/:id/branches", ...pBranch, createBranch);


/**
 * @swagger
 * /api/platform/organizations/{id}/branches/{branchId}:
 *   patch:
 *     summary: Update branch
 *     description: "Updates branch details. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated branch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 branch:
 *                   type: object
 */
router.patch("/organizations/:id/branches/:branchId", ...pBranch, updateBranch);


/**
 * @swagger
 * /api/platform/organizations/{id}/branches/{branchId}/status:
 *   patch:
 *     summary: Update branch status
 *     description: "Activates or deactivates a branch. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated branch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 branch:
 *                   type: object
 */
router.patch("/organizations/:id/branches/:branchId/status", ...pBranch, updateBranchStatus);


// ─── Organization Audit Logs ──────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/audit-logs:
 *   get:
 *     summary: Get organization audit logs
 *     description: "Returns audit logs for a specific organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/organizations/:id/audit-logs", ...pOrgRead, getOrganizationAuditLogs);


// ─── Enterprise Billing Ledger ──────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/invoices:
 *   get:
 *     summary: List organization invoices
 *     description: "Returns invoices for an organization. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Billing]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of invoice objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/organizations/:id/invoices", ...pBillingRead, getOrganizationInvoices);


// ─── Branch Analytics ─────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/branches/{branchId}/analytics:
 *   get:
 *     summary: Get branch analytics
 *     description: "Returns analytics for a specific branch. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *                 activeUsers:
 *                   type: integer
 *                 suspendedUsers:
 *                   type: integer
 *                 auditEventsCount:
 *                   type: integer
 *                 totalPatients:
 *                   type: integer
 *                 totalAppointments:
 *                   type: integer
 *                 appointmentsThisMonth:
 *                   type: integer
 *                 branchName:
 *                   type: string
 *                 branchStatus:
 *                   type: string
 */
router.get("/organizations/:id/branches/:branchId/analytics", ...pOrgRead, getBranchAnalytics);


// ─── Branch Details + Configuration ──────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/branches/{branchId}:
 *   get:
 *     summary: Get branch details
 *     description: "Returns detailed info about a specific branch. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 type:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *                 address:
 *                   type: string
 *                 phone:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 userCount:
 *                   type: integer
 *                 auditCount:
 *                   type: integer
 *                 effectiveWorkingHours:
 *                   type: object
 */
router.get("/organizations/:id/branches/:branchId", ...pOrgRead, getBranchDetails);


/**
 * @swagger
 * /api/platform/organizations/{id}/branches/{branchId}/configuration:
 *   get:
 *     summary: Get branch configuration
 *     description: "Returns branch working hours and configuration. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workingHoursOverride:
 *                   type: object
 *                 effectiveWorkingHours:
 *                   type: object
 *                 isActive:
 *                   type: boolean
 */
router.get("/organizations/:id/branches/:branchId/configuration", ...pOrgRead, getBranchConfiguration);


/**
 * @swagger
 * /api/platform/organizations/{id}/branches/{branchId}/configuration:
 *   patch:
 *     summary: Update branch configuration
 *     description: "Updates branch working hours and configuration. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Organizations]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated branch configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 workingHoursOverride:
 *                   type: object
 *                 effectiveWorkingHours:
 *                   type: object
 *                 isActive:
 *                   type: boolean
 */
router.patch("/organizations/:id/branches/:branchId/configuration", ...pUpdate, updateBranchConfiguration);


// ─── Platform Notifications ───────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/notifications:
 *   get:
 *     summary: Get platform notifications
 *     description: Returns notifications for the authenticated platform user. AUTH_ONLY.
 *     tags: [Platform Notifications]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Array of notification objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/notifications", platformProtect, platformNotificationController.getNotifications);


/**
 * @swagger
 * /api/platform/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     description: Marks all notifications as read for the authenticated user. AUTH_ONLY.
 *     tags: [Platform Notifications]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch("/notifications/read-all", platformProtect, platformNotificationController.markAllRead);


/**
 * @swagger
 * /api/platform/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     description: Marks a specific notification as read. AUTH_ONLY.
 *     tags: [Platform Notifications]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.patch("/notifications/:id/read", platformProtect, platformNotificationController.markAsRead);


// ─── Platform Global Settings ─────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/settings:
 *   get:
 *     summary: Get platform settings
 *     description: Returns global platform settings. AUTH_ONLY.
 *     tags: [Platform Settings]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Platform settings object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get("/settings", platformProtect, platformSettingsController.getSettings);


/**
 * @swagger
 * /api/platform/settings:
 *   put:
 *     summary: Update platform settings
 *     description: "Updates global platform settings. Required capability: MANAGE_PLATFORM_SETTINGS. SuperAdmin only."
 *     tags: [Platform Settings]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Updated settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
// v20.1 Wave3 — MANAGE_PLATFORM_SETTINGS guards settings mutation
router.put("/settings", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_SETTINGS), platformSettingsController.updateSettings);


// ─── Platform Features (Phase 33) ─────────────────────────────────────────
/**
 * @swagger
 * /api/platform/features:
 *   get:
 *     summary: List all features
 *     description: Returns all platform feature definitions. AUTH_ONLY.
 *     tags: [Platform Features]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Array of feature objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/features", platformProtect, platformFeatureController.getAllFeatures);


/**
 * @swagger
 * /api/platform/features:
 *   post:
 *     summary: Create feature
 *     description: "Creates a new feature definition. Required capability: MANAGE_PLATFORM_USERS. SuperAdmin only."
 *     tags: [Platform Features]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, name]
 *             properties:
 *               key:
 *                 type: string
 *               name:
 *                 type: string
 *               defaultEnabled:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Created feature
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post("/features", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), platformFeatureController.createFeature);


/**
 * @swagger
 * /api/platform/features/{id}:
 *   put:
 *     summary: Update feature
 *     description: "Updates a feature definition. Required capability: MANAGE_PLATFORM_USERS. SuperAdmin only."
 *     tags: [Platform Features]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated feature
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.put("/features/:id", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), platformFeatureController.updateFeature);


/**
 * @swagger
 * /api/platform/org/{orgId}/feature/{key}:
 *   patch:
 *     summary: Override organization feature
 *     description: "Overrides a feature flag for a specific organization. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Features]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Feature override applied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 features:
 *                   type: object
 */
router.patch("/org/:orgId/feature/:key", platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS), platformFeatureController.overrideOrganizationFeature);


// PATCH /organizations/:orgId/plan REMOVED (migration Phase 1)
// Legacy assign-plan route used Plan.model + org.planId (both removed).
// Plan assignment is now via POST /api/platform/contracts (planVersionId authoritative).


/**
 * @swagger
 * /api/platform/support/tickets:
 *   get:
 *     summary: List support tickets
 *     description: "Returns all platform support tickets. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Support]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Array of ticket objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/support/tickets", platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS), supportController.getPlatformTickets);


/**
 * @swagger
 * /api/platform/support/ticket/{id}/forensic:
 *   get:
 *     summary: Get ticket forensic context
 *     description: "Returns detailed forensic context for a support ticket. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Support]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Forensic context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get("/support/ticket/:id/forensic", platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS), supportController.getForensicContext);


/**
 * @swagger
 * /api/platform/support/ticket/{id}/assign:
 *   patch:
 *     summary: Assign support ticket
 *     description: "Assigns a support ticket to a platform user. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Support]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
// v20.1 Wave3 — MANAGE_ORGANIZATIONS guards mutation (assign = management action)
router.patch("/support/ticket/:id/assign", platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS), supportController.assignTicket);


/**
 * @swagger
 * /api/platform/support/ticket/{id}/approve-refund:
 *   post:
 *     summary: Approve refund for ticket
 *     description: "Approves a refund associated with a support ticket. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Support]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post("/support/ticket/:id/approve-refund", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), supportController.approveRefund);


/**
 * @swagger
 * /api/platform/support/ticket/{id}/message:
 *   post:
 *     summary: Add message to ticket
 *     description: "Adds a message to a support ticket. Required capability: MANAGE_ORGANIZATIONS."
 *     tags: [Platform Support]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post("/support/ticket/:id/message", platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS), supportController.addMessage);

module.exports = router;
