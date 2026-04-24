/**
 * contractResolver.service.js
 * Sprint 5 — Hard Cutover: Contract-Only Read Model
 *
 * ALL commercial data is now sourced exclusively from OrgContract.
 * Legacy fallback paths have been removed.
 *
 * If no active OrgContract exists for an org → DomainViolation is thrown.
 * Run seedCleanArchitecture.js (--commit) or backfillOrgContracts.js before
 * calling any resolver for a previously-legacy org.
 *
 * Migration history:
 *   Sprint 3: Dual-read — OrgContract primary, org.subscription fallback
 *   Sprint 4: CONTRACT_READ_STRICT env flag added (default false)
 *   Sprint 5: Fallbacks deleted — contract-only, hard error on missing contract ← NOW
 *   Sprint 6: Remove subscription commercial fields from Organization schema
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrgContractDef = require("../models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const logger = require("@utils/logger");

// ─── Contract Invariant Enforcement ─────────────────────────────────────────
/**
 * enforceContractInvariant
 *
 * PURE FUNCTION — no DB writes, no side effects.
 * Applied on EVERY contract read path to self-heal stuck-expired state.
 *
 * Invariant: if autoRenew=false AND effectiveTo < now AND contractStatus="active"
 *            → the contract MUST be read as "expired".
 *
 * The _invariantCorrected flag is for observability only — it is NEVER persisted.
 * Actual DB correction is handled by the `contractExpiryScheduler` cron.
 *
 * @param {object|null} contract - lean Mongoose document
 * @returns {object|null}
 */
function enforceContractInvariant(contract) {
  if (!contract) return contract;
  const now = new Date();
  const isStuckExpired = contract.autoRenew === false && contract.effectiveTo && new Date(contract.effectiveTo) < now && contract.contractStatus === "active";
  if (isStuckExpired) {
    logger.warn({
      contractId: contract._id,
      organizationId: contract.organizationId,
      effectiveTo: contract.effectiveTo
    }, "[ContractInvariant] STUCK_EXPIRED_CONTRACTS detected — read-time correction applied (DB correction pending cron)");
    return {
      ...contract,
      contractStatus: "expired",
      _invariantCorrected: true
    };
  }
  return contract;
}

// ─── Domain Violation Error ───────────────────────────────────────────────────
class DomainViolation extends Error {
  constructor(message, code = "DOMAIN_VIOLATION") {
    super(message);
    this.name = "DomainViolation";
    this.code = code;
    this.statusCode = 422;
  }
}

// ─── loadActiveContract ────────────────────────────────────────────────────────
/**
 * Loads the active OrgContract for an org.
 * Returns null if no active contract exists.
 * Does NOT throw — callers decide whether to throw on null.
 *
 * @param {string|ObjectId} organizationId
 * @param {mongoose.ClientSession} [session]
 * @returns {Promise<OrgContract|null>}
 */
async function loadActiveContract(organizationId, session = null) {
  const query = OrgContract().findOne({
    organizationId,
    contractStatus: "active"
  }).sort({
    createdAt: -1
  });
  if (session) query.session(session);
  try {
    const contract = await query.lean();
    return enforceContractInvariant(contract);
  } catch (err) {
    logger.error({
      err,
      organizationId
    }, "[ContractResolver] Failed to load active contract");
    return null;
  }
}

// ─── requireActiveContract ─────────────────────────────────────────────────────
/**
 * Loads the active OrgContract and throws DomainViolation if not found.
 * Use this as the authoritative entry point for contract resolution.
 *
 * @param {string|ObjectId} organizationId
 * @param {mongoose.ClientSession} [session]
 * @returns {Promise<OrgContract>}
 * @throws {DomainViolation} if no active contract exists
 */
async function requireActiveContract(organizationId, session = null) {
  const contract = await loadActiveContract(organizationId, session);
  if (!contract) {
    logger.error({
      organizationId
    }, "[ContractResolver] STRICT: No active OrgContract found — DomainViolation thrown");
    throw new DomainViolation(`No active OrgContract found for organization ${organizationId}. ` + "Run seedCleanArchitecture.js or backfillOrgContracts.js to provision a contract.", "NO_ACTIVE_CONTRACT");
  }
  return contract;
}

// ─── Field Resolvers ──────────────────────────────────────────────────────────
// Sprint 5: All resolvers now require a non-null contract.
// Callers MUST load the contract first via requireActiveContract or
// resolveCommercialContext (which enforces this internally).

/**
 * resolvePlanCode
 * @param {OrgContract} contract - must be non-null
 * @returns {string}
 */
function resolvePlanCode(contract) {
  if (!contract?.planCode) {
    throw new DomainViolation("Contract is missing planCode", "CONTRACT_FIELD_MISSING");
  }
  return contract.planCode;
}

/**
 * resolveCurrency
 * @param {OrgContract} contract - must be non-null
 * @returns {string}
 */
function resolveCurrency(contract) {
  if (!contract?.currency) {
    throw new DomainViolation("Contract is missing currency", "CONTRACT_FIELD_MISSING");
  }
  return contract.currency;
}

/**
 * resolveLockedPrice
 * Base price locked at contract signing.
 * @param {OrgContract} contract - must be non-null
 * @returns {number}
 */
function resolveLockedPrice(contract) {
  if (contract?.lockedPrice == null) {
    throw new DomainViolation("Contract is missing lockedPrice", "CONTRACT_FIELD_MISSING");
  }
  return contract.lockedPrice;
}

/**
 * resolveAppliedCoupon
 * Returns coupon snapshot or null if none applied.
 * @param {OrgContract} contract - must be non-null
 * @returns {object|null}
 */
function resolveAppliedCoupon(contract) {
  if (!contract?.appliedCoupon?.code) return null;
  return contract.appliedCoupon;
}

/**
 * resolveRenewalTerms
 * Returns renewal/billing interval configuration from contract.
 * @param {OrgContract} contract - must be non-null
 * @returns {{ inflationPercent: number, autoRenew: boolean, interval: string }}
 */
function resolveRenewalTerms(contract) {
  return {
    inflationPercent: contract?.renewalTerms?.inflationPercent ?? 0,
    autoRenew: contract?.autoRenew !== undefined ? contract.autoRenew : true,
    interval: contract?.renewalTerms?.billingInterval || "monthly"
  };
}

/**
 * resolvePricingOverride
 * Returns custom pricing override if set.
 * @param {OrgContract} contract - must be non-null
 * @returns {{ isCustom: boolean, lockedPrice: number }|null}
 */
function resolvePricingOverride(contract) {
  if (!contract?.pricingOverride?.isCustom) return null;
  return {
    isCustom: true,
    lockedPrice: contract.pricingOverride.lockedPrice || 0,
    reason: contract.pricingOverride.reason || ""
  };
}

/**
 * resolveCreditBalance
 * @param {OrgContract} contract - must be non-null
 * @returns {number}
 */
function resolveCreditBalance(contract) {
  return contract?.creditBalance ?? 0;
}

/**
 * resolveGracePeriodDays
 * @param {OrgContract} contract - must be non-null
 * @returns {number}
 */
function resolveGracePeriodDays(contract) {
  return contract?.gracePeriodDays ?? 7;
}

/**
 * resolveAutoRenew
 * @param {OrgContract} contract - must be non-null
 * @returns {boolean}
 */
function resolveAutoRenew(contract) {
  return contract?.autoRenew !== undefined ? contract.autoRenew : true;
}

// ─── resolveCommercialContext ──────────────────────────────────────────────────
/**
 * Primary entry point for services that need commercial billing data.
 * Returns a fully-resolved commercial context from OrgContract.
 *
 * Throws DomainViolation if no active contract exists.
 *
 * @param {Organization} org - Mongoose document or lean object
 * @param {OrgContract|null} [preloadedContract] - Pass if already loaded to avoid re-query
 * @param {object} [options]
 * @param {mongoose.ClientSession} [options.session]
 * @returns {Promise<CommercialContext>}
 * @throws {DomainViolation} if no active OrgContract
 */
async function resolveCommercialContext(org, preloadedContract = null, options = {}) {
  const contract = preloadedContract ?? (await requireActiveContract(org._id, options.session));
  const commercial = {
    // Audit metadata
    _source: "contract",
    _contractId: contract._id,
    _planVersionId: contract.planVersionId || null,
    // Commercial fields — all from OrgContract
    planCode: resolvePlanCode(contract),
    planVersionTag: contract.planVersionTag || "v1",
    currency: resolveCurrency(contract),
    lockedPrice: resolveLockedPrice(contract),
    appliedCoupon: resolveAppliedCoupon(contract),
    renewalTerms: resolveRenewalTerms(contract),
    pricingOverride: resolvePricingOverride(contract),
    creditBalance: resolveCreditBalance(contract),
    gracePeriodDays: resolveGracePeriodDays(contract),
    autoRenew: resolveAutoRenew(contract)
  };
  logger.debug({
    orgId: org._id,
    contractId: contract._id,
    planCode: commercial.planCode,
    currency: commercial.currency
  }, "[ContractResolver] Commercial context resolved from OrgContract");
  return commercial;
}
module.exports = {
  // ── Invariant enforcement (exported for testing + direct use) ────
  enforceContractInvariant,
  // ── Core loaders ─────────────────────────────────────────────
  loadActiveContract,
  requireActiveContract,
  // ── Composite resolver ───────────────────────────────────────
  resolveCommercialContext,
  // ── Individual field resolvers ───────────────────────────────
  // NOTE: Sprint 5 — these now take (contract) not (org, contract)
  resolvePlanCode,
  resolveCurrency,
  resolveLockedPrice,
  resolveAppliedCoupon,
  resolveRenewalTerms,
  resolvePricingOverride,
  resolveCreditBalance,
  resolveGracePeriodDays,
  resolveAutoRenew,
  // ── Error class ──────────────────────────────────────────────
  DomainViolation
};