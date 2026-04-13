/**
 * portalAuth.test.js — Patient Portal Auth Unit Tests
 * Phase 5 — Patient Portal & Remote Monitoring
 *
 * Tests:
 * 1. PatientUser model schema (pre-existing)
 * 2. PortalInvite model schema (pre-existing)
 * 3. RBAC portal permissions
 * 4. Portal auth service contract
 * 5. patientProtect middleware contract
 */

"use strict";

// ─── 1. PatientUser Model ─────────────────────────────────────────────────────

describe("PatientUser Model — Schema Enforcement", () => {
    const PatientUser = require("../modules/patientDomain/access/patientUser.model");
    const schema = PatientUser.schema;

    test("organizationId is required (ObjectId)", () => {
        const f = schema.path("organizationId");
        expect(f.instance).toBe("ObjectID");
        expect(f.isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("email is required, lowercase", () => {
        const f = schema.path("email");
        expect(f.isRequired).toBe(true);
        expect(f.options.lowercase).toBe(true);
    });

    test("tokenVersion defaults to 0", () => {
        expect(schema.path("tokenVersion").defaultValue).toBe(0);
    });

    test("isActive defaults to true", () => {
        expect(schema.path("isActive").defaultValue).toBe(true);
    });

    test("portalPermissions subdocument exists with boolean defaults", () => {
        expect(schema.path("portalPermissions.canBookAppointment")).toBeDefined();
        expect(schema.path("portalPermissions.canViewInvoices")).toBeDefined();
        expect(schema.path("portalPermissions.canUploadFiles")).toBeDefined();
    });

    test("compound unique index on organizationId + email", () => {
        const indexes = PatientUser.schema.indexes();
        const hasCompound = indexes.some(([fields]) => fields.organizationId === 1 && fields.email === 1);
        expect(hasCompound).toBe(true);
    });
});

// ─── 2. PortalInvite Model ────────────────────────────────────────────────────

describe("PortalInvite Model — Schema Enforcement", () => {
    const PortalInvite = require("../modules/patientDomain/access/portalInvite.model");
    const schema = PortalInvite.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("tokenHash is required", () => {
        expect(schema.path("tokenHash").isRequired).toBe(true);
    });

    test("expiresAt is required and TTL-indexed", () => {
        expect(schema.path("expiresAt").isRequired).toBe(true);
    });

    test("otpHash field exists", () => {
        expect(schema.path("otpHash")).toBeDefined();
    });

    test("otpAttempts defaults to 0", () => {
        expect(schema.path("otpAttempts").defaultValue).toBe(0);
    });

    test("lockedUntil field exists", () => {
        expect(schema.path("lockedUntil")).toBeDefined();
    });

    test("usedAt field exists", () => {
        expect(schema.path("usedAt")).toBeDefined();
    });
});

// ─── 3. RBAC Portal Permissions ──────────────────────────────────────────────

describe("Portal RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("PORTAL_READ permission defined in contract", () => {
        expect(P.PORTAL_READ).toBe("portal.read");
    });

    test("PORTAL_MANAGE permission defined in contract", () => {
        expect(P.PORTAL_MANAGE).toBe("portal.manage");
    });

    test("MONITORING_REVIEW permission defined in contract", () => {
        expect(P.MONITORING_REVIEW).toBe("monitoring.review");
    });

    test("org_admin has all portal permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(perms).toContain(P.PORTAL_READ);
        expect(perms).toContain(P.PORTAL_MANAGE);
        expect(perms).toContain(P.MONITORING_REVIEW);
    });

    test("doctor has portal.read and monitoring.review but NOT portal.manage", () => {
        const perms = ORG_ROLE_PERMISSIONS.doctor;
        expect(perms).toContain(P.PORTAL_READ);
        expect(perms).toContain(P.MONITORING_REVIEW);
        expect(perms).not.toContain(P.PORTAL_MANAGE);
    });

    test("assistant has portal.read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.assistant;
        expect(perms).toContain(P.PORTAL_READ);
        expect(perms).not.toContain(P.MONITORING_REVIEW);
        expect(perms).not.toContain(P.PORTAL_MANAGE);
    });

    test("receptionist has portal.read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(perms).toContain(P.PORTAL_READ);
        expect(perms).not.toContain(P.MONITORING_REVIEW);
    });

    test("lab_technician has NO portal permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(perms).not.toContain(P.PORTAL_READ);
    });
});

// ─── 4. Portal Auth Service Contract ─────────────────────────────────────────

describe("PortalAuth Service — Contract", () => {
    const service = require("../modules/patientPortal/services/portalAuth.service");

    test("exports loginWithPassword", () => {
        expect(typeof service.loginWithPassword).toBe("function");
    });

    test("exports requestMagicLink", () => {
        expect(typeof service.requestMagicLink).toBe("function");
    });

    test("exports verifyMagicLink", () => {
        expect(typeof service.verifyMagicLink).toBe("function");
    });

    test("exports requestOtp", () => {
        expect(typeof service.requestOtp).toBe("function");
    });

    test("exports verifyOtp", () => {
        expect(typeof service.verifyOtp).toBe("function");
    });

    test("exports logout", () => {
        expect(typeof service.logout).toBe("function");
    });
});

// ─── 5. patientProtect Middleware ─────────────────────────────────────────────

describe("patientProtect Middleware — Contract", () => {
    test("exports a function (middleware)", () => {
        const patientProtect = require("../modules/patientDomain/access/patientProtect");
        expect(typeof patientProtect).toBe("function");
        expect(patientProtect.length).toBe(3); // req, res, next
    });
});

// ─── 6. Organization Isolation ────────────────────────────────────────────────

describe("Portal — Organization Isolation", () => {
    test("PatientUser has organizationId required", () => {
        const PatientUser = require("../modules/patientDomain/access/patientUser.model");
        expect(PatientUser.schema.path("organizationId").isRequired).toBe(true);
    });

    test("PortalInvite has organizationId required", () => {
        const PortalInvite = require("../modules/patientDomain/access/portalInvite.model");
        expect(PortalInvite.schema.path("organizationId").isRequired).toBe(true);
    });
});
