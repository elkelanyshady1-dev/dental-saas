const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const Branch = require("../models/Branch");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const featureService = require("./featureService");
const initializeRolesForOrganization = require("../utils/roleInitializer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const logger = require("../utils/logger");
const { getCountryCode } = require("../utils/countryMapping");

exports.provisionOrganization = async (data, platformUserId, ip, userAgent) => {
    const { organizationName, slug, plan, status, adminEmail, trialDays, country } = data;

    if (!organizationName || !adminEmail || !country) {
        throw new Error("Organization name, Admin email, and Country are required");
    }

    const countryCode = getCountryCode(country);
    if (!countryCode) {
        throw new Error("Invalid country selected");
    }

    const session = await mongoose.startSession();
    // ... rest of function ...
    session.startTransaction();

    try {
        // 1. Validate uniqueness
        const existingOrg = await Organization.findOne({
            $or: [
                { name: organizationName },
                ...(slug ? [{ slug }] : [])
            ]
        }).session(session);

        if (existingOrg) {
            throw new Error("Organization name or slug already in use");
        }

        const now = new Date();
        const trialPeriod = parseInt(trialDays) || 14;

        // 2. Create Organization document
        const [organization] = await Organization.create([{
            name: organizationName,
            slug: slug || undefined,
            ownerId: platformUserId,
            country,
            countryCode,
            isActive: status !== "suspended",
            subscription: {
                plan: plan || "basic",
                status: status || "trial",
                trialEndsAt: new Date(now.getTime() + trialPeriod * 24 * 60 * 60 * 1000),
            },
        }], { session });

        // 3. Apply explicit Service bounds
        await featureService.initializeOrgFeatures(organization);
        await featureService.applyPlanFeatures(organization);
        // Save explicitly with session context
        await organization.save({ session });

        // 4. Initialize First Branch
        const [branch] = await Branch.create([{
            name: `${organizationName} Main Branch`,
            organizationId: organization._id,
            type: "internal",
        }], { session });

        // 5. Initialize Roles
        const roles = await initializeRolesForOrganization(organization._id, session);

        // 6. Generate temporary password
        const tempPassword = crypto.randomBytes(8).toString("hex");
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // 7. Create default org admin
        const [adminUser] = await User.create([{
            name: "Organization Admin",
            email: adminEmail,
            password: hashedPassword,
            mustChangePassword: true,
            roleId: roles.org_admin._id,
            platformRole: null,
            organizationId: organization._id,
            branchAccess: [branch._id],
            hasFullBranchAccess: true,
        }], { session });

        // 8. Audit Logging
        await AuditLog.create([{
            organizationId: organization._id,
            actorId: platformUserId,
            actorType: "platform_user",
            action: "ORG_CREATED",
            success: true,
            details: `Provisioned enterprise org: ${organizationName} on ${plan} plan.`,
            ipAddress: ip,
            userAgent: userAgent,
        }], { session });

        await session.commitTransaction();
        session.endSession();

        logger.info({ orgId: organization._id }, `Successfully provisioned organization ${organizationName}`);

        return {
            organization,
            adminUser: { id: adminUser._id, email: adminUser.email },
            tempPassword
        };
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error({ err: error }, `Failed to provision organization ${organizationName}`);
        throw error;
    }
};
