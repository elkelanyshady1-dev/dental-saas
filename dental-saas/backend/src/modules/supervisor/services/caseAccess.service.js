/**
 * caseAccess.service.js — CaseAccess Management Service
 *
 * Manages CaseAccess records (the cross-org bridge):
 *   - List active access for a supervisor
 *   - Revoke access (org-side or supervisor-side)
 *   - Check access (used by middleware)
 *
 * PLANE: Bridge (org creates via invitation, supervisor consumes).
 */

"use strict";

const CaseAccessDef = require("../models/CaseAccess");
const getModel = require("../../../core/db/getModel");
const {
  getPlatformConnection
} = require("../../../core/db/dbResolver");
const logger = require("@utils/logger");
function _getCaseAccess() {
  return getModel(getPlatformConnection(), CaseAccessDef);
}
class CaseAccessService {
  /**
   * List all active CaseAccess records for a supervisor.
   * @param {string} supervisorId
   * @returns {object[]} access records
   */
  async listBySupervisor(supervisorId) {
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    return _getCaseAccess().find({
      supervisorId,
      status: "ACTIVE"
    }).populate("caseId", "patientId status caseType malocclusionClass").sort({
      createdAt: -1
    }).lean();
  }

  /**
   * List all supervisors with access to a specific case.
   * @param {{ caseId: string, organizationId: string }} params
   * @returns {object[]} access records
   */
  async listByCase({
    caseId,
    organizationId
  }) {
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    return _getCaseAccess().find({
      caseId,
      status: "ACTIVE"
    }).populate("supervisorId", "name email title institution").lean();
  }

  /**
   * Revoke a supervisor's access to a case.
   * @param {{ accessId: string, revokedBy: string }} params
   * @returns {object} updated record
   */
  async revokeAccess({
    accessId,
    revokedBy
  }) {
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const access = await _getCaseAccess().findById(accessId);
    if (!access) {
      const err = new Error("Access record not found.");
      err.statusCode = 404;
      throw err;
    }
    if (access.status !== "ACTIVE") {
      const err = new Error("Access is already revoked.");
      err.statusCode = 400;
      throw err;
    }
    access.status = "REVOKED";
    access.revokedAt = new Date();
    access.revokedBy = revokedBy;
    await access.save();
    logger.info({
      event: "CASE_ACCESS_REVOKED",
      accessId: access._id,
      caseId: access.caseId,
      supervisorId: access.supervisorId,
      revokedBy
    });
    return access;
  }

  /**
   * Check if a supervisor has active access to a specific case.
   * @param {{ supervisorId: string, caseId: string }} params
   * @returns {object|null} access record or null
   */
  async checkAccess({
    supervisorId,
    caseId
  }) {
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    return _getCaseAccess().findOne({
      supervisorId,
      caseId,
      status: "ACTIVE"
    }).lean();
  }
}
module.exports = new CaseAccessService();