const bcrypt = require("bcryptjs");
const Organization = require("../models/Organization");
const Branch = require("../models/Branch");
const User = require("../models/User");
const PlatformUser = require("../models/PlatformUser");
const initializeRolesForOrganization = require("../utils/roleInitializer");
const featureService = require("../services/featureService");
const { getCountryCode } = require("../utils/countryMapping");

exports.getOrganizations = async (req, res) => {
    // ... existing getOrganizations ...
    try {
        const organizations = await Organization.find({})
            .sort({ createdAt: -1 })
            .lean();

        res.json(organizations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


exports.createOrganization = async (req, res) => {
    try {

        const {
            organizationName,
            adminName,
            adminEmail,
            adminPassword,
            country
        } = req.body;

        if (!country) {
            return res.status(400).json({ message: "Country is required" });
        }

        const countryCode = getCountryCode(country);
        if (!countryCode) {
            return res.status(400).json({ message: "Invalid country" });
        }

        const now = new Date();

        // 1️⃣ Create Organization — set explicit trial end date
        const organization = await Organization.create({
            name: organizationName,
            ownerId: req.platformUser._id,
            country,
            countryCode,
            subscription: {
                plan: "basic",
                status: "trial",
                trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
            },
        });

        // Initialize features based on plan
        await featureService.initializeOrgFeatures(organization);
        await organization.save();

        // 2️⃣ Create First Branch
        const branch = await Branch.create({
            name: `${organizationName} Main Branch`,
            organizationId: organization._id,
            type: "internal",
        });

        // 3️⃣ Initialize Roles
        const roles = await initializeRolesForOrganization(organization._id);

        // 4️⃣ Hash Password
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // 5️⃣ Create Org Admin User
        const orgAdmin = await User.create({
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            roleId: roles.org_admin._id,
            platformRole: null,
            organizationId: organization._id,
            branchAccess: [branch._id],
            hasFullBranchAccess: true,
        });

        res.status(201).json({
            message: "Organization created successfully",
            organization,
            branch,
            orgAdmin: {
                id: orgAdmin._id,
                name: orgAdmin.name,
                email: orgAdmin.email,
            },
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
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

exports.updateOrganizationPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const newPlan = req.body.subscriptionPlan || req.body.plan;

        const organization = await Organization.findById(id);
        if (!organization) {
            return res.status(404).json({ message: "Organization not found" });
        }

        if (newPlan) organization.subscription.plan = newPlan;

        await organization.save();

        res.json({
            message: "Organization plan updated successfully",
            organization: {
                id: organization._id,
                name: organization.name,
                subscription: organization.subscription,
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
        const [organizations, branches, users, platformUsers] = await Promise.all([
            Organization.find({
                $or: [{ name: searchRegex }, { slug: searchRegex }]
            })
                .select("_id name slug subscription.tier isActive")
                .sort({ name: 1 })
                .limit(5)
                .lean(),

            Branch.find({ name: searchRegex })
                .select("_id name organizationId")
                .sort({ name: 1 })
                .limit(5)
                .lean(),

            User.find({
                $or: [{ name: searchRegex }, { email: searchRegex }]
            })
                .select("_id name email organizationId roleId isActive")
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
                branches,
                users,
                platformUsers
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Search error: " + error.message });
    }
};
