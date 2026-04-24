/**
 * billingTimeline.controller.js
 * Platform Billing — Timeline Debugging API
 *
 * Endpoints:
 *   GET /api/platform/contracts/:contractId/timeline  — contract-level timeline
 *   GET /api/platform/billing/timeline/:orgId         — org-level timeline
 *
 * Returns the last 100 BillingTimeline events, sorted newest first.
 * Protected by platformProtect + VIEW_BILLING capability.
 *
 * PLANE: Platform
 */

"use strict";

/**
 * @swagger
 * /api/platform/contracts/{contractId}/timeline:
 *   get:
 *     summary: Get billing timeline for a contract
 *     description: Returns the last 100 BillingTimeline projection events for a specific contract.
 *     tags: [Billing Timeline]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *         description: OrgContract _id
 *     responses:
 *       200:
 *         description: Timeline events returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contractId:
 *                   type: string
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const getPlatformModel = require("@core/db/getPlatformModel");
const BillingTimelineDef = require("../models/BillingTimeline.model");
let _BillingTimeline_cache = null;
function BillingTimeline() {
    return _BillingTimeline_cache || (_BillingTimeline_cache = getPlatformModel(BillingTimelineDef));
}
const mongoose = require("mongoose");

/**
 * GET /api/platform/contracts/:contractId/timeline
 * Returns the last 100 timeline events for a specific contract.
 */
exports.getContractTimeline = async (req, res) => {
  const {
    contractId
  } = req.params;
  if (!mongoose.isValidObjectId(contractId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid contractId format"
    });
  }
  const events = await BillingTimeline().find({
    contractId
  }).sort({
    occurredAt: -1
  }).limit(100).lean();
  return res.json({
    success: true,
    contractId,
    count: events.length,
    data: events
  });
};

/**
 * @swagger
 * /api/platform/billing/timeline/{orgId}:
 *   get:
 *     summary: Get billing timeline for an organization
 *     description: Returns the last 100 BillingTimeline projection events for a specific organization.
 *     tags: [Billing Timeline]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization _id
 *     responses:
 *       200:
 *         description: Timeline events returned successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * GET /api/platform/billing/timeline/:orgId
 * Returns the last 100 timeline events for an organization.
 */
exports.getOrgTimeline = async (req, res) => {
  const {
    orgId
  } = req.params;
  if (!mongoose.isValidObjectId(orgId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid orgId format"
    });
  }
  const events = await BillingTimeline().find({
    organizationId: orgId
  }).sort({
    occurredAt: -1
  }).limit(100).lean();
  return res.json({
    success: true,
    orgId,
    count: events.length,
    data: events
  });
};