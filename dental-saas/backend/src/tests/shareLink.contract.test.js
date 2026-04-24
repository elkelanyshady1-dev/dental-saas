"use strict";

/**
 * shareLink.contract.test.js
 *
 * Contract tests for the public share-link resolver:
 *   1. ShareLink schema shape (enums, uniqueness, TTL)
 *   2. DTO payload strictness — no storageKey/bucket/checksum leakage
 *   3. DTO includes mandatory fields (fileType, mimeType, signedUrl, etc.)
 *
 * Controller-level error-path tests (INVALID_PHOTO_FILETYPE, LINK_EXPIRED,
 * LINK_NOT_FOUND) require a live DB + stored model compilation, covered by
 * the integration suite.
 */

// ─── 1. ShareLink Schema ─────────────────────────────────────────────────────

describe("ShareLink — Schema Contract", () => {
    const ShareLink = require("../modules/share/models/ShareLink.model").default;
    const schema = ShareLink.schema;

    test("required fields are marked required", () => {
        for (const path of ["organizationId", "resourceType", "resourceId", "token", "permission", "expiresAt"]) {
            expect(schema.path(path)?.isRequired).toBe(true);
        }
    });

    test("resourceType enum is restricted", () => {
        expect(schema.path("resourceType").enumValues).toEqual(["photo"]);
    });

    test("permission enum allows only view/download", () => {
        expect(schema.path("permission").enumValues).toEqual(["view", "download"]);
    });

    test("token is unique", () => {
        const indexes = schema.indexes();
        const tokenIdx = indexes.find(([spec]) => spec.token === 1);
        expect(tokenIdx).toBeDefined();
        expect(tokenIdx[1].unique).toBe(true);
    });

    test("expiresAt has a TTL index", () => {
        const expiresPath = schema.path("expiresAt");
        // Mongoose attaches expires via path options
        expect(expiresPath.options?.index?.expires).toBeDefined();
    });
});

// ─── 2. DTO payload strictness ───────────────────────────────────────────────

describe("ShareLink — DTO payload", () => {
    const { buildResolvedShareDTO } = require("../modules/share/dto/shareLink.dto");

    function _fixtures() {
        const link = {
            permission: "view",
            expiresAt: new Date("2030-01-01T00:00:00Z"),
        };
        const photo = {
            fileType: "image",
            mimeType: "image/jpeg",
            storageKey: "SECRET/org/abc/photo-123.jpg", // MUST NOT leak
            checksum:   "deadbeef",
            metadata: { originalName: "x.jpg", sizeBytes: 1024 },
        };
        const signedUrl = "https://cdn.example.com/signed?sig=abc";
        return { link, photo, signedUrl };
    }

    test("DTO includes the mandatory asset contract fields", () => {
        const { link, photo, signedUrl } = _fixtures();
        const dto = buildResolvedShareDTO({ link, photo, signedUrl });

        expect(dto.type).toBe("photo");
        expect(dto.fileType).toBe("image");
        expect(dto.mimeType).toBe("image/jpeg");
        expect(dto.signedUrl).toBe(signedUrl);
        expect(dto.permission).toBe("view");
        expect(dto.expiresAt).toBe("2030-01-01T00:00:00.000Z");
        expect(dto.fileName).toBe("x.jpg");
        expect(dto.sizeBytes).toBe(1024);
    });

    test("DTO does NOT leak storageKey / bucket / checksum", () => {
        const { link, photo, signedUrl } = _fixtures();
        const dto = buildResolvedShareDTO({ link, photo, signedUrl });

        expect(dto).not.toHaveProperty("storageKey");
        expect(dto).not.toHaveProperty("bucket");
        expect(dto).not.toHaveProperty("checksum");
        // Sanity: no nested field leaks via JSON either.
        const serialized = JSON.stringify(dto);
        expect(serialized).not.toMatch(/SECRET/);
        expect(serialized).not.toMatch(/deadbeef/);
    });

    test("DTO preserves each fileType faithfully", () => {
        for (const ft of ["image", "pdf", "3d", "dicom"]) {
            const { link, photo, signedUrl } = _fixtures();
            const dto = buildResolvedShareDTO({ link, photo: { ...photo, fileType: ft }, signedUrl });
            expect(dto.fileType).toBe(ft);
        }
    });

    test("§3 — DTO rejects missing signedUrl (SHARE_PAYLOAD_INVALID)", () => {
        const { link, photo } = _fixtures();
        try {
            buildResolvedShareDTO({ link, photo, signedUrl: null });
            throw new Error("expected throw");
        } catch (e) {
            expect(e.code).toBe("SHARE_PAYLOAD_INVALID");
            expect(e.statusCode).toBe(500);
        }
    });

    test("§3 — DTO rejects missing fileType (SHARE_PAYLOAD_INVALID)", () => {
        const { link, photo, signedUrl } = _fixtures();
        try {
            buildResolvedShareDTO({ link, photo: { ...photo, fileType: null }, signedUrl });
            throw new Error("expected throw");
        } catch (e) {
            expect(e.code).toBe("SHARE_PAYLOAD_INVALID");
        }
    });
});

// ─── 3. Post-ship controller constants ───────────────────────────────────────

describe("ShareLink — post-ship constants", () => {
    const ctrl = require("../modules/share/controllers/shareLink.controller");

    test("§2 — MIN_TOKEN_LENGTH is at least 32", () => {
        expect(ctrl.MIN_TOKEN_LENGTH).toBeGreaterThanOrEqual(32);
    });

    test("§7 — MAX_SHARE_SIZE_BYTES is 50 MB", () => {
        expect(ctrl.MAX_SHARE_SIZE_BYTES).toBe(50 * 1024 * 1024);
    });

    test("§8 — health handler returns { ok: true, shareEnabled: true }", () => {
        const captured = { status: null, body: null };
        const res = {
            status(code) { captured.status = code; return this; },
            json(b)      { captured.body = b; return this; },
        };
        ctrl.health({}, res);
        // health returns synchronously — no status() call means 200 default.
        expect(captured.body?.success).toBe(true);
        expect(captured.body?.data?.ok).toBe(true);
        expect(captured.body?.data?.shareEnabled).toBe(true);
    });
});
