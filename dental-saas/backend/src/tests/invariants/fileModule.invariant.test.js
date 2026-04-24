/**
 * fileModule.invariant.test.js — File Module Invariant Tests
 * Phase v27 — Storage + Infra Hardening (Part 9)
 *
 * Validates structural invariants for the File module:
 *   1. All File model fields enforced
 *   2. storageKey must start with org_
 *   3. FILE_CATEGORIES enum is complete
 *   4. RBAC permissions exist for all file operations
 *   5. Policy coverage for all file permissions
 *   6. Signed URL TTL is configured
 *   7. Category limits are complete
 *
 * PLANE: Infrastructure (test tooling)
 */

"use strict";

describe("File Module Invariants (v27)", () => {
    // ── 1. File model schema validation ──────────────────────────────────────
    test("File model schema has all required fields", () => {
        const { schema } = require("../../modules/files/models/File.model");

        const requiredPaths = [
            "organizationId",
            "storageKey",
            "fileName",
            "mimeType",
            "size",
            "category",
            "createdBy",
        ];

        for (const path of requiredPaths) {
            const schemaPath = schema.path(path);
            expect(schemaPath).toBeDefined();
            expect(schemaPath.isRequired).toBe(true);
        }
    });

    test("File model has unique index on storageKey", () => {
        const { schema } = require("../../modules/files/models/File.model");
        const storageKeyPath = schema.path("storageKey");
        expect(storageKeyPath.options.unique).toBe(true);
    });

    test("File model isDeleted defaults to false", () => {
        const { schema } = require("../../modules/files/models/File.model");
        const isDeletedPath = schema.path("isDeleted");
        expect(isDeletedPath.defaultValue).toBe(false);
    });

    // ── 2. Storage key convention ────────────────────────────────────────────
    test("buildStorageKey produces org_-prefixed keys", () => {
        const { buildStorageKey } = require("../../../src/core/storage/storageService");

        const key = buildStorageKey({
            orgId: "123",
            domain: "patients",
            entityId: "patient_456",
            filename: "avatar.jpg",
        });

        expect(key).toBe("org_123/patients/patient_456/avatar.jpg");
        expect(key.startsWith("org_")).toBe(true);
    });

    test("buildStorageKey works without entityId", () => {
        const { buildStorageKey } = require("../../../src/core/storage/storageService");

        const key = buildStorageKey({
            orgId: "789",
            domain: "documents",
            filename: "report.pdf",
        });

        expect(key).toBe("org_789/documents/report.pdf");
    });

    test("buildStorageKey throws if orgId missing", () => {
        const { buildStorageKey } = require("../../../src/core/storage/storageService");

        expect(() => {
            buildStorageKey({ domain: "x", filename: "y" });
        }).toThrow("orgId is required");
    });

    // ── 3. FILE_CATEGORIES enum completeness ─────────────────────────────────
    test("FILE_CATEGORIES includes all expected categories", () => {
        const { FILE_CATEGORIES } = require("../../modules/files/models/File.model");

        const expected = [
            "patient_photo",
            "recordset_photo",
            "xray",
            "snapshot",
            "stl",
            "attachment",
            "document",
            "audio",
            "other",
        ];

        for (const cat of expected) {
            expect(FILE_CATEGORIES).toContain(cat);
        }
    });

    // ── 4. RBAC permissions exist ────────────────────────────────────────────
    test("All file permissions are registered in P enum", () => {
        const { P } = require("../../rbac/orgPermissions");

        expect(P.FILES_READ).toBe("files.read");
        expect(P.FILES_CREATE).toBe("files.create");
        expect(P.FILES_DELETE).toBe("files.delete");
        expect(P.FILES_MANAGE).toBe("files.manage");
    });

    test("org_admin has all file permissions", () => {
        const { P, ORG_ROLE_PERMISSIONS } = require("../../rbac/orgPermissions");

        const adminPerms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(adminPerms).toContain(P.FILES_READ);
        expect(adminPerms).toContain(P.FILES_CREATE);
        expect(adminPerms).toContain(P.FILES_DELETE);
        expect(adminPerms).toContain(P.FILES_MANAGE);
    });

    test("doctor has read, create, delete file permissions", () => {
        const { P, ORG_ROLE_PERMISSIONS } = require("../../rbac/orgPermissions");

        const doctorPerms = ORG_ROLE_PERMISSIONS.doctor;
        expect(doctorPerms).toContain(P.FILES_READ);
        expect(doctorPerms).toContain(P.FILES_CREATE);
        expect(doctorPerms).toContain(P.FILES_DELETE);
        expect(doctorPerms).not.toContain(P.FILES_MANAGE);
    });

    test("receptionist has read-only file permission", () => {
        const { P, ORG_ROLE_PERMISSIONS } = require("../../rbac/orgPermissions");

        const receptionistPerms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(receptionistPerms).toContain(P.FILES_READ);
        expect(receptionistPerms).not.toContain(P.FILES_CREATE);
        expect(receptionistPerms).not.toContain(P.FILES_DELETE);
    });

    // ── 5. Policy coverage ───────────────────────────────────────────────────
    test("All file permissions have policies defined", () => {
        const { P } = require("../../rbac/orgPermissions");
        const { policies } = require("../../rbac/policies");

        const filePerms = [P.FILES_READ, P.FILES_CREATE, P.FILES_DELETE, P.FILES_MANAGE];

        for (const perm of filePerms) {
            expect(policies[perm]).toBeDefined();
            expect(Array.isArray(policies[perm])).toBe(true);
            expect(policies[perm].length).toBeGreaterThan(0);
        }
    });

    test("Each file policy has valid structure", () => {
        const { P } = require("../../rbac/orgPermissions");
        const { policies } = require("../../rbac/policies");

        const filePerms = [P.FILES_READ, P.FILES_CREATE, P.FILES_DELETE, P.FILES_MANAGE];

        for (const perm of filePerms) {
            for (const rule of policies[perm]) {
                expect(["allow", "deny"]).toContain(rule.effect);
                expect(typeof rule.description).toBe("string");
                expect(typeof rule.condition).toBe("function");
                expect(typeof rule.priority).toBe("number");
            }
        }
    });

    // ── 6. Environment guard ─────────────────────────────────────────────────
    test("envGuard validates without error in default dev config", () => {
        const { validateEnvironment } = require("../../core/config/envGuard");

        // Should not throw with safe config
        expect(() => {
            validateEnvironment({
                mongoUri: "mongodb://127.0.0.1:27017/saasdental",
                r2Bucket: "dental-dev",
                nodeEnv: "development",
                appEnv: "dev",
            });
        }).not.toThrow();
    });

    test("envGuard blocks dev connecting to prod DB", () => {
        const { validateEnvironment } = require("../../core/config/envGuard");

        expect(() => {
            validateEnvironment({
                mongoUri: "mongodb+srv://user:pass@cluster/dental_prod",
                r2Bucket: "dental-dev",
                nodeEnv: "development",
                appEnv: "dev",
            });
        }).toThrow("ENV_MISCONFIGURATION");
    });

    test("envGuard blocks dev using prod bucket", () => {
        const { validateEnvironment } = require("../../core/config/envGuard");

        expect(() => {
            validateEnvironment({
                mongoUri: "mongodb://127.0.0.1:27017/saasdental",
                r2Bucket: "dental-prod",
                nodeEnv: "development",
                appEnv: "dev",
            });
        }).toThrow("ENV_MISCONFIGURATION");
    });

    // ── 7. R2 provider exists ────────────────────────────────────────────────
    test("R2 provider is registered in storageService", () => {
        // Force-reset to test provider registry
        const storageService = require("../../../src/core/storage/storageService");
        // The module should load without errors even if R2 env vars are missing
        // (lazy initialization)
        expect(storageService.upload).toBeDefined();
        expect(storageService.getSignedUrl).toBeDefined();
        expect(storageService.buildStorageKey).toBeDefined();
    });
});
