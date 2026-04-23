/**
 * patientMerge.service.js — Patient Merge/Deduplication Service
 *
 * Merges two patient records by moving all related records from
 * the source patient to the target patient, then soft-deleting
 * the source. Runs entirely within a single MongoDB transaction.
 *
 * INVARIANTS:
 * 1. Both patients MUST exist and be active
 * 2. Source and target MUST be different
 * 3. Entire operation runs in a single session (atomic)
 * 4. Source is soft-deleted after merge
 * 5. PATIENT_MERGED event emitted via outbox
 *
 * SECURITY:
 * - Requires STAFF_MANAGE permission (checked at controller level)
 * - Ownership verified for both patients
 *
 * PLANE: Org only.
 *
 * @per-org-transactional — single session, explicit connection
 */

"use strict";

const mongoose = require("mongoose");
const {
  v4: uuidv4
} = require("uuid");

// Model definitions for reassignment
const PatientDef = require("../../../organization/patient/models/patient.model");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const ClinicalRecordDef = require("../clinical/clinical.model");
const PatientInvoiceDef = require("../../billingDomain/organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("../../billingDomain/organizationFinance/models/PatientPayment.model");
const PaymentAllocationDef = require("../../billingDomain/organizationFinance/models/PaymentAllocation.model");
const RefundDef = require("../../billingDomain/refunds/Refund.model");
const FinancialLedgerDef = require("../../billingDomain/organizationFinance/models/FinancialLedger.model");
const FinancialSnapshotDef = require("../../billingDomain/projections/snapshot/FinancialSnapshot.model");
const PatientWalletDef = require("../../billingDomain/organizationFinance/models/PatientWallet.model");
const WalletTransactionDef = require("../../billingDomain/organizationFinance/models/WalletTransaction.model");
const PatientUserDef = require("../access/patientUser.model");
const getModel = require("../../../core/db/getModel");
const outboxService = require("../../../core/outbox/outbox.service");
const {
  PATIENT_MERGED
} = require("../../../core/domainEvents");
const logger = require("@utils/logger");

/**
 * Collections that contain a `patientId` field to be reassigned.
 * Each entry: { def, name } — used for bulk updateMany.
 */
const REASSIGN_COLLECTIONS = [{
  def: AppointmentDef,
  name: "Appointment"
}, {
  def: ClinicalRecordDef,
  name: "ClinicalRecord"
}, {
  def: PatientInvoiceDef,
  name: "PatientInvoice"
}, {
  def: PatientPaymentDef,
  name: "PatientPayment"
}, {
  def: PaymentAllocationDef,
  name: "PaymentAllocation"
}, {
  def: RefundDef,
  name: "Refund"
}, {
  def: FinancialLedgerDef,
  name: "FinancialLedger"
}, {
  def: WalletTransactionDef,
  name: "WalletTransaction"
}, {
  def: PatientUserDef,
  name: "PatientUser"
}];

/**
 * Merge two patient records.
 *
 * @param {Object} params
 * @param {string} params.sourcePatientId — patient to merge FROM (will be soft-deleted)
 * @param {string} params.targetPatientId — patient to merge INTO (survives)
 * @param {string} params.reason — required explanation for audit
 * @param {string} params.processedByUserId — staff user performing the merge
 * @param {string} params.organizationId — from req.context
 * @param {Object} req — Express request (provides dbConnection)
 * @returns {Promise<Object>} — merge result summary
 */
async function mergePatients({
  sourcePatientId,
  targetPatientId,
  reason,
  processedByUserId,
  organizationId
}, req) {
  // ── Validation ──────────────────────────────────────────────────────────
  if (!sourcePatientId || !mongoose.Types.ObjectId.isValid(sourcePatientId)) {
    throw new Error("Invalid sourcePatientId");
  }
  if (!targetPatientId || !mongoose.Types.ObjectId.isValid(targetPatientId)) {
    throw new Error("Invalid targetPatientId");
  }
  if (sourcePatientId.toString() === targetPatientId.toString()) {
    throw new Error("Source and target patients must be different");
  }
  if (!reason || reason.trim().length < 3) {
    throw new Error("Merge reason is required (minimum 3 characters)");
  }
  const connection = req.dbConnection;
  if (!connection) {
    throw new Error("[PatientMerge] req.dbConnection is REQUIRED");
  }
  const Patient = getModel(connection, PatientDef);

  // ── Verify Both Patients Exist ──────────────────────────────────────────
  const [source, target] = await Promise.all([Patient.findById(sourcePatientId).lean(), Patient.findById(targetPatientId).lean()]);
  if (!source) throw new Error("Source patient not found");
  if (!target) throw new Error("Target patient not found");
  if (!source.isActive) throw new Error("Source patient is already inactive");
  if (!target.isActive) throw new Error("Target patient is not active");

  // ── Start Transaction ───────────────────────────────────────────────────
  const session = await connection.startSession();
  session.startTransaction();
  const reassignmentLog = {};
  try {
    // ── Step 1: Reassign all related records ────────────────────────────
    for (const {
      def,
      name
    } of REASSIGN_COLLECTIONS) {
      const Model = getModel(connection, def);
      const result = await Model.updateMany({
        patientId: sourcePatientId
      }, {
        $set: {
          patientId: targetPatientId
        }
      }, {
        session
      });
      reassignmentLog[name] = result.modifiedCount || 0;
    }

    // ── Step 2: Merge wallet balances ───────────────────────────────────
    const PatientWallet = getModel(connection, PatientWalletDef);
    const sourceWallet = await PatientWallet.findOne({
      patientId: sourcePatientId
    }).session(session);
    if (sourceWallet && sourceWallet.balance > 0) {
      await PatientWallet.findOneAndUpdate({
        patientId: targetPatientId
      }, {
        $inc: {
          balance: sourceWallet.balance
        },
        $setOnInsert: {
          patientId: targetPatientId
        },
        $set: {
          updatedAt: new Date()
        }
      }, {
        upsert: true,
        session
      });
      // Zero out source wallet
      sourceWallet.balance = 0;
      await sourceWallet.save({
        session
      });
      reassignmentLog.walletTransferred = sourceWallet.balance;
    }

    // ── Step 3: Delete source financial snapshot (will be rebuilt) ───────
    const FinancialSnapshot = getModel(connection, FinancialSnapshotDef);
    await FinancialSnapshot.deleteMany({
      patientId: sourcePatientId
    }, {
      session
    });
    // Also invalidate target snapshot so it gets rebuilt
    await FinancialSnapshot.deleteMany({
      patientId: targetPatientId
    }, {
      session
    });
    reassignmentLog.snapshotsCleared = true;

    // ── Step 4: Merge family links ──────────────────────────────────────
    const sourceFamilyMembers = source.familyMembers || [];
    if (sourceFamilyMembers.length > 0) {
      const targetFamilyIds = (target.familyMembers || []).map(f => f.memberId?.toString());
      const newLinks = sourceFamilyMembers.filter(f => f.memberId?.toString() !== targetPatientId.toString() && !targetFamilyIds.includes(f.memberId?.toString()));
      if (newLinks.length > 0) {
        await Patient.findByIdAndUpdate(targetPatientId, {
          $addToSet: {
            familyMembers: {
              $each: newLinks
            }
          }
        }, {
          session
        });
      }
      reassignmentLog.familyLinksMerged = newLinks.length;
    }

    // ── Step 5: Merge branch access ─────────────────────────────────────
    const sourceBranches = (source.allowedBranchIds || []).map(id => id.toString());
    const targetBranches = (target.allowedBranchIds || []).map(id => id.toString());
    const newBranches = sourceBranches.filter(b => !targetBranches.includes(b));
    if (newBranches.length > 0) {
      await Patient.findByIdAndUpdate(targetPatientId, {
        $addToSet: {
          allowedBranchIds: {
            $each: newBranches.map(b => new mongoose.Types.ObjectId(b))
          }
        }
      }, {
        session
      });
      reassignmentLog.branchesMerged = newBranches.length;
    }

    // ── Step 6: Merge tags ──────────────────────────────────────────────
    const sourceTags = source.tags || [];
    if (sourceTags.length > 0) {
      await Patient.findByIdAndUpdate(targetPatientId, {
        $addToSet: {
          tags: {
            $each: sourceTags
          }
        }
      }, {
        session
      });
      reassignmentLog.tagsMerged = sourceTags.length;
    }

    // ── Step 7: Soft-delete source patient ──────────────────────────────
    await Patient.findByIdAndUpdate(sourcePatientId, {
      $set: {
        isActive: false,
        deletedAt: new Date(),
        mergedInto: targetPatientId,
        mergeReason: reason,
        mergedBy: processedByUserId
      }
    }, {
      session
    });

    // ── Step 8: Outbox event ────────────────────────────────────────────
    const eventPayload = {
      eventId: uuidv4(),
      sourcePatientId,
      targetPatientId,
      reason,
      processedByUserId,
      reassignmentLog,
      timestamp: new Date()
    };
    await outboxService.enqueue({
      eventType: PATIENT_MERGED,
      aggregateType: "patient",
      aggregateId: targetPatientId,
      payload: eventPayload
    }, session);

    // ── Commit ──────────────────────────────────────────────────────────
    await session.commitTransaction();
    logger.info({
      sourcePatientId,
      targetPatientId,
      reassignmentLog,
      organizationId
    }, "[PatientMerge] Merge completed successfully");
    return {
      success: true,
      sourcePatientId,
      targetPatientId,
      reassignmentLog
    };
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error({
      err: error,
      sourcePatientId,
      targetPatientId
    }, "[PatientMerge] Merge failed — transaction aborted");
    throw error;
  } finally {
    session.endSession();
  }
}
module.exports = {
  mergePatients
};