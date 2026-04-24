/**
 * orthodonticDashboard.dto.test.js — FLS Allowlist Contract (M5)
 *
 * The ortho dashboard route intentionally skips `fieldFilterMiddleware` and
 * relies on the DTO builder alone to strip PII / financial / internal fields.
 * These tests lock that contract in place: any aggregation input containing
 * sensitive keys must NOT produce a DTO field for them.
 *
 * If this suite fails, EITHER:
 *   a) A new dashboard field was intentionally added — update the expected
 *      top-level keys list AND confirm it isn't leaking sensitive data.
 *   b) Something regressed — a raw aggregation field is bleeding through.
 */

"use strict";

const {
    buildDashboardDTO,
    buildKpisDTO,
    buildCriticalAlertsDTO,
    buildOverdueCasesDTO,
    buildDoctorWorkloadDTO,
} = require(
    "../../src/modules/orthodontics/core/dto/orthodonticDashboard.dto"
);

describe("orthodonticDashboard DTO — FLS allowlist contract", () => {
    // Poisoned input: every flavor of sensitive data the dashboard might
    // accidentally surface if the DTO stopped enforcing its allowlist.
    const SENSITIVE_EXTRAS = {
        patientPhone: "+201005555555",
        patientEmail: "p@example.com",
        patientNationalId: "29001011234567",
        totalRevenue: 99999,
        outstandingBalance: 1234,
        insuranceProvider: "ACME",
        ssn: "123-45-6789",
        // Raw Mongo fields that must never surface.
        _id: "65000000000000000000dead",
        __v: 0,
        // Internal org context that must never surface.
        organizationId: "600000000000000000000001",
        branchId: "600000000000000000000002",
    };

    it("buildDashboardDTO top-level keys match the frozen contract", () => {
        const poisonedParts = {
            kpis: { activeCount: 5, ...SENSITIVE_EXTRAS },
            stageDistribution: [{ stage: "bonding", count: 3, ...SENSITIVE_EXTRAS }],
            durationVariance: [],
            doctorWorkload: [{ doctorId: "D1", doctorName: "Dr X", activeCases: 2, visitsThisWeek: 1, ...SENSITIVE_EXTRAS }],
            applianceInventory: { activeBrackets: 10, ...SENSITIVE_EXTRAS },
            photoCoverage: { casesWithBaseline: 2, ...SENSITIVE_EXTRAS },
            overdueCases: [{ caseId: "C1", patientName: "John", daysSinceLastVisit: 7, ...SENSITIVE_EXTRAS }],
            criticalAlerts: [{ eventId: "E1", caseId: "C1", patientName: "John", severity: "critical", type: "OVERDUE", at: new Date(), ...SENSITIVE_EXTRAS }],
            generatedAt: new Date(),
            scope: "owner",
            // Attempt to inject a whole new top-level key:
            revenueBreakdown: { gross: 100000, net: 80000 },
            patientPII: { names: ["A", "B"] },
        };

        const dto = buildDashboardDTO(poisonedParts);

        // Frozen top-level contract. If you change this, confirm each new
        // key is non-sensitive AND update the assertion.
        const EXPECTED_KEYS = [
            "applianceInventory",
            "criticalAlerts",
            "doctorWorkload",
            "durationVariance",
            "generatedAt",
            "kpis",
            "overdueCases",
            "photoCoverage",
            "scope",
            "stageDistribution",
        ];
        expect(Object.keys(dto).sort()).toEqual(EXPECTED_KEYS);

        // Defense-in-depth: walk the serialized DTO for sensitive substrings.
        const serialized = JSON.stringify(dto);
        const SENSITIVE_SUBSTRINGS = [
            "patientPhone",
            "patientEmail",
            "patientNationalId",
            "totalRevenue",
            "outstandingBalance",
            "insuranceProvider",
            "ssn",
            "__v",
            "organizationId",
            "branchId",
            "revenueBreakdown",
            "patientPII",
        ];
        for (const key of SENSITIVE_SUBSTRINGS) {
            expect(serialized).not.toMatch(new RegExp(key));
        }
    });

    it("buildKpisDTO does not leak extra fields", () => {
        const out = buildKpisDTO({
            activeCount: 5,
            inTreatmentCount: 3,
            overdueAdjustments: 1,
            avgAlignerProgress: 0.5,
            criticalEventsToday: 0,
            todayVisits: 12,
            totalRevenue: 99999,
            patientSSN: "x",
        });
        expect(Object.keys(out).sort()).toEqual([
            "activeCount",
            "avgAlignerProgress",
            "criticalEventsToday",
            "inTreatmentCount",
            "overdueAdjustments",
            "todayVisits",
        ]);
    });

    it("buildCriticalAlertsDTO rows carry only declared fields", () => {
        const rows = buildCriticalAlertsDTO([{
            eventId: "E1",
            caseId: "C1",
            patientName: "John",
            severity: "critical",
            type: "OVERDUE",
            at: new Date(),
            patientPhone: "+2010",
            costImpact: 500,
        }]);
        expect(rows).toHaveLength(1);
        expect(Object.keys(rows[0]).sort()).toEqual(
            ["at", "caseId", "eventId", "patientName", "severity", "type"]
        );
    });

    it("buildOverdueCasesDTO rows carry only declared fields", () => {
        const rows = buildOverdueCasesDTO([{
            caseId: "C1",
            patientName: "John",
            daysSinceLastVisit: 7,
            lastVisitAt: new Date(),
            patientPhone: "+2010",
            insuranceProvider: "ACME",
        }]);
        expect(rows).toHaveLength(1);
        expect(Object.keys(rows[0]).sort()).toEqual(
            ["caseId", "daysSinceLastVisit", "lastVisitAt", "patientName"]
        );
    });

    it("buildDoctorWorkloadDTO rows strip internal identifiers", () => {
        const rows = buildDoctorWorkloadDTO([{
            doctorId: "D1",
            doctorName: "Dr X",
            activeCases: 2,
            visitsThisWeek: 1,
            doctorEmail: "x@y.z",
            doctorLicenseNumber: "LIC-1234",
        }]);
        expect(rows).toHaveLength(1);
        expect(Object.keys(rows[0]).sort()).toEqual(
            ["activeCases", "doctorId", "doctorName", "visitsThisWeek"]
        );
    });
});
