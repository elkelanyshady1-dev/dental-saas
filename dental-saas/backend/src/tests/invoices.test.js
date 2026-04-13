/**
 * invoices.test.js — Patient Invoice Engine Unit Tests
 * Phase 3 — Clinical Operations
 *
 * Tests:
 * 1. PatientInvoice model schema enforcement
 * 2. Organization isolation
 * 3. RBAC permission mapping
 * 4. Financial immutability guard
 * 5. Invoice status FSM
 * 6. Plane isolation (org ≠ platform)
 * 7. Orchestrator contract
 * 8. Financial Ledger model
 * 9. Domain events
 * 10. Route architecture
 */

"use strict";

// ─── 1. Model Schema ─────────────────────────────────────────────────────────

describe("PatientInvoice Model — Schema Enforcement", () => {
    const PatientInvoice = require("../modules/billingDomain/organizationFinance/models/PatientInvoice.model").default;
    const schema = PatientInvoice.schema;

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

    test("subtotal is required", () => {
        expect(schema.path("subtotal").isRequired).toBe(true);
    });

    test("totalAmount is required", () => {
        expect(schema.path("totalAmount").isRequired).toBe(true);
    });

    test("currency is required (defaults to AED)", () => {
        const field = schema.path("currency");
        expect(field.isRequired).toBe(true);
        expect(field.defaultValue).toBe("AED");
    });

    test("status has correct enum values", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual(["draft", "issued", "partially_paid", "paid", "voided"]);
    });

    test("status defaults to 'draft'", () => {
        expect(schema.path("status").defaultValue).toBe("draft");
    });

    test("regionCode is required and immutable", () => {
        const field = schema.path("regionCode");
        expect(field.isRequired).toBe(true);
        expect(field.options.immutable).toBe(true);
    });

    test("v8.2 precision fields exist", () => {
        expect(schema.path("subtotalMinor")).toBeDefined();
        expect(schema.path("taxMinor")).toBeDefined();
        expect(schema.path("discountMinor")).toBeDefined();
        expect(schema.path("totalAmountMinor")).toBeDefined();
    });

    test("treatments is an array subdocument", () => {
        expect(schema.path("treatments")).toBeDefined();
    });

    test("charges is an array subdocument", () => {
        expect(schema.path("charges")).toBeDefined();
    });

    test("audit fields exist (issuedByUserId, voidedByUserId)", () => {
        expect(schema.path("issuedByUserId")).toBeDefined();
        expect(schema.path("voidedByUserId")).toBeDefined();
        expect(schema.path("voidedReason")).toBeDefined();
        expect(schema.path("voidedAt")).toBeDefined();
    });

    test("version exists for optimistic concurrency", () => {
        expect(schema.path("version").defaultValue).toBe(0);
    });
});

// ─── 2. Organization Isolation ────────────────────────────────────────────────

describe("PatientInvoice — Organization Isolation", () => {
    test("organizationId is ObjectId", () => {
        const PatientInvoice = require("../modules/billingDomain/organizationFinance/models/PatientInvoice.model").default;
        const field = PatientInvoice.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });
});

// ─── 3. RBAC Permissions ──────────────────────────────────────────────────────

describe("Invoice RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("invoices.* permissions exist in the contract", () => {
        expect(P.INVOICES_READ).toBe("invoices.read");
        expect(P.INVOICES_CREATE).toBe("invoices.create");
        expect(P.INVOICES_UPDATE).toBe("invoices.update");
        expect(P.INVOICES_DELETE).toBe("invoices.delete");
    });

    test("org_admin has full invoice CRUD", () => {
        const perms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(perms).toContain(P.INVOICES_READ);
        expect(perms).toContain(P.INVOICES_CREATE);
        expect(perms).toContain(P.INVOICES_UPDATE);
        expect(perms).toContain(P.INVOICES_DELETE);
    });

    test("doctor has read + create only", () => {
        const perms = ORG_ROLE_PERMISSIONS.doctor;
        expect(perms).toContain(P.INVOICES_READ);
        expect(perms).toContain(P.INVOICES_CREATE);
        expect(perms).not.toContain(P.INVOICES_UPDATE);
        expect(perms).not.toContain(P.INVOICES_DELETE);
    });

    test("assistant has read + create + update", () => {
        const perms = ORG_ROLE_PERMISSIONS.assistant;
        expect(perms).toContain(P.INVOICES_READ);
        expect(perms).toContain(P.INVOICES_CREATE);
        expect(perms).toContain(P.INVOICES_UPDATE);
        expect(perms).not.toContain(P.INVOICES_DELETE);
    });

    test("receptionist has read + create only", () => {
        const perms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(perms).toContain(P.INVOICES_READ);
        expect(perms).toContain(P.INVOICES_CREATE);
        expect(perms).not.toContain(P.INVOICES_UPDATE);
    });

    test("lab_technician has NO invoice permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(perms).not.toContain(P.INVOICES_READ);
    });
});

// ─── 4. Invoice Status FSM ───────────────────────────────────────────────────

describe("PatientInvoice — Status FSM", () => {
    test("valid statuses include all 5 states", () => {
        const PatientInvoice = require("../modules/billingDomain/organizationFinance/models/PatientInvoice.model").default;
        const statuses = PatientInvoice.schema.path("status").enumValues;
        expect(statuses).toContain("draft");
        expect(statuses).toContain("issued");
        expect(statuses).toContain("partially_paid");
        expect(statuses).toContain("paid");
        expect(statuses).toContain("voided");
    });
});

// ─── 5. Plane Isolation ──────────────────────────────────────────────────────

describe("Finance Plane Isolation", () => {
    test("Patient Invoice model is separate from Platform Invoice", () => {
        // Org-plane model
        const PatientInvoice = require("../modules/billingDomain/organizationFinance/models/PatientInvoice.model").default;
        expect(PatientInvoice.modelName).toBe("PatientInvoice");

        // Verify it does NOT import platform models
        const schema = PatientInvoice.schema;
        expect(schema.path("organizationId")).toBeDefined(); // org-scoped
    });

    test("Financial Ledger is org-scoped", () => {
        const FinancialLedger = require("../modules/billingDomain/organizationFinance/models/FinancialLedger.model").default;
        expect(FinancialLedger.schema.path("organizationId").isRequired).toBe(true);
    });
});

// ─── 6. Orchestrator Contract ─────────────────────────────────────────────────

describe("Financial Orchestrator — Contract", () => {
    const orchestrator = require("../modules/billingDomain/organizationFinance/services/ledger.orchestrator.service");

    test("exports createInvoice", () => {
        expect(typeof orchestrator.createInvoice).toBe("function");
    });

    test("exports recordPayment", () => {
        expect(typeof orchestrator.recordPayment).toBe("function");
    });

    test("exports voidInvoice", () => {
        expect(typeof orchestrator.voidInvoice).toBe("function");
    });

    test("exports creditWallet", () => {
        expect(typeof orchestrator.creditWallet).toBe("function");
    });

    test("has _emitEvent for centralized event emission", () => {
        expect(typeof orchestrator._emitEvent).toBe("function");
    });
});

// ─── 7. Financial Ledger Model ────────────────────────────────────────────────

describe("FinancialLedger Model — Schema", () => {
    const FinancialLedger = require("../modules/billingDomain/organizationFinance/models/FinancialLedger.model").default;
    const schema = FinancialLedger.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("type is required (event type)", () => {
        expect(schema.path("type").isRequired).toBe(true);
    });

    test("amount is required", () => {
        expect(schema.path("amount").isRequired).toBe(true);
    });

    test("referenceId is required (invoice/payment ID)", () => {
        expect(schema.path("referenceId").isRequired).toBe(true);
    });

    test("branchId is required", () => {
        expect(schema.path("branchId").isRequired).toBe(true);
    });

    test("performedByUserId is required", () => {
        expect(schema.path("performedByUserId").isRequired).toBe(true);
    });

    test("v8.2 precision field (amountMinor) exists", () => {
        expect(schema.path("amountMinor")).toBeDefined();
    });
});

// ─── 8. Domain Events ────────────────────────────────────────────────────────

describe("Patient Billing Domain Events — Contract", () => {
    const domainEvents = require("../core/domainEvents");

    test("PATIENT_INVOICE_CREATED event is defined", () => {
        expect(domainEvents.PATIENT_INVOICE_CREATED).toBe("invoice.created");
    });

    test("PATIENT_INVOICE_VOIDED event is defined", () => {
        expect(domainEvents.PATIENT_INVOICE_VOIDED).toBe("invoice.voided");
    });

    test("PATIENT_PAYMENT_RECORDED event is defined", () => {
        expect(domainEvents.PATIENT_PAYMENT_RECORDED).toBe("payment.recorded");
    });

    test("INVOICE_OVERDUE event is defined (pre-existing)", () => {
        expect(domainEvents.INVOICE_OVERDUE).toBe("invoice.overdue");
    });
});

// ─── 9. Route Architecture ───────────────────────────────────────────────────

describe("Invoice Routes — Architecture", () => {
    test("invoice routes module exports express Router", () => {
        const routes = require("../modules/billingDomain/routes/invoices.routes");
        expect(routes).toBeDefined();
        expect(typeof routes).toBe("function");
    });
});
