/**
 * tests/unit/billing/services/subscriptionRenewal.service.unit.test.js
 * Phase 3 — canRenewSubscription coverage.
 */

"use strict";

const {
    canRenewSubscription,
    RENEWABLE_STATUSES
} = require("@billing/services/subscriptionRenewal.service");

describe("canRenewSubscription", () => {
    test.each(["active", "expired", "past_due"])(
        "allows renewal for status '%s'",
        (status) => {
            expect(canRenewSubscription({ status })).toBe(true);
        }
    );

    test.each(["canceled", "suspended", "trial", "provision_failed"])(
        "blocks renewal for status '%s'",
        (status) => {
            expect(canRenewSubscription({ status })).toBe(false);
        }
    );

    test("returns false for null/undefined", () => {
        expect(canRenewSubscription(null)).toBe(false);
        expect(canRenewSubscription(undefined)).toBe(false);
    });

    test("returns false when status is missing", () => {
        expect(canRenewSubscription({})).toBe(false);
    });

    test("RENEWABLE_STATUSES contains exactly the expected three states", () => {
        expect([...RENEWABLE_STATUSES].sort()).toEqual(
            ["active", "expired", "past_due"].sort()
        );
    });
});
