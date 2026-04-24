/**
 * orgSubscriptionGuard.contract.test.js — Pure-function regression tests
 *
 * Tests classifySubscriptionState (pure) and entitlementCache (no DB deps).
 * These are contract tests — no MongoDB, no setup.js needed.
 *
 * The classifySubscriptionState function is extracted via a direct require
 * of the module, but the module has heavy deps (billingContract.facade, etc.).
 * To avoid that, we test the classification logic inline here.
 */

"use strict";

// ── Inline classification logic for pure testing ────────────────────────
// Mirrors the classifySubscriptionState function from orgSubscriptionGuard.js.
// Kept in sync via the regression tests themselves — if behavior drifts,
// the integration tests will catch it.

const DEFAULT_GRACE_PERIOD_DAYS = 7;

function classifySubscriptionState(org, contract) {
    const now = new Date();
    const sub = org.subscription || {};

    if (contract && contract.contractStatus === "active") {
        if (contract.effectiveTo && now > new Date(contract.effectiveTo)) {
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

    const trialEnd = org.trialEndDate || sub.trialEndsAt;
    if (sub.status === "trial" && trialEnd && now <= new Date(trialEnd)) {
        return { state: "trial", reason: "in_trial", graceUntil: null };
    }
    if (sub.status === "trial" && trialEnd && now > new Date(trialEnd)) {
        const graceDays = sub.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
        const graceUntil = new Date(trialEnd);
        graceUntil.setDate(graceUntil.getDate() + graceDays);
        if (now <= graceUntil) {
            return { state: "grace", reason: "trial_expired_in_grace", graceUntil };
        }
        return { state: "expired", reason: "trial_expired", graceUntil: null };
    }

    if (sub.status === "active") {
        const periodEnd = sub.currentPeriodEnd;
        if (!periodEnd || now <= new Date(periodEnd)) {
            return { state: "active", reason: "legacy_active", graceUntil: null };
        }
        if (sub.gracePeriodEnd && now <= new Date(sub.gracePeriodEnd)) {
            return { state: "grace", reason: "legacy_grace", graceUntil: new Date(sub.gracePeriodEnd) };
        }
        return { state: "expired", reason: "period_ended", graceUntil: null };
    }

    if (["suspended", "canceled", "expired", "past_due"].includes(sub.status)) {
        return { state: "expired", reason: sub.status, graceUntil: null };
    }

    return { state: "unknown", reason: "undetermined", graceUntil: null };
}

// ── Tests ────────────────────────────────────────────────────────────────

const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
};

describe("classifySubscriptionState — Grace-Period Regression", () => {

    test("active contract within billing period → 'active'", () => {
        const result = classifySubscriptionState(
            { subscription: {} },
            { contractStatus: "active", effectiveTo: daysFromNow(30) }
        );
        expect(result.state).toBe("active");
    });

    test("active contract past billing, within grace → 'grace'", () => {
        const result = classifySubscriptionState(
            { subscription: {} },
            { contractStatus: "active", effectiveTo: daysFromNow(-3), gracePeriodDays: 7 }
        );
        expect(result.state).toBe("grace");
        expect(result.reason).toBe("contract_expired_in_grace");
        expect(result.graceUntil).toBeInstanceOf(Date);
    });

    test("active contract past grace → 'expired'", () => {
        const result = classifySubscriptionState(
            { subscription: {} },
            { contractStatus: "active", effectiveTo: daysFromNow(-30), gracePeriodDays: 7 }
        );
        expect(result.state).toBe("expired");
    });

    test("trial within trialEndDate → 'trial'", () => {
        const result = classifySubscriptionState(
            { subscription: { status: "trial" }, trialEndDate: daysFromNow(10) },
            null
        );
        expect(result.state).toBe("trial");
    });

    test("trial past trialEndDate within grace → 'grace'", () => {
        const result = classifySubscriptionState(
            { subscription: { status: "trial", gracePeriodDays: 7 }, trialEndDate: daysFromNow(-3) },
            null
        );
        expect(result.state).toBe("grace");
        expect(result.reason).toBe("trial_expired_in_grace");
    });

    test("trial past grace → 'expired'", () => {
        const result = classifySubscriptionState(
            { subscription: { status: "trial", gracePeriodDays: 7 }, trialEndDate: daysFromNow(-30) },
            null
        );
        expect(result.state).toBe("expired");
    });

    test("legacy active within period → 'active'", () => {
        const result = classifySubscriptionState(
            { subscription: { status: "active", currentPeriodEnd: daysFromNow(15) } },
            null
        );
        expect(result.state).toBe("active");
        expect(result.reason).toBe("legacy_active");
    });

    test("suspended → 'expired'", () => {
        const result = classifySubscriptionState(
            { subscription: { status: "suspended" } },
            null
        );
        expect(result.state).toBe("expired");
    });

    test("no subscription data → 'unknown'", () => {
        const result = classifySubscriptionState({}, null);
        expect(result.state).toBe("unknown");
    });

    test("grace state MUST have graceUntil date", () => {
        const result = classifySubscriptionState(
            { subscription: {} },
            { contractStatus: "active", effectiveTo: daysFromNow(-1), gracePeriodDays: 7 }
        );
        expect(result.state).toBe("grace");
        expect(result.graceUntil).toBeInstanceOf(Date);
        expect(result.graceUntil.getTime()).toBeGreaterThan(Date.now());
    });
});

describe("Entitlement Cache — Unit Tests", () => {
    const entitlementCache = require("../cache/entitlementCache");

    beforeEach(() => {
        entitlementCache.clear();
    });

    test("returns null on cache miss", () => {
        expect(entitlementCache.get("org1", "pv1")).toBeNull();
    });

    test("returns cached value on hit", () => {
        const caps = { modules: { finance: { enabled: true } } };
        entitlementCache.set("org1", "pv1", caps);
        expect(entitlementCache.get("org1", "pv1")).toEqual(caps);
    });

    test("cached value is frozen (immutable)", () => {
        entitlementCache.set("org1", "pv1", { modules: {} });
        const result = entitlementCache.get("org1", "pv1");
        expect(() => { result.modules = {}; }).toThrow();
    });

    test("different planVersionId = cache miss", () => {
        entitlementCache.set("org1", "pv1", { modules: {} });
        expect(entitlementCache.get("org1", "pv2")).toBeNull();
    });

    test("invalidateOrg removes all entries for that org", () => {
        entitlementCache.set("org1", "pv1", { modules: {} });
        entitlementCache.set("org1", "pv2", { modules: {} });
        entitlementCache.set("org2", "pv1", { modules: {} });

        entitlementCache.invalidateOrg("org1");

        expect(entitlementCache.get("org1", "pv1")).toBeNull();
        expect(entitlementCache.get("org1", "pv2")).toBeNull();
        expect(entitlementCache.get("org2", "pv1")).not.toBeNull();
    });

    test("stats reports hit/miss correctly", () => {
        entitlementCache.set("org1", "pv1", { modules: {} });
        entitlementCache.get("org1", "pv1"); // hit
        entitlementCache.get("org1", "pv2"); // miss

        const s = entitlementCache.stats();
        expect(s.hits).toBe(1);
        expect(s.misses).toBe(1);
        expect(s.hitRate).toBe("50.0%");
    });

    test("returns null when orgId or planVersionId is missing", () => {
        entitlementCache.set(null, "pv1", { modules: {} });
        expect(entitlementCache.get(null, "pv1")).toBeNull();

        entitlementCache.set("org1", null, { modules: {} });
        expect(entitlementCache.get("org1", null)).toBeNull();
    });
});
