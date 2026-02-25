const organizationService = require("../services/organizationService");
const asyncHandler = require("../utils/asyncHandler");
const Organization = require("../models/Organization");
const Branch = require("../models/Branch");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const revenueIntelligenceService = require("../services/revenueIntelligenceService");
const computeSubscriptionHealth = require("../utils/subscriptionHealth");

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

    const result = await organizationService.provisionOrganization(data, platformUserId, ip, userAgent);

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

        const [branchCount, userCount, activeUsers, suspendedUsers, auditCount] = await Promise.all([
            Branch.countDocuments({ organizationId: org._id }),
            User.countDocuments({ organizationId: org._id }),
            User.countDocuments({ organizationId: org._id, isActive: true }),
            User.countDocuments({ organizationId: org._id, isActive: false }),
            AuditLog.countDocuments({ organizationId: org._id }),
        ]);

        const subscriptionHealth = computeSubscriptionHealth(org.subscription);

        res.json({
            id: org._id,
            name: org.name,
            slug: org.slug,
            isActive: org.isActive,
            createdAt: org.createdAt,

            subscription: org.subscription
                ? {
                    plan: org.subscription.plan,
                    status: org.subscription.status,
                    trialEndsAt: org.subscription.trialEndsAt,
                    currentPeriodStart: org.subscription.currentPeriodStart,
                    currentPeriodEnd: org.subscription.currentPeriodEnd,
                    autoRenew: org.subscription.autoRenew,
                    // Dunning / Engine additions
                    gracePeriodDays: org.subscription.gracePeriodDays,
                    graceEndsAt: org.subscription.graceEndsAt,
                    basePriceAtSubscription: org.subscription.basePriceAtSubscription,
                    customPricing: org.subscription.customPricing,
                    renewalPolicy: org.subscription.renewalPolicy,
                    coupon: org.subscription.coupon,
                    paymentProvider: org.subscription.paymentProvider
                }
                : null,

            serverNow: new Date().toISOString(),

            branchCount,
            userCount,
            activeUsers,
            suspendedUsers,
            auditCount,
            subscriptionHealth,
        });
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

        const [totalBranches, totalUsers, activeUsers, suspendedUsers, auditEventsCount] = await Promise.all([
            Branch.countDocuments({ organizationId: orgId }),
            User.countDocuments({ organizationId: orgId }),
            User.countDocuments({ organizationId: orgId, isActive: true }),
            User.countDocuments({ organizationId: orgId, isActive: false }),
            AuditLog.countDocuments({ organizationId: orgId }),
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
            subscriptionStatus: sub.status,    // backward compat for frontend
            trialRemainingDays,
        });
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

        const users = await User.find({ organizationId: orgId })
            .populate("roleId", "name")
            .populate("branchAccess", "name")
            .sort({ createdAt: -1 })
            .lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/users/:userId ───────────────────────────
exports.getOrganizationUserDetails = asyncHandler(async (req, res) => {
    const { id: orgId, userId } = req.params;

    const org = await resolveOrg(orgId, res);
    if (!org) return;

    const user = await User.findOne({ _id: userId, organizationId: orgId })
        .populate("roleId", "name permissions")
        .populate("branchAccess", "name")
        .lean();

    if (!user) {
        return res.status(404).json({ message: "User not found in this organization" });
    }

    // Fetch Audit Logs - Actor logs (what the user did) and Entity logs (what was done to the user)
    const auditLogs = await AuditLog.find({
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
});

// ─── PATCH /platform/organizations/:id/users/:userId ────────────────────────
// Soft status change only — double-scoped to org + user ID.
exports.updateOrganizationUser = async (req, res) => {
    try {
        const { id: orgId, userId } = req.params;
        const { isActive } = req.body;

        const org = await resolveOrg(orgId, res);
        if (!org) return;

        const updates = { isActive };
        if (isActive === false) {
            updates.$inc = { tokenVersion: 1 };
            const RefreshToken = require("../models/RefreshToken");
            await RefreshToken.updateMany({ userId }, { revoked: true });
        }

        const user = await User.findOneAndUpdate(
            { _id: userId, organizationId: orgId },   // double-scoped
            updates,
            { returnDocument: 'after' }
        ).lean();

        if (!user) return res.status(404).json({ message: "User not found in this organization" });
        res.json({ message: "User updated", user });
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

        const branches = await Branch.find({ organizationId: orgId })
            .sort({ createdAt: -1 })
            .lean();
        res.json(branches);
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

        const { name, address, phone, type } = req.body;
        const branch = await Branch.create({
            name,
            address,
            phone,
            type: type || "internal",
            organizationId: orgId,
        });
        res.status(201).json({ message: "Branch created", branch });
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

        // Whitelist safe update fields — no hard deletes
        const { name, address, phone, type } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (address !== undefined) updates.address = address;
        if (phone !== undefined) updates.phone = phone;
        if (type !== undefined) updates.type = type;

        const branch = await Branch.findOneAndUpdate(
            { _id: branchId, organizationId: orgId },   // double-scoped
            updates,
            { returnDocument: 'after' }
        ).lean();

        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });
        res.json({ message: "Branch updated", branch });
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

        const branch = await Branch.findOneAndUpdate(
            { _id: branchId, organizationId: orgId },   // double-scoped
            { isActive },
            { returnDocument: 'after' }
        ).lean();

        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });
        res.json({ message: "Branch status updated", branch });
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

        const { action, success, page = 1, limit = 50 } = req.query;
        const filter = { organizationId: orgId };       // mandatory scope
        if (action) filter.action = action;
        if (success !== undefined) filter.success = success === "true";

        const skip = (Number(page) - 1) * Number(limit);
        const [logs, total] = await Promise.all([
            AuditLog.find(filter)
                .populate("userId", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            AuditLog.countDocuments(filter),
        ]);

        res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
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

        // Verify branch belongs to this org — prevents cross-org branch access
        const branch = await Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });

        const [totalUsers, activeUsers, suspendedUsers, auditEventsCount] = await Promise.all([
            User.countDocuments({ organizationId: orgId, branchAccess: branchId }),
            User.countDocuments({ organizationId: orgId, branchAccess: branchId, isActive: true }),
            User.countDocuments({ organizationId: orgId, branchAccess: branchId, isActive: false }),
            AuditLog.countDocuments({ organizationId: orgId }).catch(() => 0),
        ]);

        res.json({
            totalUsers,
            activeUsers,
            suspendedUsers,
            auditEventsCount,
            branchName: branch.name,
            branchStatus: branch.isActive ? "active" : "inactive",
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── Helper: resolve branch double-scoped (org + branch) ─────────────────────
async function resolveBranch(orgId, branchId, res) {
    const branch = await Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
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

        const [branch, org] = await Promise.all([
            Branch.findOne({ _id: branchId, organizationId: orgId }).lean(),
            Organization.findById(orgId).select("name appointmentSettings").lean(),
        ]);

        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });
        if (!org) return res.status(404).json({ message: "Organization not found" });

        const [userCount, auditCount] = await Promise.all([
            User.countDocuments({ organizationId: orgId, branchAccess: branchId }),
            AuditLog.countDocuments({ organizationId: orgId }).catch(() => 0),
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
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/branches/:branchId/configuration ────────
// Returns working hours override + effective hours (server-computed) + isActive.
exports.getBranchConfiguration = async (req, res) => {
    try {
        const { id: orgId, branchId } = req.params;

        const [branch, org] = await Promise.all([
            Branch.findOne({ _id: branchId, organizationId: orgId })
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

        const branch = await Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
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
            Branch.findByIdAndUpdate(branchId, { $set: $setOps }, { new: true, runValidators: true })
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
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PLATFORM REVENUE ANALYTICS ───────────────────────────────────────────────
// GET /api/platform/analytics/revenue (Enterprise Logic)
exports.getPlatformRevenueAnalytics = async (req, res) => {
    try {
        const intelligence = await revenueIntelligenceService.computeRevenueIntelligence();

        // Compute basic metadata and active counters for backward compatibility
        const orgs = await Organization.find().select("subscription").lean();

        let activeSubscriptions = 0;
        let trialSubscriptions = 0;
        let suspendedSubscriptions = 0;
        let expiredSubscriptions = 0;
        let expiringSoonCount = 0;
        const revenueByPlan = { basic: 0, pro: 0, enterprise: 0 };

        for (const org of orgs) {
            const sub = org.subscription || {};
            const health = computeSubscriptionHealth(sub);

            if (sub.status === "active") {
                activeSubscriptions++;
                const planPrice = sub.basePriceAtSubscription || 0;
                revenueByPlan[sub.plan] = (revenueByPlan[sub.plan] || 0) + planPrice;
            }
            else if (sub.status === "trial") trialSubscriptions++;
            else if (sub.status === "suspended") suspendedSubscriptions++;
            else if (sub.status === "expired" || health?.isExpired) expiredSubscriptions++;

            if (health?.isExpiringSoon) expiringSoonCount++;
        }

        res.json({
            totalOrganizations: orgs.length,
            activeSubscriptions,
            trialSubscriptions,
            suspendedSubscriptions,
            expiredSubscriptions,
            expiringSoonCount,
            revenueByPlan,
            projectedMRR: intelligence.mrr, // Legacy mapping if needed
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
            Branch.find({ organizationId: orgId }).select("name isActive").lean(),
            User.countDocuments({ organizationId: orgId }),
            User.countDocuments({ organizationId: orgId, isActive: true }),
            Patient.countDocuments({ organizationId: orgId }),
            Patient.countDocuments({ organizationId: orgId, createdAt: { $gte: startOfMonth } }),
            Appointment.countDocuments({ organizationId: orgId }),
            Appointment.aggregate([
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

        const branch = await Branch.findOne({ _id: branchId, organizationId: orgId }).lean();
        if (!branch) return res.status(404).json({ message: "Branch not found in this organization" });

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalUsers, activeUsers, totalPatients, totalAppointments, appointmentsThisMonth] = await Promise.all([
            User.countDocuments({ organizationId: orgId, branchAccess: branchId }),
            User.countDocuments({ organizationId: orgId, branchAccess: branchId, isActive: true }),
            Patient.countDocuments({ organizationId: orgId, branchId }),
            Appointment.countDocuments({ organizationId: orgId, branchId }),
            Appointment.countDocuments({ organizationId: orgId, branchId, startTime: { $gte: startOfMonth } })
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
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
