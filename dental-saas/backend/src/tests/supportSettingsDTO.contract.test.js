/**
 * supportSettingsDTO.contract.test.js — DTO shape tests (Plan E14)
 */

"use strict";

const {
    SUPPORT_SETTINGS_DTO_VERSION,
    buildSupportSettingsDTO,
    envelope,
} = require("@modules/supportDomain/dto/supportSettings.dto");
const { DEFAULT_SLA_HOURS } = require("@modules/supportDomain/models/SupportSettings.model");

function makeSettings(overrides = {}) {
    return {
        singletonKey: "org-support-settings",
        organizationId: "507f1f77bcf86cd799439011",
        slaHoursByPriority: { CRITICAL: 2, HIGH: 8, MEDIUM: 24, LOW: 48 },
        escalationTargets: [
            { level: 1, role: "supervisor", email: null },
            { level: 2, role: null, email: "manager@clinic.test" },
        ],
        allowedCategories: ["billing", "technical"],
        autoCloseAfterDays: 30,
        ticketsPerDayCap: 200,
        reopenWindowDays: 7,
        version: 3,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-04-15T00:00:00Z"),
        ...overrides,
    };
}

describe("supportSettings.dto", () => {
    test("DTO version is exported", () => {
        expect(SUPPORT_SETTINGS_DTO_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("null/undefined input returns null", () => {
        expect(buildSupportSettingsDTO(null)).toBeNull();
        expect(buildSupportSettingsDTO(undefined)).toBeNull();
    });

    test("strips singletonKey and organizationId", () => {
        const dto = buildSupportSettingsDTO(makeSettings());
        expect("singletonKey" in dto).toBe(false);
        expect("organizationId" in dto).toBe(false);
    });

    test("ISO-formats dates", () => {
        const dto = buildSupportSettingsDTO(makeSettings());
        expect(dto.createdAt).toMatch(/T/);
        expect(dto.updatedAt).toMatch(/T/);
    });

    test("exposes version for optimistic concurrency", () => {
        const dto = buildSupportSettingsDTO(makeSettings({ version: 11 }));
        expect(dto.version).toBe(11);
    });

    test("defaults version to 0 when missing", () => {
        const dto = buildSupportSettingsDTO(makeSettings({ version: undefined }));
        expect(dto.version).toBe(0);
    });

    test("preserves sla hours per priority", () => {
        const dto = buildSupportSettingsDTO(makeSettings());
        expect(dto.slaHoursByPriority).toEqual({ CRITICAL: 2, HIGH: 8, MEDIUM: 24, LOW: 48 });
    });

    test("fills missing sla priorities from DEFAULT_SLA_HOURS", () => {
        const dto = buildSupportSettingsDTO(makeSettings({
            slaHoursByPriority: { CRITICAL: 1 },
        }));
        expect(dto.slaHoursByPriority.CRITICAL).toBe(1);
        expect(dto.slaHoursByPriority.HIGH).toBe(DEFAULT_SLA_HOURS.HIGH);
        expect(dto.slaHoursByPriority.MEDIUM).toBe(DEFAULT_SLA_HOURS.MEDIUM);
        expect(dto.slaHoursByPriority.LOW).toBe(DEFAULT_SLA_HOURS.LOW);
    });

    test("normalizes escalation targets to { level, role, email }", () => {
        const dto = buildSupportSettingsDTO(makeSettings());
        expect(dto.escalationTargets).toHaveLength(2);
        expect(dto.escalationTargets[0]).toEqual({ level: 1, role: "supervisor", email: null });
        expect(dto.escalationTargets[1]).toEqual({ level: 2, role: null, email: "manager@clinic.test" });
    });

    test("copies allowedCategories by value (no reference sharing)", () => {
        const src = makeSettings();
        const dto = buildSupportSettingsDTO(src);
        dto.allowedCategories.push("other");
        expect(src.allowedCategories).toEqual(["billing", "technical"]);
    });

    test("falls back gracefully when sub-objects are missing", () => {
        const dto = buildSupportSettingsDTO({ version: 1 });
        expect(dto.slaHoursByPriority).toEqual({ ...DEFAULT_SLA_HOURS });
        expect(dto.escalationTargets).toEqual([]);
        expect(dto.allowedCategories).toEqual([]);
        expect(dto.autoCloseAfterDays).toBe(14);
        expect(dto.ticketsPerDayCap).toBe(100);
        expect(dto.reopenWindowDays).toBe(7);
    });

    describe("envelope helper", () => {
        test("wraps data with success + version metadata", () => {
            const env = envelope(buildSupportSettingsDTO(makeSettings()));
            expect(env.success).toBe(true);
            expect(env.version).toBe(SUPPORT_SETTINGS_DTO_VERSION);
            expect(env.data).toBeTruthy();
            expect(env.data.autoCloseAfterDays).toBe(30);
        });
    });
});
