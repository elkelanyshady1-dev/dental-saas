const organizationService = require("../../shared/services/OrganizationService");
const asyncHandler = require("@utils/asyncHandler");
const Organization = require("@shared/models/Organization").default;
const OrgContractModel = require("../../platform/billing/models/OrgContract.model").default;

// ─── Per-Org DB Model Resolution (DB_MODE = per-org) ──────────────────────────
// In per-org mode, Branch/User/AuditLog live in dental_org_<orgId>, not the
// platform DB. Platform controllers must resolve models via getModel() on the
// org's connection to read org-scoped entities.
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const BranchDef = require("@shared/models/Branch");
const UserDef = require("@shared/models/User");
const AuditLogDef = require("@shared/models/AuditLog");
const PatientDef = require("@shared/models/Patient");
const AppointmentDef = require("@shared/models/Appointment");

const { assertBranchLimit } = require("@core/subscription/planEnforcement");
const { resolveOrganizationEntitlements } = require("../../platform/billing/services/entitlementResolver.service");
const orgUsageService = require("@core/usage/orgUsage.service");
const revenueIntelligenceService = require("../../services/revenueIntelligenceService");
const computeSubscriptionHealth = require("../../utils/subscriptionHealth");
// Sprint 4: Commercial fields now read via contractResolver (OrgContract is source of truth)
const { resolveCommercialContext } = require("../../platform/billing/services/contractResolver.service");

// ─── Guardian Layer (v2.0) ────────────────────────────────────────────────────
const { wrappedProvisionOrganization } = require("../guardian/provisioning.guardian");

/**
 * getOrgModels — Resolves org-scoped Mongoose models on the per-org DB connection.
 *
 * In per-org mode, Branch/User/AuditLog are in dental_org_<orgId>.
 * This helper creates a connection via dbManager and returns bound models.
 * Callers MUST call releaseConn() when done (or use try/finally).
 *
 * @param {string} orgId
 * @returns {{ Branch, User, AuditLog, Patient, Appointment, releaseConn: Function }}
 */
function getOrgModels(orgId) {
    const conn = dbManager.getConnection(String(orgId));
    return {
        Branch: getModel(conn, BranchDef),
        User: getModel(conn, UserDef),
        AuditLog: getModel(conn, AuditLogDef),
        Patient: getModel(conn, PatientDef),
        Appointment: getModel(conn, AppointmentDef),
        releaseConn: () => {
            try { dbManager.releaseConnection(String(orgId)); } catch (_) { /* best-effort */ }
        }
    };
}

// ─── Helper: resolve org with 404 guard ───────────────────────────────────────
async function resolveOrg(id, res) {
    const org = await Organization.findById(id).lean();
    if (!org) {
        res.status(404).json({ message: "Organization not found" });
        return null;
    }
    return org;
}

// ─── POST /platform/organizations (Phase 34 Enterprise Provisioning) ──────────
exports.createOrganizationProvisioned = asyncHandler(async (req, res) => {
    const data = req.body;
    const platformUserId = req.platformUser._id;
    const ip = req.ip;
    const userAgent = req.headers["user-agent"];

    // Wire through Guardian layer for post-creation invariant validation
    const result = await wrappedProvisionOrganization(
        organizationService.provisionOrganization,
        data,
        { actorId: platformUserId, ip, userAgent }
    );

    res.status(201).json({
        message: "Organization provisioned successfully",
        ...result
    });
});

// ─── GET /platform/organizations/:id ────────────────────────────────────────
exports.getOrganizationDetails = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        // TDS: Gracefully handle missing contract instead of 500
        let commercial;
        try {
            commercial = await resolveCommercialContext(org);
        } catch (commercialErr) {
            if (commercialErr.code === "NO_ACTIVE_CONTRACT") {
                commercial = {
                    _source: "missing_contract",
                    _contractId: null,
                    status: "missing_contract",
                    planCode: null,
                    planVersionTag: null,
                    currency: org.billingCurrency || null,
                    lockedPrice: null,
                    autoRenew: false,
                    renewalTerms: null,
                    pricingOverride: null,
                    appliedCoupon: null,
                };
            } else {
                throw commercialErr;
            }
        }

        // Per-org DB: Branch, User, AuditLog live in dental_org_<orgId>
        const orgModels = getOrgModels(org._id);
        try {
        const [branchCount, userCount, activeUsers, suspendedUsers, auditCount, pendingContract] = await Promise.all([
            orgModels.Branch.countDocuments({ organizationId: org._id }),
            orgModels.User.countDocuments({ organizationId: org._id }),
            orgModels.User.countDocuments({ organizationId: org._id, isActive: true }),
            orgModels.User.countDocuments({ organizationId: org._id, isActive: false }),
            orgModels.AuditLog.countDocuments({ organizationId: org._id }),
            // pendingContract: presence = auto-renew is correctly scheduled; absence = trial-only, no auto-renew
            OrgContractModel.findOne({ organizationId: org._id, contractStatus: 'pending_activation' })
                .select('_id planCode planVersionTag effectiveFrom autoRenew')
                .lean()
                .then(doc => doc || null)
                .catch(() => null),
        ]);

        const subscriptionHealth = computeSubscriptionHealth(org.subscription);

        res.json({
            id: org._id,
            name: org.name,
            slug: org.slug,
            isActive: org.isActive,
            isArchived: org.isArchived || false,
            // planId REMOVED — commercial reference lives in OrgContract.planVersionId
            version: org.version || 0,
            createdAt: org.createdAt,

            // ── ISO Country / Region (v20.1 Wave4) ──────────────────────────────
            // Sentinel §4: ISO code stored and returned only — never a display name.
            // country was being written correctly to DB but omitted from this response.
            country: org.country || null,
            regionCode: org.regionCode || null,

            // ── Organisation Contacts (multi-contact array) ───────────────────────────
            contacts: org.contacts || [],

            // Runtime subscription status only — period dates live in OrgContract
            subscription: org.subscription
                ? {
                    status: org.subscription.status,
                    trialEndsAt: org.subscription.trialEndsAt,
                    autoRenew: org.subscription.autoRenew,
                    paymentProvider: org.subscription.paymentProvider
                }
                : null,

            // Commercial context from OrgContract (or missing_contract fallback)
            commercial: {
                planCode: commercial.planCode,
                planVersionTag: commercial.planVersionTag,
                currency: commercial.currency,
                lockedPrice: commercial.lockedPrice,
                autoRenew: commercial.autoRenew,
                renewalTerms: commercial.renewalTerms,
                pricingOverride: commercial.pricingOverride,
                appliedCoupon: commercial.appliedCoupon
                    ? { code: commercial.appliedCoupon.code, discountType: commercial.appliedCoupon.discountType, discountValue: commercial.appliedCoupon.discountValue }
                    : null,
                _source: commercial._source,
                _contractId: commercial._contractId
            },

            serverNow: new Date().toISOString(),

            branchCount,
            userCount,
            activeUsers,
            suspendedUsers,
            auditCount,
            subscriptionHealth,
            // Canonical auto-renew indicator: true ONLY if a pending_activation contract exists.
            // Use Boolean(pendingContract) on the frontend instead of commercial.autoRenew
            // or subscription.autoRenew, both of which default to true on all contracts.
            pendingContract: pendingContract
                ? {
                    _id: pendingContract._id,
                    planCode: pendingContract.planCode,
                    planVersionTag: pendingContract.planVersionTag,
                    effectiveFrom: pendingContract.effectiveFrom,
                }
                : null,
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/analytics ──────────────────────────────
// Returns governance-layer metrics only — no clinic operations data.
exports.getOrganizationAnalytics = async (req, res) => {
    try {
        const orgId = req.params.id;

        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        const [totalBranches, totalUsers, activeUsers, suspendedUsers, auditEventsCount] = await Promise.all([
            orgModels.Branch.countDocuments({ organizationId: orgId }),
            orgModels.User.countDocuments({ organizationId: orgId }),
            orgModels.User.countDocuments({ organizationId: orgId, isActive: true }),
            orgModels.User.countDocuments({ organizationId: orgId, isActive: false }),
            orgModels.AuditLog.countDocuments({ organizationId: orgId }),
        ]);

        // Trial days remaining — use explicit trialEndsAt from subscription sub-document
        let trialRemainingDays = null;
        const sub = org.subscription || {};
        if (sub.status === "trial") {
            const trialEnd = sub.trialEndsAt
                ? new Date(sub.trialEndsAt)
                : (() => { const d = new Date(org.createdAt); d.setDate(d.getDate() + 14); return d; })();
            trialRemainingDays = Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24)));
        }

        res.json({
            totalBranches,
            totalUsers,
            activeUsers,
            suspendedUsers,
            auditEventsCount,
            subscription: sub,
            trialRemainingDays,
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/users ──────────────────────────────────
exports.getOrganizationUsers = async (req, res) => {
    try {
        const orgId = req.params.id;
        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        const users = await orgModels.User.find({ organizationId: orgId })
            .populate("roleId", "name")
            .populate("branchAccess", "name")
            .sort({ createdAt: -1 })
            .lean();
        res.json(users);
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/users/:userId ───────────────────────────
exports.getOrganizationUserDetails = asyncHandler(async (req, res) => {
    const { id: orgId, userId } = req.params;

    const org = await resolveOrg(orgId, res);
    if (!org) return;

    const orgModels = getOrgModels(orgId);
    try {
    const user = await orgModels.User.findOne({ _id: userId, organizationId: orgId })
        .populate("roleId", "name permissions")
        .populate("branchAccess", "name")
        .lean();

    if (!user) {
        return res.status(404).json({ message: "User not found in this organization" });
    }

    // Fetch Audit Logs - Actor logs (what the user did) and Entity logs (what was done to the user)
    const auditLogs = await orgModels.AuditLog.find({
        $or: [
            { userId: userId },             // Legacy / Clinical mapping
            { entityId: userId },           // Action target
            { actorId: userId, actorType: "tenant_user" } // Action actor
        ]
    })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    // securityEvents: Filtred subset of audit logs
    const securityActions = [
        "LOGIN_SUCCESS",
        "LOGIN_FAILURE",
        "PASSWORD_CHANGED",
        "PLATFORM_USER_PASSWORD_SET",
        "PLATFORM_USER_TEMP_PASSWORD_GENERATED",
        "PLATFORM_USER_RESET_EMAIL_SENT",
        "PLATFORM_USER_FORCE_LOGOUT"
    ];

    const securityEvents = auditLogs.filter(log => securityActions.includes(log.action));

    res.json({
        user,
        organization: {
            id: org._id,
            name: org.name,
            slug: org.slug
        },
        auditLogs,
        securityEvents
    });
    } finally { orgModels.releaseConn(); }
});

// ─── PATCH /platform/organizations/:id/users/:userId ────────────────────────
// Soft status change only — double-scoped to org + user ID.
exports.updateOrganizationUser = async (req, res) => {
    try {
        const { id: orgId, userId } = req.params;
        const { isActive } = req.body;

        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        const updates = { isActive };
        if (isActive === false) {
            updates.$inc = { tokenVersion: 1 };
            // Per-org DB: RefreshTokens live in dental_org_<orgId>
            const RefreshTokenDef = require("@shared/models/RefreshToken");
            const rtConn = dbManager.getConnection(String(orgId));
            try {
                const RefreshTokenModel = getModel(rtConn, RefreshTokenDef);
                await RefreshTokenModel.updateMany({ userId }, { revoked: true });
            } finally {
                try { dbManager.releaseConnection(String(orgId)); } catch (_) {}
            }
        }

        const user = await orgModels.User.findOneAndUpdate(
            { _id: userId, organizationId: orgId },   // double-scoped
            updates,
            { returnDocument: 'after' }
        ).lean();

        if (!user) return res.status(404).json({ message: "User not found in this organization" });
        res.json({ message: "User updated", user });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/branches ───────────────────────────────
exports.getOrganizationBranches = async (req, res) => {
    try {
        const orgId = req.params.id;
        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        const branches = await orgModels.Branch.find({ organizationId: orgId })
            .sort({ createdAt: -1 })
            .lean();
        res.json(branches);
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── POST /platform/organizations/:id/branches ──────────────────────────────
exports.createBranch = async (req, res) => {
    try {
        const orgId = req.params.id;
        const org = await resolveOrg(orgId, res);
        if (!org) return;

        // v5.0 — Enforce Plan Branch Limit (legacy)
        await assertBranchLimit(orgId);

        // Phase 4.1 — Entitlement-aware branch limit enforcement
        // Platform routes lack req.capabilities, so we resolve manually.
        try {
            const entitlements = await resolveOrganizationEntitlements(orgId);
            const maxBranches = entitlements?.limits?.maxBranches;
            if (maxBranches && maxBranches > 0 && maxBranches !== -1) {
                const usage = await orgUsageService.getOrgUsage(orgId);
                if (usage.branchesCount >= maxBranches) {
                    return res.status(403).json({
                        success: false,
                        message: `Branch limit reached (${usage.branchesCount}/${maxBranches}). Upgrade plan to add more branches.`,
                        errorCode: "BRANCH_LIMIT_REACHED",
                        usage: { current: usage.branchesCount, limit: maxBranches },
                    });
                }
            }
        } catch (limitErr) {
            // Fail-open: log but don't block branch creation
            const logger = require("@utils/logger");
            logger.warn({ err: limitErr, orgId }, "[BranchCreate] Entitlement limit check failed — allowing");
        }

        const orgModels = getOrgModels(orgId);
        try {
        const { name, address, phone, type } = req.body;
        const branch = await orgModels.Branch.create({
            name,
            address,
            phone,
            type: type || "internal",
            organizationId: orgId,
        });

        // Phase 4.1 — Update usage counter (non-blocking)
        try { await orgUsageService.incrementBranches(orgId); } catch (_) { /* logged inside service */ }

        res.status(201).json({ message: "Branch created", branch });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/branches/:branchId ───────────────────
// Always double-scoped: { _id: branchId, organizationId: orgId }
exports.updateBranch = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;
        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        // Whitelist safe update fields — no hard deletes
        const { name, address, phone, type } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (address !== undefined) updates.address = address;
        if (phone !== undefined) updates.phone = phone;
        if (type !== undefined) updates.type = type;

        const branch = await orgModels.Branch.findOneAndUpdate(
            { _id: branchId, organizationId: orgId },   // double-scoped
            updates,
            { returnDocument: 'after' }
        ).lean();

        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });
        res.json({ message: "Branch updated", branch });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/branches/:branchId/status ────────────
// Soft delete via isActive — double-scoped.
exports.updateBranchStatus = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;
        const { isActive } = req.body;

        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        const branch = await orgModels.Branch.findOneAndUpdate(
            { _id: branchId, organizationId: orgId },   // double-scoped
            { isActive },
            { returnDocument: 'after' }
        ).lean();

        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });
        res.json({ message: "Branch status updated", branch });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/audit-logs ─────────────────────────────
// Always filtered by organizationId — never a global scan.
exports.getOrganizationAuditLogs = async (req, res) => {
    try {
        const orgId = req.params.id;
        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        const { action, success, page = 1, limit = 50 } = req.query;
        const filter = { organizationId: orgId };       // mandatory scope
        if (action) filter.action = action;
        if (success !== undefined) filter.success = success === "true";

        const skip = (Number(page) - 1) * Number(limit);
        const [logs, total] = await Promise.all([
            orgModels.AuditLog.find(filter)
                .populate("userId", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            orgModels.AuditLog.countDocuments(filter),
        ]);

        res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/modules ──────────────────────────────
exports.updateOrganizationModules = async (req, res) => {
    try {
        const { modules } = req.body;

        // findById + existence check (not findByIdAndUpdate — guards against ghost orgs)
        const org = await Organization.findById(req.params.id);
        if (!org) return res.status(404).json({ message: "Organization not found" });

        // Whitelist only known module keys
        const VALID_MODULES = ["orthodontics", "inventory", "labs", "analytics", "accounting", "appointments", "patients"];
        const safeModules = {};
        for (const key of VALID_MODULES) {
            if (typeof modules[key] === "boolean") safeModules[key] = modules[key];
        }

        org.modules = { ...org.modules.toObject?.() ?? org.modules, ...safeModules };
        await org.save();
        res.json({ message: "Modules updated", modules: org.modules });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/configuration ──────────────────────────
// Returns only configuration surface — no governance, no subscription fields.
exports.getOrganizationConfiguration = async (req, res) => {
    try {
        const org = await Organization.findById(req.params.id)
            .select("modules organizationSettings")
            .lean();
        if (!org) return res.status(404).json({ message: "Organization not found" });

        res.json({
            modules: org.modules,
            organizationSettings: org.organizationSettings || null,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/configuration ────────────────────────
// Deep $set pattern — safe against wiping nested branding fields on partial updates.
// Governance fields (subscription, status, isActive) are explicitly forbidden — 403.
exports.updateOrganizationConfiguration = async (req, res) => {
    try {
        const FORBIDDEN = ["subscription", "status", "isActive", "ownerId", "slug"];
        const forbidden = FORBIDDEN.filter((k) => k in req.body);
        if (forbidden.length) {
            return res.status(403).json({
                message: `Forbidden fields in configuration update: ${forbidden.join(", ")}`,
            });
        }

        const VALID_MODULES = ["orthodontics", "inventory", "labs", "analytics", "accounting", "appointments", "patients"];
        const $setOps = {};

        // ── modules: validate each key individually ───────────────────────────
        if (req.body.modules && typeof req.body.modules === "object") {
            for (const key of VALID_MODULES) {
                if (typeof req.body.modules[key] === "boolean") {
                    $setOps[`modules.${key}`] = req.body.modules[key];
                }
            }
        }

        // ── organizationSettings: deep $set paths to preserve sibling fields ─
        if (req.body.organizationSettings && typeof req.body.organizationSettings === "object") {
            const os = req.body.organizationSettings;
            if (typeof os.isPublicLandingEnabled === "boolean") {
                $setOps["organizationSettings.isPublicLandingEnabled"] = os.isPublicLandingEnabled;
            }
            if (os.branding && typeof os.branding === "object") {
                if (typeof os.branding.primaryColor === "string" || os.branding.primaryColor === null) {
                    $setOps["organizationSettings.branding.primaryColor"] = os.branding.primaryColor;
                }
                if (typeof os.branding.logo === "string" || os.branding.logo === null) {
                    $setOps["organizationSettings.branding.logo"] = os.branding.logo;
                }
            }
        }

        if (!Object.keys($setOps).length) {
            return res.status(400).json({ message: "No valid configuration fields provided" });
        }

        const org = await Organization.findByIdAndUpdate(
            req.params.id,
            { $set: $setOps },
            { new: true, runValidators: true }
        ).select("modules organizationSettings").lean();

        if (!org) return res.status(404).json({ message: "Organization not found" });
        res.json({
            message: "Configuration updated",
            modules: org.modules,
            organizationSettings: org.organizationSettings,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/branches/:branchId/analytics ───────────
// Always double-scoped: { organizationId: orgId } + { _id: branchId, organizationId: orgId }
exports.getBranchAnalytics = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;

        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        // Verify branch belongs to this org — prevents cross-org branch access
        const branch = await orgModels.Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });

        const [totalUsers, activeUsers, suspendedUsers, auditEventsCount] = await Promise.all([
            orgModels.User.countDocuments({ organizationId: orgId, branchAccess: branchId }),
            orgModels.User.countDocuments({ organizationId: orgId, branchAccess: branchId, isActive: true }),
            orgModels.User.countDocuments({ organizationId: orgId, branchAccess: branchId, isActive: false }),
            orgModels.AuditLog.countDocuments({ organizationId: orgId }).catch(() => 0),
        ]);

        res.json({
            totalUsers,
            activeUsers,
            suspendedUsers,
            auditEventsCount,
            branchName: branch.name,
            branchStatus: branch.isActive ? "active" : "inactive",
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── Helper: resolve branch double-scoped (org + branch) ─────────────────────
// NOTE: Caller must pass orgModels (from getOrgModels) to query per-org DB.
async function resolveBranch(orgModels, orgId, branchId, res) {
    const branch = await orgModels.Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
    if (!branch) {
        res.status(404).json({ message: "Branch not found in this organization" });
        return null;
    }
    return branch;
}

// ─── Helper: compute effective working hours ──────────────────────────────────
// Returns branch override if set; falls back to org appointmentSettings.
function effectiveHours(branch, org) {
    const override = branch.workingHoursOverride;
    if (override?.start) return override;
    return org?.appointmentSettings?.workingHours || { start: "08:00", end: "20:00" };
}

// ─── GET /platform/organizations/:id/branches/:branchId ──────────────────────
// Dedicated governance view — replaces list+find pattern on the frontend.
exports.getBranchDetails = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;
        const orgModels = getOrgModels(orgId);
        try {

        const [branch, org] = await Promise.all([
            orgModels.Branch.findOne({ _id: branchId, organizationId: orgId }).lean(),
            Organization.findById(orgId).select("name appointmentSettings").lean(),
        ]);

        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });
        if (!org) return res.status(404).json({ message: "Organization not found" });

        const [userCount, auditCount] = await Promise.all([
            orgModels.User.countDocuments({ organizationId: orgId, branchAccess: branchId }),
            orgModels.AuditLog.countDocuments({ organizationId: orgId }).catch(() => 0),
        ]);

        res.json({
            id: branch._id,
            name: branch.name,
            type: branch.type,
            address: branch.address,
            phone: branch.phone,
            isActive: branch.isActive,
            createdAt: branch.createdAt,
            userCount,
            auditCount,
            effectiveWorkingHours: effectiveHours(branch, org),
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/branches/:branchId/configuration ────────
// Returns working hours override + effective hours (server-computed) + isActive.
exports.getBranchConfiguration = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;
        const orgModels = getOrgModels(orgId);
        try {

        const [branch, org] = await Promise.all([
            orgModels.Branch.findOne({ _id: branchId, organizationId: orgId })
                .select("workingHoursOverride isActive").lean(),
            Organization.findById(orgId).select("appointmentSettings").lean(),
        ]);

        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });
        if (!org) return res.status(404).json({ message: "Organization not found" });

        res.json({
            workingHoursOverride: branch.workingHoursOverride,
            effectiveWorkingHours: effectiveHours(branch, org),
            isActive: branch.isActive,
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/branches/:branchId/configuration ──────
// Archive guard: blocks all writes when inactive EXCEPT isActive (reactivation path).
// Improvement: effectiveWorkingHours returned after save to keep logic server-side.
exports.updateBranchConfiguration = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;

        // Forbidden field guard — 403
        const FORBIDDEN = ["modules", "subscription", "slotDuration", "organizationId"];
        const forbidden = FORBIDDEN.filter((k) => k in req.body);
        if (forbidden.length) {
            return res.status(403).json({
                message: `Forbidden fields in branch configuration: ${forbidden.join(", ")}`,
            });
        }

        const orgModels = getOrgModels(orgId);
        try {
        const branch = await orgModels.Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });

        // Archive guard — allow isActive write (reactivation), block everything else
        if (!branch.isActive && !("isActive" in req.body)) {
            return res.status(403).json({
                message: "Branch is inactive. Write operations are disabled.",
            });
        }

        const $setOps = {};

        if (typeof req.body.isActive === "boolean") {
            $setOps.isActive = req.body.isActive;
        }

        // Deep $set paths — prevents sibling field wipeout on partial saves
        if (req.body.workingHoursOverride && typeof req.body.workingHoursOverride === "object") {
            const wh = req.body.workingHoursOverride;
            if (typeof wh.start === "string" || wh.start === null) {
                $setOps["workingHoursOverride.start"] = wh.start;
            }
            if (typeof wh.end === "string" || wh.end === null) {
                $setOps["workingHoursOverride.end"] = wh.end;
            }
        }

        if (!Object.keys($setOps).length) {
            return res.status(400).json({ message: "No valid configuration fields provided" });
        }

        const [updated, org] = await Promise.all([
            orgModels.Branch.findByIdAndUpdate(branchId, { $set: $setOps }, { new: true, runValidators: true })
                .select("workingHoursOverride isActive").lean(),
            Organization.findById(orgId).select("appointmentSettings").lean(),
        ]);

        if (!updated) return res.status(404).json({ message: "Branch not found" });

        res.json({
            message: "Branch configuration updated",
            workingHoursOverride: updated.workingHoursOverride,
            effectiveWorkingHours: effectiveHours(updated, org),
            isActive: updated.isActive,
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PLATFORM REVENUE ANALYTICS ───────────────────────────────────────────────
// GET /api/platform/analytics/revenue (Enterprise Logic)
exports.getPlatformRevenueAnalytics = async (req, res) => {
    try {
        const intelligence = await revenueIntelligenceService.computeRevenueIntelligence();

        // Compute subscription status counters for dashboard metadata
        const orgs = await Organization.find().select("subscription").lean();

        let activeSubscriptions = 0;
        let trialSubscriptions = 0;
        let suspendedSubscriptions = 0;
        let expiredSubscriptions = 0;
        let expiringSoonCount = 0;

        for (const org of orgs) {
            const sub = org.subscription || {};
            const health = computeSubscriptionHealth(sub);

            if (sub.status === "active") {
                activeSubscriptions++;
            } else if (sub.status === "trial") {
                // "trial" is the canonical subscription status for trial orgs
                trialSubscriptions++;
            } else if (sub.status === "suspended") {
                suspendedSubscriptions++;
            } else if (sub.status === "expired" || health?.isExpired) {
                expiredSubscriptions++;
            }

            if (health?.isExpiringSoon) expiringSoonCount++;
        }

        res.json({
            totalOrganizations: orgs.length,
            activeSubscriptions,
            trialSubscriptions,
            suspendedSubscriptions,
            expiredSubscriptions,
            expiringSoonCount,
            // Revenue intelligence from refactored service (no legacy billing fields)
            projectedMRR: intelligence.mrr,
            ...intelligence
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── TENANT-LEVEL CLINICAL ANALYTICS ──────────────────────────────────────────
// GET /api/platform/organizations/:id/analytics
exports.getOrganizationAnalytics = async (req, res) => {
    try {
        const orgId = req.params.id;
        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const orgModels = getOrgModels(orgId);
        try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            branches,
            totalUsers,
            activeUsers,
            totalPatients,
            patientsThisMonth,
            totalAppointments,
            appointmentsThisMonthData
        ] = await Promise.all([
            orgModels.Branch.find({ organizationId: orgId }).select("name isActive").lean(),
            orgModels.User.countDocuments({ organizationId: orgId }),
            orgModels.User.countDocuments({ organizationId: orgId, isActive: true }),
            orgModels.Patient.countDocuments({ organizationId: orgId }),
            orgModels.Patient.countDocuments({ organizationId: orgId, createdAt: { $gte: startOfMonth } }),
            orgModels.Appointment.countDocuments({ organizationId: orgId }),
            orgModels.Appointment.aggregate([
                { $match: { organizationId: org._id, startTime: { $gte: startOfMonth } } },
                { $group: { _id: "$branchId", count: { $sum: 1 } } }
            ])
        ]);

        const activeBranches = branches.filter(b => b.isActive).length;
        const archivedBranches = branches.length - activeBranches;

        let appointmentsThisMonth = 0;
        const branchApptsMap = {};
        for (const data of appointmentsThisMonthData) {
            appointmentsThisMonth += data.count;
            branchApptsMap[data._id.toString()] = data.count;
        }

        const appointmentsByBranch = branches.map(b => ({
            branchId: b._id,
            branchName: b.name,
            count: branchApptsMap[b._id.toString()] || 0
        }));

        res.json({
            totalBranches: branches.length,
            activeBranches,
            archivedBranches,
            totalUsers,
            activeUsers,
            totalPatients,
            totalAppointments,
            appointmentsThisMonth,
            patientsThisMonth,
            appointmentsByBranch,
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/platform/organizations/:id/branches/:branchId/analytics
// (Double-scoped for strict leakage prevention)
// Note: This replaces/upgrades the original getBranchAnalytics
exports.getBranchAnalytics = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;

        const orgModels = getOrgModels(orgId);
        try {
        const branch = await orgModels.Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalUsers, activeUsers, totalPatients, totalAppointments, appointmentsThisMonth] = await Promise.all([
            orgModels.User.countDocuments({ organizationId: orgId, branchAccess: branchId }),
            orgModels.User.countDocuments({ organizationId: orgId, branchAccess: branchId, isActive: true }),
            orgModels.Patient.countDocuments({ organizationId: orgId, branchId }),
            orgModels.Appointment.countDocuments({ organizationId: orgId, branchId }),
            orgModels.Appointment.countDocuments({ organizationId: orgId, branchId, startTime: { $gte: startOfMonth } })
        ]);

        res.json({
            branchName: branch.name,
            branchStatus: branch.isActive ? "active" : "inactive",
            totalUsers,
            activeUsers,
            totalPatients,
            totalAppointments,
            appointmentsThisMonth,
        });
    } finally { orgModels.releaseConn(); }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
// ─── PATCH /platform/organizations/:id/archive ───────────────────────────────
// Soft-archives an organization. Sets isArchived = true + archivedAt = now.
// Platform actor path: uses Control Plane DB for audit (actorType: platform_user).
exports.archiveOrganization = async (req, res) => {
    try {
        const org = await Organization.findByIdAndUpdate(
            req.params.id,
            { $set: { isArchived: true, archivedAt: new Date() } },
            { new: true }
        ).lean();

        if (!org) return res.status(404).json({ message: "Organization not found" });

        // Audit: platform_user path → Control Plane DB (no regionRouter)
        const auditService = require("../../services/auditService");
        await auditService.createAuditRecord({
            organizationId: org._id,
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "ORG_ARCHIVED",
            entity: "Organization",
            entityId: org._id,
            success: true,
            details: { orgName: org.name },
            correlationId: req.correlationId,
            signatureVersion: 1
        }).catch((err) => {
            // Non-fatal: log and continue
            console.error("[ArchiveOrg] Audit log failed:", err.message);
        });

        res.json({ message: "Organization archived", isArchived: true, archivedAt: org.archivedAt });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/restore ────────────────────────────────
// Restores a previously archived organization. Clears isArchived + archivedAt.
exports.restoreOrganization = async (req, res) => {
    try {
        const org = await Organization.findByIdAndUpdate(
            req.params.id,
            { $set: { isArchived: false, archivedAt: null } },
            { new: true }
        ).lean();

        if (!org) return res.status(404).json({ message: "Organization not found" });

        const auditService = require("../../services/auditService");
        await auditService.createAuditRecord({
            organizationId: org._id,
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "ORG_RESTORED",
            entity: "Organization",
            entityId: org._id,
            success: true,
            details: { orgName: org.name },
            correlationId: req.correlationId,
            signatureVersion: 1
        }).catch((err) => {
            console.error("[RestoreOrg] Audit log failed:", err.message);
        });

        res.json({ message: "Organization restored", isArchived: false });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/check-duplicates?q= ─────────────────────────
// Soft duplicate detection — returns up to 5 similar orgs by name/normalizedName.
// Guarded by VIEW_ORGANIZATIONS (GET → VIEW_* per Sentinel §3).
// This endpoint MUST be registered BEFORE /:id routes to avoid param hijacking.
exports.checkDuplicateOrganizations = asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();

    if (!q || q.length < 2) {
        return res.json({ matches: [] });
    }

    // Normalize: lowercase + strip all non-alphanumeric characters.
    // Matches the same algorithm used in Organization.pre('validate').
    const normalized = q.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Build regex safely — escape any special regex chars from the raw query
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const matches = await Organization.find({
        $or: [
            { name: { $regex: escaped, $options: 'i' } },
            { normalizedName: normalized },
        ],
        isArchived: { $ne: true },   // archived orgs are not active conflicts
    })
        .limit(5)
        .select('name country subscription.status createdAt normalizedName')
        .lean();

    // Annotate each match: exact = display name matches case-insensitively OR normalizedName matches exactly
    const queryNormalized = normalized;
    const annotated = matches.map((org) => ({
        _id: org._id,
        name: org.name,
        country: org.country,
        status: org.subscription?.status ?? 'unknown',
        createdAt: org.createdAt,
        isExactMatch: (org.normalizedName === queryNormalized),
    }));

    return res.json({ matches: annotated });
});

// ─── GET /platform/organizations/:id/contracts ───────────────────────────────
// Returns contract history + current active contract + invoice history.
// READ-ONLY. All mutations must go through contractEngine / activation services.
const OrgContract = require("../../platform/billing/models/OrgContract.model").default;
const PlatformInvoice = require("../../platform/billing/models/PlatformInvoice.model").default;

exports.getOrganizationContracts = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const org = await Organization.findById(id).lean();
    if (!org) return res.status(404).json({ message: "Organization not found" });

    const [contracts, invoices] = await Promise.all([
        OrgContract.find({ organizationId: id })
            .sort({ createdAt: -1 })
            .lean(),
        PlatformInvoice.find({ organizationId: id })
            .sort({ createdAt: -1 })
            .lean(),
    ]);

    // currentContract resolved from pointer — avoids extra query if already in contracts list
    const currentContract = org.currentContractId
        ? (contracts.find(c => String(c._id) === String(org.currentContractId)) || null)
        : null;

    return res.json({
        currentContract,
        contracts,
        invoices,
    });
});

// ─── POST /platform/organizations/:id/contacts ──────────────────────────────────
// Adds a new contact to the contacts array.
// Guard: MANAGE_ORGANIZATIONS.
const CONTACT_ROLES = ['owner', 'it', 'finance', 'operations', 'sales', 'other'];

exports.addContact = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role = 'owner', ownerName, phone } = req.body;

    if (!CONTACT_ROLES.includes(role)) {
        return res.status(400).json({ message: `role must be one of: ${CONTACT_ROLES.join(', ')}` });
    }
    if (!ownerName?.trim() && !phone?.trim()) {
        return res.status(400).json({ message: 'Provide at least ownerName or phone.' });
    }

    const newContact = {
        role,
        ownerName: ownerName?.trim() || null,
        phone: phone?.trim() || null,
    };

    const org = await Organization.findByIdAndUpdate(
        id,
        { $push: { contacts: newContact } },
        { new: true, runValidators: false }
    ).select('contacts').lean();

    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({ success: true, contacts: org.contacts || [] });
});

// ─── PATCH /platform/organizations/:id/contacts/:contactId ──────────────────────
exports.updateContact = asyncHandler(async (req, res) => {
    const { id, contactId } = req.params;
    const { role, ownerName, phone } = req.body;

    const $set = {};
    if (role !== undefined) {
        if (!CONTACT_ROLES.includes(role)) {
            return res.status(400).json({ message: `role must be one of: ${CONTACT_ROLES.join(', ')}` });
        }
        $set['contacts.$.role'] = role;
    }
    if (ownerName !== undefined) $set['contacts.$.ownerName'] = ownerName?.trim() || null;
    if (phone !== undefined) $set['contacts.$.phone'] = phone?.trim() || null;

    if (!Object.keys($set).length) {
        return res.status(400).json({ message: 'No valid fields provided.' });
    }

    const org = await Organization.findOneAndUpdate(
        { _id: id, 'contacts._id': contactId },
        { $set },
        { new: true, runValidators: false }
    ).select('contacts').lean();

    if (!org) return res.status(404).json({ message: 'Organization or contact not found.' });
    return res.json({ success: true, contacts: org.contacts || [] });
});

// ─── DELETE /platform/organizations/:id/contacts/:contactId ────────────────────
exports.deleteContact = asyncHandler(async (req, res) => {
    const { id, contactId } = req.params;
    const org = await Organization.findByIdAndUpdate(
        id,
        { $pull: { contacts: { _id: contactId } } },
        { new: true, runValidators: false }
    ).select('contacts').lean();
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({ success: true, contacts: org.contacts || [] });
});


// ─── GET /platform/organizations/:id/crm ─────────────────────────────────────
// Returns full CRM payload. Guard: VIEW_ORGANIZATIONS.
exports.getCrm = asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.params.id)
        .select('crm')
        .lean();
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({
        notes: (org.crm?.notes || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        tags: org.crm?.tags || [],
        tasks: org.crm?.tasks || [],
    });
});

// ─── POST /platform/organizations/:id/crm/notes ───────────────────────────────
// Guard: MANAGE_ORGANIZATIONS.
exports.addCrmNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { text } = req.body;
    if (!text || !String(text).trim()) {
        return res.status(400).json({ message: 'Note text is required.' });
    }
    const newNote = {
        text: String(text).trim(),
        createdBy: req.platformUser?.name || req.platformUser?.email || 'Platform Admin',
        createdAt: new Date(),
    };
    const org = await Organization.findByIdAndUpdate(
        id,
        { $push: { 'crm.notes': { $each: [newNote], $position: 0 } } },
        { new: true, runValidators: false }
    ).select('crm.notes').lean();
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({ success: true, notes: org.crm?.notes || [] });
});

// ─── DELETE /platform/organizations/:id/crm/notes/:noteId ─────────────────────
exports.deleteCrmNote = asyncHandler(async (req, res) => {
    const { id, noteId } = req.params;
    const org = await Organization.findByIdAndUpdate(
        id,
        { $pull: { 'crm.notes': { _id: noteId } } },
        { new: true, runValidators: false }
    ).select('crm.notes').lean();
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({ success: true, notes: org.crm?.notes || [] });
});

// ─── POST /platform/organizations/:id/crm/tags ────────────────────────────────
exports.addCrmTag = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { tag } = req.body;
    if (!tag || !String(tag).trim()) {
        return res.status(400).json({ message: 'Tag is required.' });
    }
    const cleanTag = String(tag).trim();
    // $addToSet prevents duplicates atomically
    const org = await Organization.findByIdAndUpdate(
        id,
        { $addToSet: { 'crm.tags': cleanTag } },
        { new: true, runValidators: false }
    ).select('crm.tags').lean();
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({ success: true, tags: org.crm?.tags || [] });
});

// ─── DELETE /platform/organizations/:id/crm/tags/:tag ─────────────────────────
exports.removeCrmTag = asyncHandler(async (req, res) => {
    const { id, tag } = req.params;
    const org = await Organization.findByIdAndUpdate(
        id,
        { $pull: { 'crm.tags': decodeURIComponent(tag) } },
        { new: true, runValidators: false }
    ).select('crm.tags').lean();
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({ success: true, tags: org.crm?.tags || [] });
});

// ─── POST /platform/organizations/:id/crm/tasks ───────────────────────────────
exports.addCrmTask = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, dueDate } = req.body;
    if (!title || !String(title).trim()) {
        return res.status(400).json({ message: 'Task title is required.' });
    }
    const newTask = {
        title: String(title).trim(),
        status: 'open',
        dueDate: dueDate ? new Date(dueDate) : null,
    };
    const org = await Organization.findByIdAndUpdate(
        id,
        { $push: { 'crm.tasks': newTask } },
        { new: true, runValidators: false }
    ).select('crm.tasks').lean();
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    return res.json({ success: true, tasks: org.crm?.tasks || [] });
});

// ─── PATCH /platform/organizations/:id/crm/tasks/:taskId ──────────────────────
exports.updateCrmTask = asyncHandler(async (req, res) => {
    const { id, taskId } = req.params;
    const { status, title, dueDate } = req.body;

    const $set = {};
    if (status !== undefined) {
        if (!['open', 'done'].includes(status)) {
            return res.status(400).json({ message: "status must be 'open' or 'done'." });
        }
        $set['crm.tasks.$.status'] = status;
    }
    if (title !== undefined) $set['crm.tasks.$.title'] = String(title).trim();
    if (dueDate !== undefined) $set['crm.tasks.$.dueDate'] = dueDate ? new Date(dueDate) : null;

    if (!Object.keys($set).length) {
        return res.status(400).json({ message: 'No valid fields provided.' });
    }

    const org = await Organization.findOneAndUpdate(
        { _id: id, 'crm.tasks._id': taskId },
        { $set },
        { new: true, runValidators: false }
    ).select('crm.tasks').lean();

    if (!org) return res.status(404).json({ message: 'Organization or task not found.' });
    return res.json({ success: true, tasks: org.crm?.tasks || [] });
});
