/**
 * campaign.controller.js
 * Phase v6.2 — Promotional Campaigns
 */

"use strict";

const campaignAggregateService = require("../services/platformCampaign.aggregate.service");
const { createAuditRecord } = require("../../../services/auditService");

/**
 * POST /api/platform/campaigns
 * Create a new campaign
 */
exports.createCampaign = async (req, res) => {
    try {
        const campaign = await campaignAggregateService.createCampaign(req.body);

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000", // Platform level
            actorId: req.user.userId,
            actorType: "platform_user",
            action: "CAMPAIGN_CREATED",
            entity: "campaign",
            entityId: campaign._id,
            details: { name: campaign.name, type: campaign.discountType },
            success: true
        });

        res.status(201).json({ message: "Campaign created", data: campaign });
    } catch (err) {
        res.status(500).json({ message: "Failed to create campaign", error: err.message });
    }
};

/**
 * PUT /api/platform/campaigns/:id
 * Update an existing campaign (OAV protected)
 */
exports.updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { version, ...updateData } = req.body;

        const campaign = await campaignAggregateService.updateCampaign(id, version, updateData);

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.user.userId,
            actorType: "platform_user",
            action: "CAMPAIGN_UPDATED",
            entity: "campaign",
            entityId: campaign._id,
            success: true
        });

        res.json({ message: "Campaign updated", data: campaign });
    } catch (err) {
        if (err.message === "CAMPAIGN_NOT_FOUND") return res.status(404).json({ message: "Campaign not found" });
        if (err.message === "CAMPAIGN_VERSION_CONFLICT") return res.status(409).json({ message: "Conflict: Campaign was updated by another request" });
        res.status(500).json({ message: "Failed to update campaign", error: err.message });
    }
};
