/**
 * gracePeriod.service.js
 * Sprint 7 — Grace Period Enforcement + Auto-Suspension
 *
 * enforceGraceExpiration()
 *
 * Runs daily. Finds contracts where:
 *   contractStatus = "active"
 *   dunning.gracePeriodEndsAt <= now
 *   (still has an open/unpaid invoice)
 *
 * Then:
 *   1) Set org.status = "suspended"
 *   2) Set contract.contractStatus = "expired"
 *   3) Set dunning.suspendedAt = now
 *
 * Covers both:
 *   - Self-service contracts that exhausted all retries
 *   - Sales-managed contracts whose payment window expired
 *
 * PLANE: services/ (accessible to cron jobs)
 * COLLECTIONS: orgcontracts, platforminvoices, organizations
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrgContractDef = require("../platform/billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const PlatformInvoiceDef = require("../platform/billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const OrganizationDef = require("../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const PlatformNotificationDef = require("../platform/models/PlatformNotification");
let _PlatformNotification_cache = null;
function PlatformNotification() {
    return _PlatformNotification_cache || (_PlatformNotification_cache = getPlatformModel(PlatformNotificationDef));
}
const {
  logBillingEvent
} = require("../platform/billing/services/billingAuditLog.service");
const auditService = require("./auditService");
const logger = require("../utils/logger");
const SYSTEM_ACTOR = "000000000000000000000000";

// ─── enforceGraceExpiration ────────────────────────────────────────────────────
/**
 * Daily cron entry point.
 * Checks all active contracts whose grace period has elapsed.
 *
 * @returns {Promise<{ suspended: number, errors: number }>}
 */
async function enforceGraceExpiration() {
  const now = new Date();
  logger.info({
    action: "grace_scan_start",
    now
  }, "[GracePeriod] Starting grace expiration scan");

  // Umbrella query: active contracts with an elapsed grace period
  // @rls-platform-cron — cross-org grace period processing, no org-scoped req
  const overdue = await OrgContract().find({
    contractStatus: "active",
    "dunning.gracePeriodEndsAt": {
      $lte: now
    }
  }).lean();
  logger.info({
    count: overdue.length
  }, "[GracePeriod] Contracts past grace period");
  let suspended = 0,
    errors = 0;
  for (const contract of overdue) {
    try {
      const didSuspend = await _enforceOne(contract, now);
      if (didSuspend) suspended++;
    } catch (err) {
      errors++;
      logger.error({
        err,
        contractId: contract._id
      }, "[GracePeriod] Enforcement error");
    }
  }
  logger.info({
    suspended,
    errors
  }, "[GracePeriod] Grace expiration scan complete");
  return {
    suspended,
    errors
  };
}

// ─── _enforceOne ──────────────────────────────────────────────────────────────
async function _enforceOne(contract, now) {
  // Only suspend if there is still an unpaid invoice (idempotency + correctness)
  // @rls-platform-cron — cross-org grace period processing, no org-scoped req
  const unpaid = await PlatformInvoice().findOne({
    contractId: contract._id,
    status: {
      $in: ["open", "issued"]
    }
  }).lean();
  if (!unpaid) {
    logger.info({
      contractId: contract._id
    }, "[GracePeriod] No unpaid invoice — skipping suspension");
    return false;
  }

  // Suspend org
  await Organization().findByIdAndUpdate(contract.organizationId, {
    $set: {
      status: "suspended"
    }
  });

  // Expire contract + record suspendedAt on dunning
  await OrgContract().findByIdAndUpdate(contract._id, {
    $set: {
      contractStatus: "expired",
      terminatedAt: now,
      terminationReason: "grace_period_expired",
      "dunning.suspendedAt": now
    }
  });

  // Platform notification
  await PlatformNotification().create([{
    type: "ORG_SUSPENDED",
    title: "Organization Suspended — Grace Period Expired",
    organizationId: contract.organizationId,
    severity: "critical",
    message: `Organization suspended. Contract ${contract._id} grace period expired at ${contract.dunning?.gracePeriodEndsAt?.toISOString()}.`
  }]);
  await _audit({
    organizationId: contract.organizationId,
    action: "ORG_SUSPENDED_GRACE_EXPIRED",
    entity: "ORG_CONTRACT",
    entityId: contract._id,
    details: {
      gracePeriodEndsAt: contract.dunning?.gracePeriodEndsAt,
      retryCount: contract.dunning?.retryCount,
      salesManaged: contract.salesManaged
    }
  });

  // BillingAuditLog — emit GRACE_EXPIRED + ORG_SUSPENDED to centralized billing forensic trail
  // Note: GRACE_STARTED is emitted by contractRenewal.service when the dunning window begins.
  try {
    await logBillingEvent({
      organizationId: contract.organizationId,
      contractId: contract._id,
      eventType: "GRACE_EXPIRED",
      performedBy: SYSTEM_ACTOR,
      metadata: {
        gracePeriodEndsAt: contract.dunning?.gracePeriodEndsAt?.toISOString(),
        retryCount: contract.dunning?.retryCount,
        salesManaged: contract.salesManaged
      }
    });
    await logBillingEvent({
      organizationId: contract.organizationId,
      contractId: contract._id,
      eventType: "ORG_SUSPENDED",
      performedBy: SYSTEM_ACTOR,
      metadata: {
        reason: "grace_period_expired",
        suspendedAt: now.toISOString()
      }
    });
  } catch (auditErr) {
    logger.warn({
      auditErr,
      contractId: contract._id
    }, "[GracePeriod] BillingAuditLog write failed (non-fatal)");
  }
  logger.warn({
    contractId: contract._id,
    orgId: contract.organizationId,
    salesManaged: contract.salesManaged
  }, "[GracePeriod] Org suspended — grace expired");
  return true;
}

// ─── Audit helper ─────────────────────────────────────────────────────────────
async function _audit({
  organizationId,
  action,
  entity,
  entityId,
  details
}) {
  try {
    await auditService.createAuditRecord({
      organizationId,
      branchId: SYSTEM_ACTOR,
      actorId: SYSTEM_ACTOR,
      actorType: "system",
      action,
      entity,
      entityId,
      details,
      ipAddress: "system",
      userAgent: "GracePeriodEnforcer"
    });
  } catch (err) {
    logger.error({
      err,
      action
    }, "[GracePeriod] Audit write failed (non-fatal)");
  }
}
module.exports = {
  enforceGraceExpiration
};