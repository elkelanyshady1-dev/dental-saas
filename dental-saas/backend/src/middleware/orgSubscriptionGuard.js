/**
 * orgSubscriptionGuard.js
 * Sprint 1 — Hybrid Billing Foundations
 * Sprint 2 — Wired to entitlementResolver (tenant-level entitlement engine)
 *
 * NEW guard aligned with the Hybrid Billing architecture.
 * Reads subscription state from OrgContract (new) with fallback to
 * Organization.subscription (legacy) during dual-read period.
 *
 * DOES NOT replace subscriptionGuard.js — operates alongside it.
 * Will supersede subscriptionGuard.js in Sprint 4 once all org routes
 * are migrated.
 *
 * Access model:
 *   - "active" contract with paid invoice → full access
 *   - "trial" status within trialEndDate → trial access
 *   - grace period within gracePeriodDays → degraded access
 *   - everything else → 402 Payment Required
 *
 * Usage (once wired in Sprint 4):
 *   router.use(orgSubscriptionGuard);
 *
 * PLANE: Shared (used by org routes)
 */

"use strict";

const Organization = require("@shared/models/Organization").default;
const OrgContract = require("@billing/models/OrgContract.model").default;
const PlanVersion = require("@billing/models/PlanVersion.model").default;
const logger = require("@utils/logger");
const { resolveOrganizationEntitlements } = require("@billing/services/entitlementResolver.service");

// Grace window: if subscription expired within this window, allow degraded access
const DEFAULT_GRACE_PERIOD_DAYS = 7;

/**
 * Classify the subscription state from the Hybrid Billing perspective.
 *
 * Priority order:
 *   1. Active OrgContract → "active"
 *   2. OrgContract in grace period → "grace"
 *   3. Org trial (legacy or new fields) → "trial"
 *   4. Legacy subscription.status=active (no contract yet) → "active" (backward compat)
 *   5. Everything else → "expired"
 *
 * @param {Object} org - Mongoose Organization document
 * @param {Object|null} contract - Active OrgContract document or null
 * @returns {{ state: string, reason: string, graceUntil: Date|null }}
 */
function classifySubscriptionState(org, contract) {
    const now = new Date();
    const sub = org.subscription || {};

    // ── 1. Active contract path ────────────────────────────────────────────────
    if (contract && contract.contractStatus === "active") {
        // Check if the contract's billing period has passed
        if (contract.effectiveTo && now > new Date(contract.effectiveTo)) {
            // Contract expired — check grace period
            const graceDays = contract.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
            const graceUntil = new Date(contract.effectiveTo);
            graceUntil.setDate(graceUntil.getDate() + graceDays);

            if (now <= graceUntil) {
                return { state: "grace", reason: "contract_expired_in_grace", graceUntil };
            }
            return { state: "expired", reason: "contract_expired", graceUntil: null };
        }
        return { state: "active", reason: "active_contract", graceUntil: null };
    }

    // ── 2. Trial — prefer new trialEndDate field, fallback to legacy ───────────
    const trialEnd = org.trialEndDate || sub.trialEndsAt;
    if (sub.status === "trial" && trialEnd && now <= new Date(trialEnd)) {
        return { state: "trial", reason: "in_trial", graceUntil: null };
    }

    // ── 3. Trial ended but grace ───────────────────────────────────────────────
    if (sub.status === "trial" && trialEnd && now > new Date(trialEnd)) {
        const graceDays = sub.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
        const graceUntil = new Date(trialEnd);
        graceUntil.setDate(graceUntil.getDate() + graceDays);

        if (now <= graceUntil) {
            return { state: "grace", reason: "trial_expired_in_grace", graceUntil };
        }
        return { state: "expired", reason: "trial_expired", graceUntil: null };
    }

    // ── 4. Legacy active subscription (no contract yet) ────────────────────────
    if (sub.status === "active") {
        const periodEnd = sub.currentPeriodEnd;
        if (!periodEnd || now <= new Date(periodEnd)) {
            return { state: "active", reason: "legacy_active", graceUntil: null };
        }

        // Grace via legacy gracePeriodEnd
        if (sub.gracePeriodEnd && now <= new Date(sub.gracePeriodEnd)) {
            return { state: "grace", reason: "legacy_grace", graceUntil: new Date(sub.gracePeriodEnd) };
        }

        return { state: "expired", reason: "period_ended", graceUntil: null };
    }

    // ── 5. Explicit suspended / canceled / expired ─────────────────────────────
    if (["suspended", "canceled", "expired", "past_due"].includes(sub.status)) {
        return { state: "expired", reason: sub.status, graceUntil: null };
    }

    return { state: "unknown", reason: "undetermined", graceUntil: null };
}

/**
 * orgSubscriptionGuard
 *
 * Express middleware. Phase 8: Loads org directly from DB using req.context.organizationId.
 *
 * Sets on req:
 *   - req.subscriptionState: "active" | "trial" | "grace" | "expired" | "unknown"
 *   - req.activeContract: OrgContract document | null
 *
 * Allows: active, trial, grace
 * Blocks: expired, unknown → 402
 */
async function orgSubscriptionGuard(req, res, next) {
    try {
        // Phase 8: req.organization is deprecated. Load org directly from DB.
        const orgId = req.context?.organizationId || req.user?.organizationId;
        if (!orgId) {
            return res.status(401).json({
                success: false,
                error: "Organization context missing"
            });
        }

        const org = await Organization.findById(orgId).lean();
        if (!org) {
            return res.status(404).json({ success: false, error: "Organization not found" });
        }

        // Load active OrgContract (null if no contract yet — legacy orgs)
        let activeContract = null;
        if (org.currentContractId) {
            activeContract = await OrgContract.findOne({
                _id: org.currentContractId,
                organizationId: org._id,
                contractStatus: "active"
            }).lean();
        }

        const { state, reason, graceUntil } = classifySubscriptionState(org, activeContract);

        req.subscriptionState = state;
        req.activeContract = activeContract;

        if (state === "active" || state === "trial") {
            // ── Sprint 2: Resolve merged entitlements (plan defaults + org overrides) ──
            // Load the PlanVersion for the active contract so the resolver has
            // the baseline module/limit values to merge against.
            try {
                let planVersion = null;
                if (activeContract?.planVersionId) {
                    planVersion = await PlanVersion.findById(activeContract.planVersionId).lean();
                }

                // PHASE 9 — ACCESS-002 fix: Fallback for trial users without a contract.
                // Trial orgs created before contract-first provisioning (Phase 6) have
                // no activeContract. Load the trial-tier PlanVersion directly so
                // req.planCapabilities is defined for feature gating.
                if (!planVersion && state === "trial") {
                    planVersion = await PlanVersion.findOne({
                        templateCode: "trial-tier",
                        status: "active"
                    }).lean();
                }

                if (planVersion) {
                    req.planCapabilities = await resolveOrganizationEntitlements(org._id, planVersion);
                }
            } catch (entitlementErr) {
                // Never block access on entitlement resolution failure
                logger.warn(
                    { err: entitlementErr, orgId: org._id },
                    "[orgSubscriptionGuard] Entitlement resolution failed — planCapabilities not set"
                );
            }
            return next();
        }

        if (state === "grace") {
            // Log warning — grace-period requests are degraded
            logger.warn(
                { orgId: org._id, reason, graceUntil },
                "[orgSubscriptionGuard] Access in grace period"
            );
            req.inGracePeriod = true;
            req.graceUntil = graceUntil;
            return next();
        }

        // state === "expired" | "unknown"
        logger.info(
            { orgId: org._id, reason, state },
            "[orgSubscriptionGuard] Access denied — subscription not active"
        );

        return res.status(402).json({
            success: false,
            error: "Subscription required",
            reason,
            ...(graceUntil ? { graceUntil } : {})
        });

    } catch (err) {
        logger.error({ err }, "[orgSubscriptionGuard] Unexpected error");
        return next(err);
    }
}

module.exports = orgSubscriptionGuard;
module.exports.classifySubscriptionState = classifySubscriptionState; // exported for testing
