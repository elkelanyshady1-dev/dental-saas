/**
 * requireActiveVisit.js — Phase 2: Visit Context Enforcement Middleware
 *
 * ROLE:
 *   Ensures an active visit session exists for the case BEFORE any clinical
 *   mutation is executed. Injects it into req.activeVisit for downstream use.
 *
 * USAGE:
 *   router.post('/bonding', authorize('bonding.manage'), requireActiveVisit, ctrl.applyBonding);
 *
 * CONTRACT:
 *   - Reads caseId from req.body.caseId OR req.params.caseId (in that priority order).
 *   - On success:  sets req.activeVisit = { _id, caseId, ... }  and calls next()
 *   - On failure:  returns 409 NO_ACTIVE_VISIT
 *
 * INVARIANT:
 *   - organizationId ALWAYS from req.context (JWT SSOT — never from body).
 *   - Only checks ACTIVE visits (status: "active").
 *   - Never creates or closes visits — lifecycle handled by visitSession routes.
 */

"use strict";

const visitSessionService = require("../modules/orthodontics/services/visitSession.service");
const logger              = require("@utils/logger");

/**
 * Express middleware: asserts an active visit session for the current case.
 *
 * Sets req.activeVisit = VisitRecord (lean plain object).
 *
 * @param {Request}  req
 * @param {Response} res
 * @param {Function} next
 */
async function requireActiveVisit(req, res, next) {
  try {
    // Resolve caseId from body first (mutation payloads), then params (/:caseId routes)
    const caseId = req.body?.caseId ?? req.params?.caseId ?? null;

    if (!caseId) {
      return res.status(400).json({
        success: false,
        error: {
          code:    "VALIDATION_ERROR",
          message: "caseId is required to enforce active visit session",
        },
      });
    }

    const visit = await visitSessionService.getActiveVisit(req, caseId);

    if (!visit) {
      logger.warn({
        event:  "NO_ACTIVE_VISIT",
        caseId,
        orgId:  req.context.organizationId,
        userId: req.context.userId,
        path:   req.originalUrl,
        method: req.method,
      }, "[requireActiveVisit] No active visit — mutation BLOCKED");

      return res.status(409).json({
        success: false,
        error: {
          code:    "NO_ACTIVE_VISIT",
          message: "No active visit session found. Start a visit before making clinical changes.",
          hint:    "POST /api/v1/org/visit-sessions/:caseId/start to open a session.",
        },
      });
    }

    // Inject active visit into request for use by controllers and services
    req.activeVisit = visit;

    logger.debug({
      event:   "ACTIVE_VISIT_RESOLVED",
      visitId: visit._id,
      caseId,
      orgId:   req.context.organizationId,
    });

    next();
  } catch (err) {
    logger.error({
      event:  "REQUIRE_ACTIVE_VISIT_ERROR",
      error:  err.message,
      orgId:  req.context?.organizationId,
    });
    next(err);
  }
}

module.exports = requireActiveVisit;
