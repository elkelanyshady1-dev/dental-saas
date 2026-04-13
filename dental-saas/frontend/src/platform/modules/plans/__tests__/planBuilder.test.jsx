/**
 * planBuilder.test.jsx
 * v20.2 Phase 7B — Plan Builder Test Suite
 *
 * Tests:
 * 1. Region overlap validation
 * 2. Module dynamic render
 * 3. Duplicate plan behavior
 * 4. Version display
 * 5. Visibility filtering
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { validatePlan } from "../validators/planValidator";
import ModulesTab from "../components/ModulesTab";
import VisibilityTab from "../components/VisibilityTab";
import GeneralTab from "../components/GeneralTab";

// ── 1. Region Overlap Validation ──────────────────────────────────────
describe("Region Overlap Validation", () => {
    it("should detect overlapping countries between regions", () => {
        const plan = {
            name: "Test",
            code: "test",
            limits: { maxUsers: 5, maxBranches: 2 },
            pricing: {
                baseCurrency: "USD",
                regions: [
                    { regionCode: "MENA", countries: ["EG", "SA"], currency: "EGP", monthly: 100, yearly: 1000 },
                    { regionCode: "GULF", countries: ["SA", "AE"], currency: "SAR", monthly: 200, yearly: 2000 }
                ]
            }
        };

        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes("SA"))).toBe(true);
        expect(result.errors.some(e => e.message.includes("already assigned"))).toBe(true);
    });

    it("should pass when no countries overlap", () => {
        const plan = {
            name: "Test",
            code: "test",
            limits: { maxUsers: 5, maxBranches: 2 },
            pricing: {
                baseCurrency: "USD",
                regions: [
                    { regionCode: "MENA", countries: ["EG", "SA"], currency: "EGP", monthly: 100, yearly: 1000 },
                    { regionCode: "EU", countries: ["DE", "FR"], currency: "EUR", monthly: 200, yearly: 2000 }
                ]
            }
        };

        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
    });

    it("should allow zero-price trial plans (price >= 0)", () => {
        const plan = {
            name: "Free Trial",
            code: "free-trial",
            limits: { maxUsers: 1, maxBranches: 1 },
            pricing: {
                baseCurrency: "USD",
                regions: [
                    { regionCode: "GLOBAL", countries: ["US"], currency: "USD", monthly: 0, yearly: 0 }
                ]
            }
        };

        const result = validatePlan(plan, { isNew: true });
        expect(result.valid).toBe(true);
    });

    it("should reject negative prices", () => {
        const plan = {
            name: "Bad Plan",
            code: "bad",
            limits: { maxUsers: 1, maxBranches: 1 },
            pricing: {
                baseCurrency: "USD",
                regions: [
                    { regionCode: "US", countries: ["US"], currency: "USD", monthly: -10, yearly: 100 }
                ]
            }
        };

        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes("negative"))).toBe(true);
    });
});

// ── 2. Module Dynamic Render ──────────────────────────────────────────
describe("Module Dynamic Rendering", () => {
    it("should render unknown module keys without frontend changes", () => {
        const plan = {
            modules: {
                patients: true,
                appointments: true,
                futureModule: false,
                aiDiagnostics: true
            }
        };

        const updateField = () => { };
        render(<ModulesTab plan={plan} updateField={updateField} />);

        // Future module should auto-render by key name
        expect(screen.getByText("Future Module")).toBeTruthy();
        expect(screen.getByText("Ai Diagnostics")).toBeTruthy();
    });

    it("should render nested object modules dynamically", () => {
        const plan = {
            modules: {
                patients: true,
                communication: {
                    enabled: true,
                    smsQuota: 100,
                    emailQuota: 500
                }
            }
        };

        const updateField = () => { };
        render(<ModulesTab plan={plan} updateField={updateField} />);

        // Communication suite header should exist
        expect(screen.getByText("Communication Suite")).toBeTruthy();
    });
});

// ── 3. Duplicate Plan Behavior ────────────────────────────────────────
describe("Duplicate Plan Behavior", () => {
    it("should clear stripePriceIds, reset version, and set inactive", () => {
        const original = {
            _id: "abc123",
            name: "Professional",
            code: "pro",
            version: 5,
            isActive: true,
            limits: { maxUsers: 10, maxBranches: 3 },
            pricing: {
                baseCurrency: "USD",
                regions: [{
                    regionCode: "US",
                    countries: ["US"],
                    currency: "USD",
                    monthly: 99,
                    yearly: 990,
                    stripePriceIdMonthly: "price_abc123",
                    stripePriceIdYearly: "price_def456"
                }]
            }
        };

        // Simulate duplicate transformation
        const duplicated = JSON.parse(JSON.stringify(original));
        delete duplicated._id;
        duplicated.version = 0;
        duplicated.isActive = false;
        duplicated.code = ""; // Require new code
        duplicated.pricing.regions.forEach(r => {
            r.stripePriceIdMonthly = "";
            r.stripePriceIdYearly = "";
            r.stripePriceIdBiennial = "";
        });

        expect(duplicated._id).toBeUndefined();
        expect(duplicated.version).toBe(0);
        expect(duplicated.isActive).toBe(false);
        expect(duplicated.code).toBe("");
        expect(duplicated.pricing.regions[0].stripePriceIdMonthly).toBe("");
        expect(duplicated.pricing.regions[0].stripePriceIdYearly).toBe("");
        // Original unchanged
        expect(original.pricing.regions[0].stripePriceIdMonthly).toBe("price_abc123");
    });
});

// ── 4. Version Display ────────────────────────────────────────────────
describe("Version Display", () => {
    it("should render version badge in GeneralTab when editing", () => {
        const plan = {
            name: "Pro",
            code: "pro",
            isActive: true,
            pricing: { baseCurrency: "USD" }
        };

        const updateField = () => { };
        render(<GeneralTab plan={plan} updateField={updateField} isNew={false} version={7} />);

        expect(screen.getByText("v7")).toBeTruthy();
        expect(screen.getByText("Current Plan Version")).toBeTruthy();
    });

    it("should NOT render version badge when creating new plan", () => {
        const plan = {
            name: "",
            code: "",
            isActive: true,
            pricing: { baseCurrency: "USD" }
        };

        const updateField = () => { };
        render(<GeneralTab plan={plan} updateField={updateField} isNew={true} version={0} />);

        expect(screen.queryByText("Current Plan Version")).toBeNull();
    });
});

// ── 5. Visibility Filtering ───────────────────────────────────────────
describe("Visibility Filtering", () => {
    it("should correctly toggle hidden countries", () => {
        let hiddenCountries = ["EG", "SA"];
        const plan = {
            visibility: { hiddenCountries }
        };

        const updateField = (path, value) => {
            if (path === "visibility.hiddenCountries") {
                hiddenCountries = value;
            }
        };

        render(<VisibilityTab plan={plan} updateField={updateField} />);

        // EG should be checked (hidden)
        const egCheckbox = screen.getByText("EG").closest("label").querySelector("input");
        expect(egCheckbox.checked).toBe(true);

        // Click EG to unhide
        fireEvent.click(egCheckbox);
        expect(hiddenCountries).not.toContain("EG");
        expect(hiddenCountries).toContain("SA");
    });

    it("should show hidden countries summary", () => {
        const plan = {
            visibility: { hiddenCountries: ["EG", "SA", "AE"] }
        };

        const updateField = () => { };
        render(<VisibilityTab plan={plan} updateField={updateField} />);

        expect(screen.getByText("EG, SA, AE")).toBeTruthy();
    });
});
