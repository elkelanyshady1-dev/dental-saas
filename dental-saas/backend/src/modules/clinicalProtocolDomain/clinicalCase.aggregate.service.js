/**
 * clinicalCase.aggregate.service.js — Sovereign Clinical Case Aggregate
 * v4.5 — Sovereign Data Governance
 *
 * @per-org-transactional — Session-bound transactional aggregate root.
 * organizationId sourced from controller (JWT-validated).
 * Atomic case creation requires raw session for ACID safety.
 */

"use strict";

const dbManager = require("../../core/db/dbManager");
const getModel = require("../../core/db/getModel");
const { ClinicalCaseDef } = require("./models/SCPEModels");
const eventBus = require("../../core/eventBus");
const {
  CLINICAL_CASE_CREATED
} = require("../../core/domainEvents");
class ClinicalCaseAggregateService {
  /**
   * createCase()
   * Atomic creation of a clinical case.
   * @param {Object} params
   * @param {import('mongoose').Connection} [params.dbConnection] — per-org DB connection
   */
  async createCase({
    organizationId,
    patientId,
    protocolId,
    doctorId,
    extensionData = {},
    dbConnection
  }) {
    const conn = dbConnection || dbManager.getConnection(organizationId);
    const ClinicalCase = getModel(conn, ClinicalCaseDef);
    const session = await conn.startSession();
    let clinicalCase;
    try {
      await session.withTransaction(async () => {
        clinicalCase = new ClinicalCase({
          patientId,
          protocolId,
          responsibleDoctorId: doctorId,
          extensionData,
          status: "ACTIVE"
        });
        await clinicalCase.save({
          session
        });
      });
    } finally {
      await session.endSession();
      if (!dbConnection) {
        try {
          dbManager.releaseConnection(organizationId);
        } catch (_) {}
      }
    }

    // Emit post-commit (v4.5 requirement)
    if (clinicalCase) {
      eventBus.emit(CLINICAL_CASE_CREATED, {
        patientId,
        doctorId,
        caseId: clinicalCase._id
      }, "clinicalCase.aggregate.service");
    }
    return clinicalCase;
  }
}
module.exports = new ClinicalCaseAggregateService();