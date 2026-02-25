const Organization = require("../models/Organization");
const computeSubscriptionHealth = require("../utils/subscriptionHealth");

exports.getOrganizationSettings = async (req, res) => {
    try {
        const org = await Organization.findById(req.organizationId);
        if (!org) {
            return res.status(404).json({ success: false, message: "Organization not found" });
        }

        const health = computeSubscriptionHealth(org.subscription);

        res.json({
            success: true,
            data: {
                profile: {
                    name: org.name,
                    slug: org.slug,
                    logo: org.organizationSettings.branding.logo,
                    primaryColor: org.organizationSettings.branding.primaryColor,
                },
                subscription: {
                    status: org.subscription.status,
                    tier: org.subscription.tier,
                    trialEndsAt: org.subscription.trialEndsAt,
                    daysRemaining: health?.daysRemaining || 0,
                    isExpired: health?.isExpired || false,
                },
                billingPlaceholder: {
                    nextBillingDate: org.subscription.currentPeriodEnd,
                    lastPayment: null, // Future: Integration with payments
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateOrganizationSettings = async (req, res) => {
    try {
        const { name, logo, primaryColor } = req.body;
        const org = await Organization.findById(req.organizationId);

        if (!org) {
            return res.status(404).json({ success: false, message: "Organization not found" });
        }

        if (name) org.name = name;
        if (logo) org.organizationSettings.branding.logo = logo;
        if (primaryColor) org.organizationSettings.branding.primaryColor = primaryColor;

        await org.save();

        res.json({
            success: true,
            message: "Organization settings updated successfully",
            data: {
                name: org.name,
                branding: org.organizationSettings.branding
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
