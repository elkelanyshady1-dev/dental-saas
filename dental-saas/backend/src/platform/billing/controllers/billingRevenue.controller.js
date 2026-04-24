/**
 * billingRevenue.controller.js
 * Platform Finance — Revenue Analytics API
 *
 * GET /billing/revenue
 *
 * Returns:
 *   MRR, ARR, churnRate, activeSubscriptions, pastDueSubscriptions,
 *   recognizedRevenue, deferredRevenue
 *
 * Data sources:
 *   - OrgContract (active/canceled counts)
 *   - RevenueSchedule (recognized/deferred totals)
 *   - renewalDashboard.projection (MRR/ARR)
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrgContractDef = require("../../billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const RevenueScheduleDef = require("../../finance/models/RevenueSchedule.model");
const RevenueSchedule = getPlatformModel(RevenueScheduleDef);
const {
  getRenewalDashboardMetrics
} = require("../../../projections/renewalDashboard.projection");
const logger = require("@utils/logger");

// ─── GET /billing/revenue ─────────────────────────────────────────────────────
exports.getMetrics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // ── Active subscription count ──────────────────────────────────────────
    const activeSubscriptions = await OrgContract.countDocuments({
      contractStatus: "active"
    });

    // ── Past-due (active contracts in dunning) ────────────────────────────
    const pastDueSubscriptions = await OrgContract.countDocuments({
      contractStatus: "active",
      dunning: {
        $ne: null
      },
      "dunning.retryCount": {
        $gt: 0
      }
    });

    // ── Churn rate calculation ─────────────────────────────────────────────
    // canceledThisMonth / activeAtStartOfMonth
    const [canceledThisMonth, activeAtStartOfMonth] = await Promise.all([OrgContract.countDocuments({
      contractStatus: "canceled",
      updatedAt: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    }), OrgContract.countDocuments({
      contractStatus: "active",
      createdAt: {
        $lte: startOfMonth
      }
    })]);
    const churnRate = activeAtStartOfMonth > 0 ? Math.round(canceledThisMonth / activeAtStartOfMonth * 10000) / 100 // percentage to 2dp
    : 0;

    // ── Revenue recognition totals from RevenueSchedule ───────────────────
    const [revenueAgg] = await RevenueSchedule.aggregate([{
      $match: {
        status: {
          $in: ["active", "fully_recognized"]
        }
      }
    }, {
      $group: {
        _id: null,
        recognizedRevenue: {
          $sum: "$recognizedAmount"
        },
        deferredRevenue: {
          $sum: "$deferredAmount"
        }
      }
    }]);
    const recognizedRevenue = revenueAgg?.recognizedRevenue ?? 0;
    const deferredRevenue = revenueAgg?.deferredRevenue ?? 0;

    // ── MRR / ARR from existing dashboard projection ───────────────────────
    let MRR = 0;
    let ARR = 0;
    let baseCurrency = "USD";
    try {
      const dashMetrics = await getRenewalDashboardMetrics();
      MRR = dashMetrics?.MRRBaseCurrency ?? 0;
      ARR = dashMetrics?.ARRBaseCurrency ?? 0;
      baseCurrency = dashMetrics?.baseCurrency ?? "USD";
    } catch (dashErr) {
      logger.warn({
        dashErr
      }, "[billingRevenue] renewalDashboard metrics unavailable — MRR/ARR defaulted to 0");
    }
    return res.json({
      success: true,
      data: {
        MRR,
        ARR,
        baseCurrency,
        churnRate,
        activeSubscriptions,
        pastDueSubscriptions,
        recognizedRevenue,
        deferredRevenue,
        churnCalculation: {
          canceledThisMonth,
          activeAtStartOfMonth,
          month: startOfMonth.toISOString().slice(0, 7)
        },
        generatedAt: now.toISOString()
      },
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[billingRevenue] getMetrics failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      requestId: req.requestId
    });
  }
};