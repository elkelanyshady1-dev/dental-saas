/**
 * dashboard.controller.js — Supervisor Dashboard Controller
 *
 * Endpoints:
 *   GET /supervisor/dashboard       — Multi-org dashboard aggregation
 *   GET /supervisor/cases           — Paginated case list
 *   GET /supervisor/cases/:caseId   — Case detail (requires CaseAccess)
 *
 * PLANE: Supervisor only.
 */

"use strict";

const dashboardService = require("../services/dashboard.service");
const logger = require("@utils/logger");

/**
 * GET /supervisor/dashboard
 * Multi-org case aggregation dashboard.
 */
async function getDashboard(req, res) {
  try {
    const data = await dashboardService.getDashboard(req.supervisor.supervisorId);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error({
      event: "SUPERVISOR_DASHBOARD_ERROR",
      error: error.message,
      supervisorId: req.supervisor?.supervisorId
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /supervisor/cases
 * Paginated list of accessible cases.
 * Query params: page, limit, status, organizationId
 */
async function listCases(req, res) {
  try {
    const {
      page,
      limit,
      status,
      organizationId
    } = req.query;
    const data = await dashboardService.listCases({
      supervisorId: req.supervisor.supervisorId,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 50),
      status
    });
    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error({
      event: "SUPERVISOR_LIST_CASES_ERROR",
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /supervisor/cases/:caseId
 * Get full case detail with reviews and supervisors.
 * Requires: supervisorAccessGuard (validates CaseAccess).
 */
async function getCaseDetail(req, res) {
  try {
    const data = await dashboardService.getCaseDetail({
      caseId: req.params.caseId,
      caseAccess: req.caseAccess
    });
    res.json({
      success: true,
      data
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}
module.exports = {
  getDashboard,
  listCases,
  getCaseDetail
};