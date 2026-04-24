/**
 * subscription.service.js
 * Phase 2 — Manual subscription activation for one-time payment providers.
 *
 * Kashier does not expose a subscription API. After a successful one-off
 * payment, the platform is responsible for extending the organisation's
 * billing period. `activateManualSubscription` is that extension.
 *
 * Contract:
 *   - If the current period is still open, the new period starts at the
 *     current `currentPeriodEnd` (early-renewal semantics: no time is lost).
 *   - If the current period has expired (or the org has never had one), the
 *     new period starts at `now` (reset semantics).
 *   - `currentPeriodEnd` is always `addDuration(start, getPlanDuration(interval))`.
 *   - `nextBillingDate` mirrors `currentPeriodEnd` — our internal renewal
 *     job reads this field to decide when to prompt the next Kashier charge.
 *
 * PLANE: Platform / Billing
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("@shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const OrgContractDef = require("@billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const logger = require("@utils/logger");

// ─── Duration helpers ────────────────────────────────────────────────────────

/**
 * getPlanDuration
 * Resolves a billing-period duration from an interval string.
 *
 * @param {"monthly"|"yearly"|"biennial"} interval
 * @returns {{ months: number }}
 */
function getPlanDuration(interval) {
  switch (interval) {
    case "yearly":
      return {
        months: 12
      };
    case "biennial":
      return {
        months: 24
      };
    case "monthly":
    default:
      return {
        months: 1
      };
  }
}

/**
 * addDuration
 * Returns a new Date offset by the given `{ months }` duration.
 * Uses `setUTCMonth` so daylight-saving transitions don't drift the period.
 */
function addDuration(date, {
  months = 0
} = {}) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ─── Manual activation ───────────────────────────────────────────────────────

/**
 * activateManualSubscription
 * Extends (or initialises) an organisation's subscription period after a
 * successful one-off Kashier payment.
 *
 * @param {object} params
 * @param {string} params.orgId
 * @param {string} [params.planVersionId]  - reserved for future per-plan lookup
 * @param {"monthly"|"yearly"|"biennial"} [params.interval="monthly"]
 * @param {string} [params.paymentId]      - Kashier payment ID (for audit)
 * @returns {Promise<object>} the updated Organization document
 */
// ── State machine for manual activation (Phase 2/3 Hardening) ──────────────
// Only states from which a one-off payment may legitimately activate a
// subscription.
//   active     — early renewal (current period still open; no time lost)
//   expired    — reset (lifecycle job flipped the flag; Kashier charge revives it)
//   trial      — first paid activation from the default signup state
//   past_due   — recovery path after a failed auto-renewal; Kashier charge cures it
//
// Blocked on purpose: suspended, canceled, provision_failed. Each of those
// requires a dedicated administrative flow — they must never be silently
// flipped to "active" by a webhook.
const ACTIVATABLE_STATUSES = new Set(["active", "expired", "trial", "past_due"]);
function _assertActivatableState(org) {
  const sub = org.subscription;
  // No subscription subdoc at all → treated as "new".
  if (!sub) return;
  const status = sub.status;
  if (!status) return; // uninitialised — treat as new
  if (ACTIVATABLE_STATUSES.has(status)) return;
  throw Object.assign(new Error(`INVALID_SUBSCRIPTION_STATE: ${status}`), {
    code: "INVALID_SUBSCRIPTION_STATE",
    status
  });
}

// ── Internal shared activation ──────────────────────────────────────────────
// Provider-agnostic period extension. Both Kashier (manual/internal) and
// Stripe (provider/auto) funnel through here so the state machine and
// period math are identical across providers. NO provider-specific branches.
async function _doActivate({
  orgId,
  contractId = null,
  planVersionId = null,
  interval = "monthly",
  paymentId = null,
  provider,
  billingMode,
  renewalStrategy
} = {}) {
  if (!orgId) {
    throw Object.assign(new Error("ORG_ID_REQUIRED"), {
      code: "ORG_ID_REQUIRED"
    });
  }
  if (!provider) {
    throw Object.assign(new Error("PROVIDER_REQUIRED"), {
      code: "PROVIDER_REQUIRED"
    });
  }
  const org = await Organization().findById(orgId);
  if (!org) {
    throw Object.assign(new Error(`ORG_NOT_FOUND: ${orgId}`), {
      code: "ORG_NOT_FOUND"
    });
  }

  // Phase 2 Hardening — Task 4: enforce subscription state machine BEFORE
  // any mutation. Blocks activation from suspended / canceled / provision_failed
  // states; those must be resolved via a dedicated administrative flow.
  _assertActivatableState(org);
  const duration = getPlanDuration(interval);
  const now = new Date();
  org.subscription = org.subscription || {};
  const currentEnd = org.subscription.currentPeriodEnd ? new Date(org.subscription.currentPeriodEnd) : null;

  // Early renewal vs. expired/new reset.
  if (currentEnd && currentEnd > now) {
    org.subscription.currentPeriodStart = currentEnd;
  } else {
    org.subscription.currentPeriodStart = now;
  }
  org.subscription.currentPeriodEnd = addDuration(org.subscription.currentPeriodStart, duration);
  org.subscription.nextBillingDate = org.subscription.currentPeriodEnd;
  org.subscription.status = "active";
  org.subscription.billingMode = billingMode;
  org.subscription.renewalStrategy = renewalStrategy;
  org.subscription.provider = provider;
  org.subscription.paymentProvider = provider; // legacy mirror
  org.subscription.interval = interval;
  if (planVersionId) {
    org.subscription.planVersionId = planVersionId;
  }
  if (paymentId) {
    org.subscription.lastPaymentId = paymentId;
    org.subscription.lastProviderPaymentId = paymentId; // legacy mirror
  }
  await org.save();

  // ── Pre-Phase-8 hardening: align contract state with subscription ───────
  // No contract should stay in "draft" after a successful payment. Mark it
  // active, timestamp the activation, and record the paymentId so the
  // payment-success dispatcher can use it as an idempotency key on retry.
  // Contract update is best-effort: the subscription has already been
  // activated and a reconciliation job can flip contract status later.
  let activatedContract = null;
  if (contractId) {
    try {
      const contract = await OrgContract().findById(contractId);
      if (contract) {
        const wasActive = contract.contractStatus === "active";
        contract.contractStatus = "active";
        if (!contract.activatedAt) {
          contract.activatedAt = new Date();
        }
        if (paymentId) contract.lastPaymentId = paymentId;
        // Also mirror the effective provider onto the contract so
        // downstream readers (platform dashboards, refund flows) see
        // the authoritative value immediately.
        contract.paymentProvider = provider;
        await contract.save();
        activatedContract = contract;
        logger.info({
          event: wasActive ? "CONTRACT_ALREADY_ACTIVE" : "CONTRACT_ACTIVATED",
          contractId: String(contract._id),
          orgId: String(org._id),
          provider
        }, "[subscription.service] Contract activation aligned");
      } else {
        logger.warn({
          event: "CONTRACT_NOT_FOUND_AT_ACTIVATION",
          contractId: String(contractId),
          orgId: String(org._id)
        }, "[subscription.service] contract missing at activation time");
      }
    } catch (err) {
      logger.error({
        err,
        event: "CONTRACT_ACTIVATION_FAILED",
        contractId: String(contractId),
        orgId: String(org._id)
      }, "[subscription.service] contract update failed — subscription stands; requires reconciliation");
    }
  }

  // ── Final-hardening — Section 1: subscription↔contract provider parity ──
  // Both fields are written in this same function with the same `provider`
  // value, so a divergence here means a future refactor introduced two
  // different sources of truth. Throw 500 immediately so the bug can't
  // ship to production silently.
  if (activatedContract && org.subscription?.paymentProvider !== activatedContract.paymentProvider) {
    throw Object.assign(new Error("SUBSCRIPTION_CONTRACT_PROVIDER_MISMATCH"), {
      code: "SUBSCRIPTION_CONTRACT_PROVIDER_MISMATCH",
      status: 500,
      subscriptionProvider: org.subscription?.paymentProvider,
      contractProvider: activatedContract.paymentProvider
    });
  }
  logger.info({
    event: "SUBSCRIPTION_ACTIVATED",
    orgId: String(org._id),
    provider,
    billingMode,
    renewalStrategy,
    interval,
    currentPeriodStart: org.subscription.currentPeriodStart,
    currentPeriodEnd: org.subscription.currentPeriodEnd,
    contractId: contractId ? String(contractId) : null,
    planVersionId
  }, "[subscription.service] Subscription activated");
  return org;
}

/**
 * activateManualSubscription
 * Kashier (one-time payments, platform manages renewals internally).
 * Thin wrapper — public shape unchanged; state is `provider=kashier`,
 * `billingMode=manual`, `renewalStrategy=internal`.
 */
async function activateManualSubscription(args = {}) {
  return _doActivate({
    ...args,
    provider: "kashier",
    billingMode: "manual",
    renewalStrategy: "internal"
  });
}

/**
 * activateProviderSubscription — Phase 6
 * Provider-managed renewals (Stripe today; any future auto-renew provider).
 * State is `billingMode=auto`, `renewalStrategy=provider`; the lifecycle job
 * therefore only flags past_due and NEVER charges (the provider owns charges).
 *
 * @param {object} args
 * @param {string} args.orgId
 * @param {string} [args.planVersionId]
 * @param {"monthly"|"yearly"|"biennial"} [args.interval="monthly"]
 * @param {string} [args.paymentId]
 * @param {string} args.provider   - e.g. "stripe". Must be truthy.
 * @returns {Promise<object>} updated organisation document
 */
async function activateProviderSubscription(args = {}) {
  if (!args.provider) {
    throw Object.assign(new Error("PROVIDER_REQUIRED"), {
      code: "PROVIDER_REQUIRED"
    });
  }
  return _doActivate({
    ...args,
    billingMode: "auto",
    renewalStrategy: "provider"
  });
}
module.exports = {
  activateManualSubscription,
  activateProviderSubscription,
  getPlanDuration,
  addDuration
};