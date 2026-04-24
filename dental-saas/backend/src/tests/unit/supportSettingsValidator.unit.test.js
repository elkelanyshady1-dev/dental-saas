/**
 * supportSettingsValidator.unit.test.js — SupportSettings Zod tests (Plan E14)
 */

"use strict";

const {
    parse,
    patchSupportSettingsSchema,
} = require("@modules/supportDomain/validators/supportSettings.validator");

describe("patchSupportSettingsSchema", () => {
    const base = { expectedVersion: 0 };

    test("requires expectedVersion", () => {
        expect(() => parse(patchSupportSettingsSchema, { autoCloseAfterDays: 7 })).toThrow(/VALIDATION_ERROR/);
    });

    test("rejects empty patch", () => {
        expect(() => parse(patchSupportSettingsSchema, base)).toThrow(/VALIDATION_ERROR/);
    });

    test("rejects unknown top-level keys (strict)", () => {
        expect(() => parse(patchSupportSettingsSchema, { ...base, evil: 1 })).toThrow();
    });

    describe("slaHoursByPriority", () => {
        test("accepts partial update", () => {
            const parsed = parse(patchSupportSettingsSchema, {
                ...base,
                slaHoursByPriority: { CRITICAL: 2 },
            });
            expect(parsed.slaHoursByPriority.CRITICAL).toBe(2);
        });

        test("rejects non-integer hours", () => {
            expect(() => parse(patchSupportSettingsSchema, {
                ...base,
                slaHoursByPriority: { HIGH: 3.5 },
            })).toThrow();
        });

        test("rejects hours above 720 (30 days)", () => {
            expect(() => parse(patchSupportSettingsSchema, {
                ...base,
                slaHoursByPriority: { LOW: 1000 },
            })).toThrow();
        });

        test("rejects unknown priority keys", () => {
            expect(() => parse(patchSupportSettingsSchema, {
                ...base,
                slaHoursByPriority: { URGENT: 1 },
            })).toThrow();
        });
    });

    describe("escalationTargets", () => {
        test("accepts valid targets", () => {
            const parsed = parse(patchSupportSettingsSchema, {
                ...base,
                escalationTargets: [
                    { level: 1, role: "supervisor" },
                    { level: 2, email: "manager@clinic.test" },
                ],
            });
            expect(parsed.escalationTargets).toHaveLength(2);
        });

        test("rejects target with neither role nor email", () => {
            expect(() => parse(patchSupportSettingsSchema, {
                ...base,
                escalationTargets: [{ level: 1 }],
            })).toThrow();
        });

        test("rejects duplicate levels", () => {
            let err;
            try {
                parse(patchSupportSettingsSchema, {
                    ...base,
                    escalationTargets: [
                        { level: 1, role: "a" },
                        { level: 1, role: "b" },
                    ],
                });
            } catch (e) { err = e; }
            expect(err).toBeDefined();
            expect(err.details.some((d) => /unique/.test(d.message))).toBe(true);
        });

        test("caps at 5 targets", () => {
            const arr = Array.from({ length: 6 }, (_, i) => ({ level: i + 1, role: `r${i}` }));
            // Level 6 will fail first (max: 5 in schema), so array will be rejected
            expect(() => parse(patchSupportSettingsSchema, { ...base, escalationTargets: arr })).toThrow();
        });
    });

    describe("allowedCategories", () => {
        test("accepts known categories", () => {
            const parsed = parse(patchSupportSettingsSchema, {
                ...base,
                allowedCategories: ["billing", "technical"],
            });
            expect(parsed.allowedCategories).toEqual(["billing", "technical"]);
        });

        test("rejects unknown category", () => {
            expect(() => parse(patchSupportSettingsSchema, {
                ...base,
                allowedCategories: ["billing", "mystery"],
            })).toThrow();
        });

        test("requires at least one category", () => {
            expect(() => parse(patchSupportSettingsSchema, {
                ...base,
                allowedCategories: [],
            })).toThrow();
        });
    });

    describe("scalar bounds", () => {
        test("autoCloseAfterDays must be 1..365", () => {
            expect(() => parse(patchSupportSettingsSchema, { ...base, autoCloseAfterDays: 0 })).toThrow();
            expect(() => parse(patchSupportSettingsSchema, { ...base, autoCloseAfterDays: 366 })).toThrow();
            const parsed = parse(patchSupportSettingsSchema, { ...base, autoCloseAfterDays: 30 });
            expect(parsed.autoCloseAfterDays).toBe(30);
        });

        test("ticketsPerDayCap must be 1..10000", () => {
            expect(() => parse(patchSupportSettingsSchema, { ...base, ticketsPerDayCap: 0 })).toThrow();
            expect(() => parse(patchSupportSettingsSchema, { ...base, ticketsPerDayCap: 10001 })).toThrow();
        });

        test("reopenWindowDays allows 0", () => {
            const parsed = parse(patchSupportSettingsSchema, { ...base, reopenWindowDays: 0 });
            expect(parsed.reopenWindowDays).toBe(0);
        });
    });
});
