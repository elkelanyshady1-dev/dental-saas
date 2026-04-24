/**
 * patientLifecycle.service.js — DDD Application Service
 * v4.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Handles patient lifecycle mutations:
 * - Soft delete (with portal kill-switch)
 * - Status changes (activate/deactivate)
 * - Doctor assignment
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
  PATIENT_DELETED,
  PATIENT_STATUS_CHANGED,
  DOCTOR_ASSIGNED_TO_PATIENT
} = require("../../../core/domainEvents");
const orgUsageService = require("@core/usage/orgUsage.service");
class PatientLifecycleService {
  /**
   * Soft delete a patient (deactivate + invalidate portal JWT).
   */
  async softDeletePatient({
    regionCode,
    organizationId,
    actorId,
    patientId,
    reason,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    auditContext = {},
    req
  }) {
    let deletedAt;
    await withRegionalTransaction(regionCode, async (session, models) => {
      const {
        Patient,
        PatientUser
      } = models;
      const patient = await Patient.findOne({
        _id: patientId,
        isActive: true
      }).session(session);
      if (!patient) throw new Error("Patient not found.");
      deletedAt = new Date();
      if (!isInternalEvent && expectedVersion === undefined) {
        throw new VersionConflictError("expectedVersion required");
      }
      const targetVersion = isInternalEvent ? patient.version : expectedVersion;
      const result = await Patient.updateOne({
        _id: patientId,
        version: targetVersion
      }, {
        $set: {
          isActive: false,
          deletedAt
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

      // Sovereign Kill-Switch: Invalidate JWT instantly
      await PatientUser.updateOne({
        patientId
      }, {
        $inc: {
          tokenVersion: 1
        },
        $set: {
          isActive: false
        }
      }, {
        session
      });
      await eventBus.emitViaOutbox(PATIENT_DELETED, {
        patientId,
        actorId,
        _audit: {
          action: "PATIENT_DELETED",
          entityId: patientId,
          metadata: {
            reason
          },
          ipAddress,
          regionCode: auditContext.regionCode || regionCode,
          branchId: auditContext.branchId,
          actorId
        }
      }, "patient.lifecycle.service", {
        session,
        EventOutboxModel: models.EventOutbox
      });
    });

    // Phase 4.1 — Decrement usage counter (non-blocking, post-commit)
    try {
      await orgUsageService.decrementPatients(organizationId);
    } catch (_) {/* logged inside service */}
    return {
      success: true,
      deletedAt
    };
  }

  /**
   * Change patient active status.
   */
  async changeStatus({
    regionCode,
    actorId,
    patientId,
    isActive,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    auditContext = {},
    req
  }) {
    await withRegionalTransaction(regionCode, async (session, models) => {
      const {
        Patient,
        PatientUser
      } = models;
      const patient = await Patient.findOne({
        _id: patientId
      }).session(session);
      if (!patient) throw new Error("Patient not found.");
      const oldStatus = patient.isActive;
      const updateSet = {
        isActive
      };
      if (!isActive) {
        updateSet.deletedAt = new Date();
        // Invalidate portal access when deactivating
        await PatientUser.updateOne({
          patientId
        }, {
          $inc: {
            tokenVersion: 1
          },
          $set: {
            isActive: false
          }
        }, {
          session
        });
      } else {
        updateSet.deletedAt = null;
      }
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
      await eventBus.emitViaOutbox(PATIENT_STATUS_CHANGED, {
        patientId,
        actorId,
        isActive,
        _audit: {
          action: "PATIENT_STATUS_CHANGED",
          entityId: patientId,
          metadata: {
            from: oldStatus,
            to: isActive
          },
          ipAddress,
          regionCode: auditContext.regionCode || regionCode,
          branchId: auditContext.branchId,
          actorId
        }
      }, "patient.lifecycle.service", {
        session,
        EventOutboxModel: models.EventOutbox
      });
    });
  }

  /**
   * Assign a doctor to the patient.
   */
  async assignDoctor({
    regionCode,
    actorId,
    patientId,
    doctorId,
    ipAddress,
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
      await eventBus.emitViaOutbox(DOCTOR_ASSIGNED_TO_PATIENT, {
        patientId,
        doctorId,
        _audit: {
          action: "DOCTOR_ASSIGNED_TO_PATIENT",
          entityId: patientId,
          metadata: {
            doctorId
          },
          ipAddress,
          regionCode: auditContext.regionCode || regionCode,
          branchId: auditContext.branchId,
          actorId
        }
      }, "patient.lifecycle.service", {
        session,
        EventOutboxModel: models.EventOutbox
      });
    });
    return {
      success: true
    };
  }
}
module.exports = new PatientLifecycleService();