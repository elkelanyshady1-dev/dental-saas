"use strict";

/**
 * fileValidation.contract.test.js
 *
 * Contract tests for the magic-byte file validation service. Exercises the
 * PRIMARY path via real byte signatures (no mocking) — if file-type ever
 * regresses or is bumped to a version that changes behavior, these tests
 * surface it immediately. Fallback paths are covered via the exported
 * `_inferFallbackFileType` helper.
 *
 * NOTE: the service loads file-type via dynamic import (ESM). Each async
 * test is allocated a 10s timeout to cover the first-call module load.
 */

const svc = require("../modules/storage/services/fileValidation.service");
const {
    validateAndDetectFileType,
    MAX_UPLOAD_BYTES,
    MAGIC_EXT_TO_FILETYPE,
    _inferFallbackFileType,
} = svc;

// ── Tiny byte fixtures — real magic-byte headers for each format we accept ──

// PNG:  89 50 4E 47 0D 0A 1A 0A  + minimal IHDR padding
const PNG_BYTES = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89,
]);

// JPEG: FF D8 FF E0 + JFIF marker
const JPEG_BYTES = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9,
]);

// PDF: %PDF-1.4 header
const PDF_BYTES = Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.alloc(256, 0x20),
    Buffer.from("\n%%EOF\n"),
]);

function _mkFile(buffer, { name = "x.bin", mime = "application/octet-stream", size } = {}) {
    return {
        buffer,
        originalname: name,
        mimetype: mime,
        size: size ?? buffer.length,
    };
}

// ─── 1. Constants + allow-list ───────────────────────────────────────────────

describe("fileValidation — allow-list + constants", () => {
    test("MAX_UPLOAD_BYTES is 20 MB", () => {
        expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    });

    test("allow-list maps to the four frontend renderer classes", () => {
        const targets = new Set(Object.values(MAGIC_EXT_TO_FILETYPE));
        expect(targets.has("image")).toBe(true);
        expect(targets.has("pdf")).toBe(true);
        expect(targets.has("dicom")).toBe(true);
        // ASCII STL has a magic signature; binary STL uses the fallback. Both
        // must resolve to "3d", so "3d" lives on the allow-list.
        expect(targets.has("3d")).toBe(true);
    });

    test("image allow-list covers common web formats", () => {
        for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff"]) {
            expect(MAGIC_EXT_TO_FILETYPE[ext]).toBe("image");
        }
    });
});

// ─── 2. Primary (magic-byte) path ────────────────────────────────────────────

describe("fileValidation — magic-byte path", () => {
    test("detects PNG by signature → fileType=image, source=magic", async () => {
        const result = await validateAndDetectFileType(_mkFile(PNG_BYTES, { name: "photo.png", mime: "image/png" }));
        expect(result.fileType).toBe("image");
        expect(result.source).toBe("magic");
        expect(result.detectedExt).toBe("png");
    }, 10000);

    test("detects JPEG by signature", async () => {
        const result = await validateAndDetectFileType(_mkFile(JPEG_BYTES, { name: "photo.jpg", mime: "image/jpeg" }));
        expect(result.fileType).toBe("image");
        expect(result.source).toBe("magic");
        expect(["jpg", "jpeg"]).toContain(result.detectedExt);
    }, 10000);

    test("detects PDF by %PDF- header", async () => {
        const result = await validateAndDetectFileType(_mkFile(PDF_BYTES, { name: "doc.pdf", mime: "application/pdf" }));
        expect(result.fileType).toBe("pdf");
        expect(result.source).toBe("magic");
        expect(result.detectedExt).toBe("pdf");
    }, 10000);

    test("rejects a PDF renamed to .jpg — signature wins over extension", async () => {
        // Upload claims to be a JPEG (by name + MIME) but bytes are a PDF.
        // Magic-byte wins → identified as pdf → PDF is allow-listed, so the
        // detected class is "pdf" regardless of the lying client. This is
        // the anti-spoofing contract: clients cannot misclassify uploads.
        const result = await validateAndDetectFileType(
            _mkFile(PDF_BYTES, { name: "evil.jpg", mime: "image/jpeg" }),
        );
        expect(result.fileType).toBe("pdf");
        expect(result.source).toBe("magic");
    }, 10000);
});

// ─── 3. Fallback path (DICOM / STL) ──────────────────────────────────────────

describe("fileValidation — fallback path", () => {
    test("fallback maps .stl extension → 3d", () => {
        expect(_inferFallbackFileType({ originalname: "model.stl", mimetype: "application/octet-stream" })).toBe("3d");
    });

    test("fallback maps model/* MIME → 3d", () => {
        expect(_inferFallbackFileType({ originalname: "scan.bin", mimetype: "model/stl" })).toBe("3d");
    });

    test("fallback maps .dcm extension → dicom", () => {
        expect(_inferFallbackFileType({ originalname: "series-001.dcm", mimetype: "application/octet-stream" })).toBe("dicom");
    });

    test("fallback maps application/dicom MIME → dicom", () => {
        expect(_inferFallbackFileType({ originalname: "x.bin", mimetype: "application/dicom" })).toBe("dicom");
    });

    test("fallback refuses unknown filenames", () => {
        expect(_inferFallbackFileType({ originalname: "notes.txt", mimetype: "text/plain" })).toBe(null);
    });

    test("ASCII STL is detected by magic bytes (source=magic)", async () => {
        // file-type@16 recognizes the "solid <name>" ASCII STL prefix, so
        // ASCII STL takes the MAGIC path (not fallback) and maps to "3d".
        const asciiStl = Buffer.from("solid cube\n  facet normal 0 0 1\n  endfacet\nendsolid cube\n");
        const result = await validateAndDetectFileType(
            _mkFile(asciiStl, { name: "cube.stl", mime: "model/stl" }),
        );
        expect(result.fileType).toBe("3d");
        expect(result.source).toBe("magic");
        expect(result.detectedExt).toBe("stl");
    }, 10000);

    test("Binary STL (no magic bytes) succeeds via fallback when extension matches", async () => {
        // Binary STL starts with an 80-byte header (commonly zeros) — no
        // magic signature. file-type returns null → fallback picks up the
        // .stl extension / model/stl MIME.
        const binaryStl = Buffer.concat([
            Buffer.alloc(80, 0x00),              // 80-byte header
            Buffer.from([0x00, 0x00, 0x00, 0x00]) // triangle count = 0
        ]);
        const result = await validateAndDetectFileType(
            _mkFile(binaryStl, { name: "mesh.stl", mime: "model/stl" }),
        );
        expect(result.fileType).toBe("3d");
        expect(result.source).toBe("fallback");
    }, 10000);
});

// ─── 4. Rejection paths ──────────────────────────────────────────────────────

describe("fileValidation — rejection paths", () => {
    test("rejects oversized buffer with FILE_TOO_LARGE (413)", async () => {
        const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
        try {
            await validateAndDetectFileType(_mkFile(oversized, { name: "huge.bin", size: oversized.length }));
            throw new Error("expected throw");
        } catch (e) {
            expect(e.code).toBe("FILE_TOO_LARGE");
            expect(e.statusCode).toBe(413);
        }
    }, 10000);

    test("rejects missing buffer with MISSING_FILE (400)", async () => {
        try {
            await validateAndDetectFileType({ originalname: "x.png", mimetype: "image/png" });
            throw new Error("expected throw");
        } catch (e) {
            expect(e.code).toBe("MISSING_FILE");
            expect(e.statusCode).toBe(400);
        }
    });

    test("rejects unknown binary with UNKNOWN_FILE_TYPE (400)", async () => {
        // Random noise — not identifiable by magic bytes and no STL/DICOM hints.
        const noise = Buffer.alloc(256).fill(0x41);
        try {
            await validateAndDetectFileType(_mkFile(noise, { name: "random.bin", mime: "application/octet-stream" }));
            throw new Error("expected throw");
        } catch (e) {
            expect(e.code).toBe("UNKNOWN_FILE_TYPE");
            expect(e.statusCode).toBe(400);
        }
    }, 10000);

    test("rejects non-allow-listed magic signatures with INVALID_FILE_TYPE (400)", async () => {
        // 7z archive signature — file-type identifies it reliably as "7z",
        // which is NOT on our allow-list → INVALID_FILE_TYPE. Proves the
        // service refuses arbitrary identified formats.
        const sevenZ = Buffer.concat([
            Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]),
            Buffer.alloc(32),
        ]);
        try {
            await validateAndDetectFileType(_mkFile(sevenZ, { name: "archive.7z", mime: "application/x-7z-compressed" }));
            throw new Error("expected throw");
        } catch (e) {
            expect(e.code).toBe("INVALID_FILE_TYPE");
            expect(e.statusCode).toBe(400);
        }
    }, 10000);
});
