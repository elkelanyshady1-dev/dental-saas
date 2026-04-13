const Organization = require("@shared/models/Organization").default;
const PlatformUser = require("../models/PlatformUser").default;
// v20.1 Wave4 — getCountryCode removed; country field is now ISO code

exports.getOrganizations = async (req, res) => {
    try {
        // Filters
        const filter = req.query.includeArchived === "true" ? {} : { isArchived: { $ne: true } };

        // Pagination — server-side clamped (never trust frontend)
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;

        // Parallel execution: data + count
        const [organizations, total] = await Promise.all([
            Organization.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Organization.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: organizations,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


/**
 * ⚠️  DEPRECATED — Sprint 4 / v20.1 Wave4
 *
 * createOrganization was the legacy provisioning handler.
 * It called Organization.create() directly without deriving commercial
 * fields (regionCode, billingCurrency, billingCountry, planId), causing
 * Mongoose ValidationError on every request after those fields were
 * added to the schema.
 *
 * USE: createOrganizationProvisioned (platformOrganizationController)
 * ROUTE: POST /api/platform/organizations → createOrganizationProvisioned
 */
exports.createOrganization = (req, res) => {
    return res.status(410).json({
        success: false,
        message: "[DEPRECATED] Use POST /api/platform/organizations (createOrganizationProvisioned).",
        errorCode: "LEGACY_HANDLER_REMOVED"
    });
};

exports.updateOrganizationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        // Accept subscriptionStatus (new) or status (legacy)
        const newStatus = req.body.subscriptionStatus || req.body.status;
        const { isActive } = req.body;

        const organization = await Organization.findById(id);
        if (!organization) {
            return res.status(404).json({ message: "Organization not found" });
        }

        if (newStatus) organization.subscription.status = newStatus;
        if (isActive !== undefined) organization.isActive = isActive;

        await organization.save();

        // Session invalidation on suspension — purge all tenant sessions for this org.
        // Per-org mode: RefreshTokens live in dental_org_<orgId>.
        if (newStatus === "suspended") {
            try {
                const dbManager = require("@core/db/dbManager");
                const getModel = require("@core/db/getModel");
                const RefreshTokenDef = require("@shared/models/RefreshToken");
                const orgConn = dbManager.getConnection(String(organization._id));
                try {
                    const RefreshToken = getModel(orgConn, RefreshTokenDef);
                    await RefreshToken.deleteMany({});
                } finally {
                    try { dbManager.releaseConnection(String(organization._id)); } catch (_) {}
                }
            } catch (err) {
                console.error("[SuspendOrg] Session invalidation failed:", err.message);
            }
        }

        res.json({
            message: "Organization status updated successfully",
            organization: {
                id: organization._id,
                name: organization.name,
                subscription: organization.subscription,
                isActive: organization.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


/**
 * Platform-Wide Global Search (v1)
 * Allows platform admins to search across Organizations, Branches, and Users.
 */
exports.globalSearch = async (req, res) => {
    try {
        let { q } = req.query;

        // 1. Validation & Truncation
        if (!q || q.trim().length < 2) {
            return res.json({
                success: true,
                data: {
                    organizations: [],
                    branches: [],
                    users: [],
                    platformUsers: []
                }
            });
        }

        q = q.trim().substring(0, 50); // Limit to 50 chars for performance

        // 2. Safe Prefix-Anchored Regex
        // Escaping special regex characters and anchoring with ^ to leverage indexes.
        const safeQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp("^" + safeQuery, "i");

        // 3. Parallel Queries (Promise.all) with strict limits and field selection
        // NOTE: Branch and User are per-org entities (dental_org_<id>).
        // Cross-org federated search is a future enhancement.
        // For now, only platform-level entities are searched.
        const [organizations, platformUsers] = await Promise.all([
            Organization.find({
                $or: [{ name: searchRegex }, { slug: searchRegex }]
            })
                .select("_id name slug status currentContractId isActive")
                .sort({ name: 1 })
                .limit(5)
                .lean(),

            PlatformUser.find({
                $or: [{ name: searchRegex }, { email: searchRegex }]
            })
                .select("_id name email role isActive")
                .sort({ name: 1 })
                .limit(5)
                .lean()
        ]);

        // 4. Grouped Response
        res.json({
            success: true,
            data: {
                organizations,
                branches: [],   // TODO: federated cross-org search
                users: [],      // TODO: federated cross-org search
                platformUsers
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Search error: " + error.message });
    }
};
