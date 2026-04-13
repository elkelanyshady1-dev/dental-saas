/**
 * trial.controller.js
 * v20.1 Phase 3 — Trial System Unified
 */

"use strict";

const Organization = require("@shared/models/Organization").default;

/**
 * GET /api/platform/trials
 * Retrieves all active trial organizations.
 */
exports.getTrials = async (req, res) => {
    try {
        // v20.1 Phase 3 — Unified: use subscription.status instead of legacy trial subdocument
        const trials = await Organization.find({ "subscription.status": "trial" })
            .select("name slug subscription.trialEndsAt subscription.status ownerId createdAt isActive")
            .sort({ "subscription.trialEndsAt": 1 }); // Sort by ending soonest

        res.json({
            message: "Active trials retrieved",
            count: trials.length,
            data: trials
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to retrieve trials", error: err.message });
    }
};
