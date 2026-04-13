/**
 * payments.test.js — Patient Payment Engine Unit Tests
 * Phase 3 — Clinical Operations
 *
 * Tests:
 * 1. PatientPayment model schema enforcement
 * 2. PaymentAllocation model schema
 * 3. Organization isolation
 * 4. RBAC permission mapping
 * 5. InvoiceStatus derivation service contract
 * 6. Financial read service contract
 * 7. Route architecture
 */

"use strict";

// ─── 1. PatientPayment Model ─────────────────────────────────────────────────

describe("PatientPayment Model — Schema Enforcement", () => {
    const PatientPayment = require("../modules/billingDomain/organizationFinance/models/PatientPayment.model").default;
    const schema = PatientPayment.schema;

    test("organizationId is required", () => {
        const field = schema.path("organizationId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("branchId is required", () => {
        expect(schema.path("branchId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("amount is required", () => {
        expect(schema.path("amount").isRequired).toBe(true);
    });

    test("paymentMethod is required", () => {
        expect(schema.path("paymentMethod").isRequired).toBe(true);
    });

    test("collectedByUserId is required", () => {
        expect(schema.path("collectedByUserId").isRequired).toBe(true);
    });

    test("status has correct enum values", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual(["active", "refunded", "transferred"]);
    });

    test("status defaults to 'active'", () => {
        expect(schema.path("status").defaultValue).toBe("active");
    });

    test("invoiceId reference exists (optional)", () => {
        expect(schema.path("invoiceId")).toBeDefined();
    });

    test("v8.2 precision field (amountMinor) exists", () => {
        expect(schema.path("amountMinor")).toBeDefined();
    });

    test("currency defaults to AED", () => {
        expect(schema.path("currency").defaultValue).toBe("AED");
    });

    test("version exists for OAV", () => {
        expect(schema.path("version").defaultValue).toBe(0);
    });
});

// ─── 2. PaymentAllocation Model ──────────────────────────────────────────────

describe("PaymentAllocation Model — Schema Enforcement", () => {
    const PaymentAllocation = require("../modules/billingDomain/organizationFinance/models/PaymentAllocation.model").default;
    const schema = PaymentAllocation.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("paymentId is required", () => {
        expect(schema.path("paymentId").isRequired).toBe(true);
    });

    test("invoiceId is required", () => {
        expect(schema.path("invoiceId").isRequired).toBe(true);
    });

    test("allocatedAmount is required", () => {
        expect(schema.path("allocatedAmount").isRequired).toBe(true);
    });

    test("v8.2 precision field (allocatedAmountMinor) exists", () => {
        expect(schema.path("allocatedAmountMinor")).toBeDefined();
    });
});

// ─── 3. Organization Isolation ────────────────────────────────────────────────

describe("Payment Domain — Organization Isolation", () => {
    test("PatientPayment has required organizationId", () => {
        const PatientPayment = require("../modules/billingDomain/organizationFinance/models/PatientPayment.model").default;
        const field = PatientPayment.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });

    test("PaymentAllocation has required organizationId", () => {
        const PaymentAllocation = require("../modules/billingDomain/organizationFinance/models/PaymentAllocation.model").default;
        const field = PaymentAllocation.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });
});

// ─── 4. RBAC Permissions ──────────────────────────────────────────────────────

describe("Payment RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("payments.* permissions exist in the contract", () => {
        expect(P.PAYMENTS_READ).toBe("payments.read");
        expect(P.PAYMENTS_CREATE).toBe("payments.create");
        expect(P.PAYMENTS_UPDATE).toBe("payments.update");
        expect(P.PAYMENTS_DELETE).toBe("payments.delete");
    });

    test("org_admin has full payment CRUD", () => {
        const perms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(perms).toContain(P.PAYMENTS_READ);
        expect(perms).toContain(P.PAYMENTS_CREATE);
        expect(perms).toContain(P.PAYMENTS_UPDATE);
        expect(perms).toContain(P.PAYMENTS_DELETE);
    });

    test("doctor has read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.doctor;
        expect(perms).toContain(P.PAYMENTS_READ);
        expect(perms).not.toContain(P.PAYMENTS_CREATE);
    });

    test("receptionist has read + create", () => {
        const perms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(perms).toContain(P.PAYMENTS_READ);
        expect(perms).toContain(P.PAYMENTS_CREATE);
        expect(perms).not.toContain(P.PAYMENTS_UPDATE);
    });

    test("assistant has read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.assistant;
        expect(perms).toContain(P.PAYMENTS_READ);
        expect(perms).not.toContain(P.PAYMENTS_CREATE);
    });

    test("lab_technician has NO payment permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(perms).not.toContain(P.PAYMENTS_READ);
    });
});

// ─── 5. Invoice Status Derivation ────────────────────────────────────────────

describe("InvoiceStatus Derivation — Contract", () => {
    const { deriveInvoiceStatus } = require("../modules/billingDomain/organizationFinance/services/invoiceStatus.service");

    test("exports deriveInvoiceStatus function", () => {
        expect(typeof deriveInvoiceStatus).toBe("function");
    });
});

// ─── 6. Financial Read Service ────────────────────────────────────────────────

describe("Financial Read Service — Contract", () => {
    const readService = require("../modules/billingDomain/organizationFinance/services/clinicLedger.service");

    test("exports getInvoiceById", () => {
        expect(typeof readService.getInvoiceById).toBe("function");
    });

    test("exports getPaymentById", () => {
        expect(typeof readService.getPaymentById).toBe("function");
    });

    test("exports listInvoices", () => {
        expect(typeof readService.listInvoices).toBe("function");
    });

    test("exports listPayments", () => {
        expect(typeof readService.listPayments).toBe("function");
    });
});

// ─── 7. Route Architecture ───────────────────────────────────────────────────

describe("Payment Routes — Architecture", () => {
    test("payment routes module exports express Router", () => {
        const routes = require("../modules/billingDomain/routes/payments.routes");
        expect(routes).toBeDefined();
        expect(typeof routes).toBe("function");
    });
});
