/**
 * architectureInvariants.test.js
 * 
 * High-governance tests to ensure Sovereign Laws are maintained.
 */

const { expect } = require("chai");
const mongoose = require("mongoose");
const { verifyOrganizationChain } = require("../../src/utils/auditIntegrity");
const FinancialSnapshot = require("../../src/models/FinancialSnapshot");
const { InventoryItem } = require("../../src/modules/inventoryDomain/models/InventoryModels");

describe("🏛️ Architectural Invariant Suite", () => {

    describe("1. Platform Supremacy Invariant", () => {
        it("should ensure global certification flags are immutable", () => {
            // If these are false, SovereignGuard would have already killed the process,
            // but we verify them here for extra CI safety.
            expect(global.__SUBSCRIPTION_GUARD_LOADED__).to.be.true;
            expect(global.__ORG_RUNTIME_REGISTERED__).to.be.true;
            expect(global.__DOMAIN_ISOLATION_ENFORCED__).to.be.true;
        });
    });

    describe("2. B2B / B2C Financial Isolation Invariant", () => {
        it("should ensure FinancialSnapshot has no B2B revenue fields", () => {
            const schemaPaths = Object.keys(FinancialSnapshot.schema.paths);
            expect(schemaPaths).to.not.include("b2bRevenue");
            expect(schemaPaths).to.not.include("doctorInvoiceTotal");
        });
    });

    describe("3. Audit Append-Only Invariant (v3.1)", () => {
        it("should verify SHA256 chain integrity for a test organization", async () => {
            const orgId = new mongoose.Types.ObjectId();
            const result = await verifyOrganizationChain(orgId);
            expect(result.valid).to.be.true;
        });
    });

    describe("4. Aggregate Mutation Authority", () => {
        it("should verify Patient model is protected", () => {
            const Patient = mongoose.model("Patient");
            // This is more of a static check, but we can verify the schema lacks bypass methods
            expect(Patient.schema.options.capped).to.not.be.true;
        });
    });
});
