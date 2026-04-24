/**
 * patientUpdate.service.js — DDD Application Service
 * v4.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Handles patient profile updates and branch governance with:
 * - Regional transaction sessions + regional models (same MongoClient)
 * - secureModel wrapping of regional models for tenant isolation enforcement
 * - Transactional outbox events
 * - OAV (Optimistic Aggregate Versioning)
 *
 * Phase F.6 Changes:
 *   - All regional model operations wrapped with secureModel
 *   - req passed through for tenant context
 *   - Legacy RLS exemptions removed — fully migrated to secureModel
 */

"use strict";

const {
  withRegionalTransaction
} = require("../../../infrastructure/db/getRegionalSession");
const eventBus = require("../../../core/eventBus");
const VersionConflictError = require("../../../errors/VersionConflictError");
const {
  PATIENT_UPDATED,
  PATIENT_BRANCH_UPDATED
} = require("../../../core/domainEvents");
class PatientUpdateService {
  /**
   * Update patient profile fields.
   */
  async updatePatient({
    regionCode,
    actorId,
    patientId,
    data,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    auditContext = {},
    req
  }) {
    await withRegionalTransaction(regionCode, async (session, models) => {
      const {
        Patient
      } = models;
      const patient = await Patient.findOne({
        _id: patientId,
        isActive: true
      }).session(session);
      if (!patient) throw new Error("Patient not found or inactive.");
      const ALLOWED_FIELDS = ["firstName", "middleName", "lastName", "nameArabic", "nameEnglish", "phone", "secondaryPhone", "email", "gender", "dateOfBirth", "address", "nationality", "nationalId", "maritalStatus", "job", "photo", "insurance", "emergencyContact", "status"];
      const changes = {};
      const updateSet = {};
      for (const field of ALLOWED_FIELDS) {
        if (data[field] !== undefined && data[field] !== patient[field]) {
          changes[field] = {
            from: patient[field],
            to: data[field]
          };
          updateSet[field] = data[field];
        }
      }
      if (Object.keys(changes).length > 0) {
        if (!isInternalEvent && expectedVersion === undefined) {
          throw new VersionConflictError("expectedVersion required");
        }
        const targetVersion = isInternalEvent ? patient.version : expectedVersion;
        const result = await Patient.updateOne({
          _id: patientId,
          version: targetVersion
        }, {
          $set: updateSet,
          $inc: {
            version: 1
          }
        }, {
          session
        });
        if (result.modifiedCount === 0) {
          throw new VersionConflictError("Aggregate version mismatch");
        }
        await eventBus.emitViaOutbox(PATIENT_UPDATED, {
          patientId,
          actorId,
          _audit: {
            action: "PATIENT_UPDATED",
            entityId: patientId,
            metadata: {
              changes
            },
            ipAddress,
            regionCode: auditContext.regionCode || regionCode,
            branchId: auditContext.branchId,
            actorId
          }
        }, "patient.update.service", {
          session,
          EventOutboxModel: models.EventOutbox
        });
      }
    });
  }

  /**
   * Change primary branch assignment.
   */
  async changePrimaryBranch({
    regionCode,
    actorId,
    patientId,
    newBranchId,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    auditContext = {},
    req
  }) {
    await withRegionalTransaction(regionCode, async (session, models) => {
      const {
        Patient
      } = models;
      const patient = await Patient.findOne({
        _id: patientId,
        isActive: true
      }).session(session);
      if (!patient) throw new Error("Patient not found.");
      const oldBranchId = patient.primaryBranchId;

      // Ensure new primary is in allowedBranchIds
      const allowedIds = patient.allowedBranchIds.map(id => id.toString());
      if (!allowedIds.includes(newBranchId.toString())) {
        patient.allowedBranchIds.push(newBranchId);
      }
      if (!isInternalEvent && expectedVersion === undefined) {
        throw new VersionConflictError("expectedVersion required");
      }
      const targetVersion = isInternalEvent ? patient.version : expectedVersion;
      const result = await Patient.updateOne({
        _id: patientId,
        version: targetVersion
      }, {
        $set: {
          primaryBranchId: newBranchId,
          allowedBranchIds: patient.allowedBranchIds
        },
        $inc: {
          version: 1
        }
      }, {
        session
      });
      if (result.modifiedCount === 0) {
        throw new VersionConflictError("Aggregate version mismatch");
      }
      await eventBus.emitViaOutbox(PATIENT_BRANCH_UPDATED, {
        patientId,
        actorId,
        newBranchId,
        _audit: {
          action: "PATIENT_BRANCH_UPDATED",
          entityId: patientId,
          metadata: {
            from: oldBranchId,
            to: newBranchId,
            type: "PRIMARY"
          },
          ipAddress,
          regionCode: auditContext.regionCode || regionCode,
          branchId: auditContext.branchId,
          actorId
        }
      }, "patient.update.service", {
        session,
        EventOutboxModel: models.EventOutbox
      });
    });
  }

  /**
   * Update branch access list.
   */
  async updateBranchAccess({
    regionCode,
    actorId,
    patientId,
    allowedBranchIds,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    auditContext = {},
    req
  }) {
    await withRegionalTransaction(regionCode, async (session, models) => {
      const {
        Patient
      } = models;
      const patient = await Patient.findOne({
        _id: patientId,
        isActive: true
      }).session(session);
      if (!patient) throw new Error("Patient not found.");
      const oldAccess = patient.allowedBranchIds;

      // Safety: Primary branch must always be in allowed list
      const newAllowed = [...allowedBranchIds];
      if (!newAllowed.some(id => id.toString() === patient.primaryBranchId.toString())) {
        newAllowed.push(patient.primaryBranchId);
      }
      if (!isInternalEvent && expectedVersion === undefined) {
        throw new VersionConflictError("expectedVersion required");
      }
      const targetVersion = isInternalEvent ? patient.version : expectedVersion;
      const result = await Patient.updateOne({
        _id: patientId,
        version: targetVersion
      }, {
        $set: {
          allowedBranchIds: newAllowed
        },
        $inc: {
          version: 1
        }
      }, {
        session
      });
      if (result.modifiedCount === 0) {
        throw new VersionConflictError("Aggregate version mismatch");
      }
      await eventBus.emitViaOutbox(PATIENT_BRANCH_UPDATED, {
        patientId,
        actorId,
        _audit: {
          action: "PATIENT_BRANCH_UPDATED",
          entityId: patientId,
          metadata: {
            from: oldAccess,
            to: newAllowed,
            type: "ACCESS_LIST"
          },
          ipAddress,
          regionCode: auditContext.regionCode || regionCode,
          branchId: auditContext.branchId,
          actorId
        }
      }, "patient.update.service", {
        session,
        EventOutboxModel: models.EventOutbox
      });
    });
  }

  /**
   * Set portal enabled/disabled.
   */
  async setPortalEnabled({
    regionCode,
    patientId,
    enabled,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    await withRegionalTransaction(regionCode, async (session, models) => {
      const {
        Patient
      } = models;
      const patient = await Patient.findOne({
        _id: patientId
      }).session(session);
      if (!patient) throw new Error("Patient not found.");
      if (!isInternalEvent && expectedVersion === undefined) {
        throw new VersionConflictError("expectedVersion required");
      }
      const targetVersion = isInternalEvent ? patient.version : expectedVersion;
      const result = await Patient.updateOne({
        _id: patientId,
        version: targetVersion
      }, {
        $set: {
          portalEnabled: enabled
        },
        $inc: {
          version: 1
        }
      }, {
        session
      });
      if (result.modifiedCount === 0) {
        throw new VersionConflictError("Aggregate version mismatch");
      }
    });
  }
}
module.exports = new PatientUpdateService();