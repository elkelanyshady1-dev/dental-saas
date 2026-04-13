"use strict";

const getModel = require("../../core/db/getModel");

// ── Model Definitions (schema + modelName only — NO .default) ──────────────
const OrganizationDef = require("../../shared/models/Organization");
const { loadActiveContractForOrg } = require("../../shared/services/orgContractReader");

// ─── getOrganizationSettings ──────────────────────────────────────────────────
// Sprint 5: commercial data sourced from OrgContract (currentContractId).
// org.subscription.tier removed — planCode now from contract.
// ─────────────────────────────────────────────────────────────────────────────
exports.getOrganizationSettings = async (req, res) => {
    try {
        // Organization is a PLATFORM model — always use platform connection
        const Organization = OrganizationDef.default;

        const org = await Organization.findById(req.organizationId).lean();
        if (!org) {
            return res.status(404).json({ success: false, message: "Organization not found" });
        }

        // Resolve commercial context from OrgContract (Sprint 5 — strict mode)
        const contract = await loadActiveContractForOrg(org._id);
        const planCode = contract?.planCode || null;
        const contractStatus = contract?.contractStatus || null;
        const effectiveTo = contract?.effectiveTo || null;
        const trialEndDate = contract?.trialEndDate || org.trialEndDate || null;

        res.json({
            success: true,
            data: {
                profile: {
                    name: org.name,
                    slug: org.slug,
                    logo: org.organizationSettings?.branding?.logo || null,
                    primaryColor: org.organizationSettings?.branding?.primaryColor || null,
                },
                // Sprint 5: sourced from OrgContract — no subscription.* fields
                subscription: {
                    status: org.status,
                    planCode,
                    contractStatus,
                    trialEndDate,
                    effectiveTo,
                },
                billingPlaceholder: {
                    // Sprint 6: wire to PlatformInvoice.dueDate
                    nextBillingDate: effectiveTo,
                    lastPayment: null,
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── updateOrganizationSettings ───────────────────────────────────────────────
exports.updateOrganizationSettings = async (req, res) => {
    try {
        const { name, logo, primaryColor } = req.body;

        // Organization is a PLATFORM model — always use platform connection
        const Organization = OrganizationDef.default;

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
