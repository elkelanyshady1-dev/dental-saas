/**
 * refund.routes.js — Patient Refund HTTP Routes
 * Billing Domain — Phase D (Refund Engine)
 *
 * Provides RBAC-guarded endpoints for processing and viewing refunds.
 *
 * Mounted at: /api/v1/org/refunds
 * Guards: orgProtect → organizationContext → subscriptionGuard → requireEntitlement → requireOrgPermission
 *
 * PLANE: Org only.
 */

"use strict";

const express = require("express");
const router = express.Router();
const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const {
  P
} = require("@rbac/orgPermissions");
const policyMiddleware = require("@rbac/policyMiddleware");
const requireEntitlement = require("@middleware/requireEntitlement");
const {
  autoAudit
} = require("@middleware/auditInterceptor");
const validate = require("@middleware/validate");
const {
  processRefundSchema
} = require("./refund.validator");
const refundService = require("./refund.service");
const logger = require("@utils/logger");

// Phase X.2.2 — subscriptionGuard removed (requireEntitlement in moduleLoader is SSOT).
router.use(orgProtect, organizationContext, requireEntitlement("finance"), autoAudit("Refund"));

/**
 * POST /api/v1/org/refunds
 * Process a new refund.
 *
 * @access org_admin only
 * @body { paymentId, amount, reason }
 */
router.post("/", requireOrgPermission(P.REFUNDS_CREATE), policyMiddleware(P.REFUNDS_CREATE), validate(processRefundSchema), async (req, res, next) => {
  try {
    const {
      paymentId,
      amount,
      reason
    } = req.body;
    const refund = await refundService.processRefund({
      paymentId,
      amount,
      reason,
      processedByUserId: req.user._id
    }, req);
    logger.info({
      refundId: refund._id,
      paymentId,
      amount
    }, "[RefundRoute] Refund processed");
    res.status(201).json({
      success: true,
      data: refund
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/org/refunds
 * List refunds for the organization.
 *
 * @access org_admin only
 * @query { patientId?, limit?, skip? }
 */
router.get("/", requireOrgPermission(P.REFUNDS_READ), policyMiddleware(P.REFUNDS_READ), async (req, res, next) => {
  try {
    const {
      patientId,
      limit,
      skip
    } = req.query;
    const refunds = await refundService.getRefunds({
      patientId,
      limit: parseInt(limit || "50", 10),
      skip: parseInt(skip || "0", 10)
    }, req);
    res.json({
      success: true,
      data: refunds,
      count: refunds.length
    });
  } catch (err) {
    next(err);
  }
});
module.exports = router;