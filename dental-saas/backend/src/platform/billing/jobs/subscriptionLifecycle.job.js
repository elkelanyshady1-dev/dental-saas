/**
 * subscriptionLifecycle.job.js
 * Phase 3 — Subscription Lifecycle Engine.
 *
 * Scans `active` subscriptions whose `currentPeriodEnd` has passed and
 * transitions them according to their `renewalStrategy`:
 *
 *   renewalStrategy === "internal"  (Kashier / manual): → "expired"
 *     The org must start a new checkout to renew. The lifecycle engine
 *     never charges a card — that is always an explicit user action.
 *
 *   renewalStrategy === "provider"  (Stripe / auto):     → "past_due"
 *     We don't expire Stripe subscriptions ourselves — Stripe's own dunning
 *     engine owns the recovery. We flag past_due so the org surface can
 *     show a banner and so downstream entitlement guards short-circuit.
 *
 * Safe properties:
 *   - Idempotent: re-running against already-transitioned orgs is a no-op.
 *   - Per-org error isolation: a failure on one org does not abort the
 *     batch; the error is logged and the run continues.
 *   - Returns a summary so the caller (cron wrapper, tests) can assert.
 *
 * PLANE: Platform / Billing
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const logger = require("@utils/logger");
async function expireManualSubscription(org) {
  org.subscription.status = "expired";
  await org.save();
  logger.info({
    event: "SUBSCRIPTION_EXPIRED",
    orgId: String(org._id),
    provider: org.subscription.provider || org.subscription.paymentProvider || null,
    currentPeriodEnd: org.subscription.currentPeriodEnd
  }, "[subscriptionLifecycle] manual subscription expired");
}
async function markPastDue(org) {
  org.subscription.status = "past_due";
  await org.save();
  logger.warn({
    event: "SUBSCRIPTION_PAST_DUE",
    orgId: String(org._id),
    provider: org.subscription.provider || org.subscription.paymentProvider || null,
    currentPeriodEnd: org.subscription.currentPeriodEnd
  }, "[subscriptionLifecycle] subscription flagged past_due");
}

/**
 * runSubscriptionLifecycle
 * Sweeps expired periods once. Returns a summary `{ scanned, expired, pastDue, errors }`.
 */
async function runSubscriptionLifecycle({
  now = new Date()
} = {}) {
  const orgs = await Organization.find({
    "subscription.status": "active",
    "subscription.currentPeriodEnd": {
      $lte: now
    }
  });
  const summary = {
    scanned: orgs.length,
    expired: 0,
    pastDue: 0,
    errors: 0
  };
  for (const org of orgs) {
    const sub = org.subscription || {};
    try {
      if (sub.renewalStrategy === "internal") {
        await expireManualSubscription(org);
        summary.expired += 1;
      } else {
        await markPastDue(org);
        summary.pastDue += 1;
      }
    } catch (err) {
      summary.errors += 1;
      logger.error({
        err,
        orgId: String(org._id),
        renewalStrategy: sub.renewalStrategy
      }, "[subscriptionLifecycle] transition failed");
    }
  }
  logger.info({
    event: "SUBSCRIPTION_LIFECYCLE_RUN",
    ...summary,
    now: now.toISOString()
  }, "[subscriptionLifecycle] run complete");
  return summary;
}
module.exports = {
  runSubscriptionLifecycle,
  expireManualSubscription,
  markPastDue
};