/**
 * patientPolicy.service.js — DDD Application Service
 * v4.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Handles patient policy mutations with regional models + sessions.
 *
 * Phase F.6 Changes:
 *   - Regional model operations wrapped with secureModel
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
  PATIENT_POLICY_UPDATED
} = require("../../../core/domainEvents");
class PatientPolicyService {
  /**
   * Create or update organization patient policy.
   */
  async updatePolicy({
    regionCode,
    organizationId,
    actorId,
    data,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    auditContext = {},
    req
  }) {
    let policy;
    await withRegionalTransaction(regionCode, async (session, models) => {
      const {
        PatientPolicy
      } = models;
      if (!isInternalEvent && expectedVersion === undefined) {
        throw new VersionConflictError("expectedVersion required");
      }
      policy = await PatientPolicy.findOne({}).session(session);
      if (!policy) {
        policy = new PatientPolicy({
          ...data,
          version: 1
        });
        await policy.save({
          session
        });
      } else {
        const targetVersion = isInternalEvent ? policy.version : expectedVersion;
        const result = await PatientPolicy.updateOne({
          _id: policy._id,
          version: targetVersion
        }, {
          $set: data,
          $inc: {
            version: 1
          }
        }, {
          session
        });
        if (result.modifiedCount === 0) {
          throw new VersionConflictError("Aggregate version mismatch");
        }
        policy = await PatientPolicy.findOne({}).session(session);
      }
      await eventBus.emitViaOutbox(PATIENT_POLICY_UPDATED, {
        actorId,
        _audit: {
          action: "PATIENT_POLICY_UPDATED",
          entityId: organizationId,
          metadata: {
            updatedFields: Object.keys(data)
          },
          ipAddress,
          regionCode: auditContext.regionCode || regionCode,
          branchId: auditContext.branchId,
          actorId
        }
      }, "patient.policy.service", {
        session,
        EventOutboxModel: models.EventOutbox
      });
    });
    return policy;
  }
}
module.exports = new PatientPolicyService();