/**
 * multerErrorHandler.test.js — Unit tests for the canonical multer error shim.
 *
 * Exercises the three failure modes the bulk-upload pipeline relies on:
 *   - Oversize file           → 413 FILE_TOO_LARGE
 *   - Too many files          → 400 TOO_MANY_FILES
 *   - Filter rejection        → 415 UNSUPPORTED_MEDIA_TYPE
 * …plus the pass-through behaviour for non-multer errors, and the structured-
 * envelope contract (traceId, location, timestamp) every response must honour.
 */

"use strict";

const multer = require("multer");
const multerErrorHandler = require("../middleware/multerErrorHandler.middleware");

function makeRes() {
    const res = {};
    res.statusCode = null;
    res.body = null;
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res.body = body; return res; });
    return res;
}

function makeReq({ traceId = "trace-123" } = {}) {
    return { requestId: traceId, get: () => null };
}

describe("multerErrorHandler middleware", () => {
    test("LIMIT_FILE_SIZE → 413 FILE_TOO_LARGE with canonical envelope", () => {
        const handler = multerErrorHandler("imagePool.bulkUpload");
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        const err = new multer.MulterError("LIMIT_FILE_SIZE", "files");
        handler(err, req, res, next);

        expect(res.statusCode).toBe(413);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe("FILE_TOO_LARGE");
        expect(res.body.error.location).toBe("imagePool.bulkUpload");
        expect(res.body.error.traceId).toBe("trace-123");
        expect(typeof res.body.error.timestamp).toBe("string");
        expect(next).not.toHaveBeenCalled();
    });

    test("LIMIT_FILE_COUNT → 400 TOO_MANY_FILES", () => {
        const handler = multerErrorHandler("imagePool.bulkUpload");
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        handler(new multer.MulterError("LIMIT_FILE_COUNT", "files"), req, res, next);

        expect(res.statusCode).toBe(400);
        expect(res.body.error.code).toBe("TOO_MANY_FILES");
        expect(next).not.toHaveBeenCalled();
    });

    test("unknown MulterError code → 400 with that code", () => {
        const handler = multerErrorHandler();
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        handler(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "wrong_field"), req, res, next);

        expect(res.statusCode).toBe(400);
        expect(res.body.error.code).toBe("LIMIT_UNEXPECTED_FILE");
        expect(next).not.toHaveBeenCalled();
    });

    test("fileFilter rejection (non-multer Error) → 415 UNSUPPORTED_MEDIA_TYPE", () => {
        const handler = multerErrorHandler("uploads.photo");
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        const err = new Error("Only image files (JPEG, PNG, WEBP) are allowed");
        handler(err, req, res, next);

        expect(res.statusCode).toBe(415);
        expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
        expect(res.body.error.message).toMatch(/Only image files/);
        expect(next).not.toHaveBeenCalled();
    });

    test("unrelated Error → passes to next(err)", () => {
        const handler = multerErrorHandler();
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        const err = new Error("Some unrelated failure");
        handler(err, req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(err);
    });

    test("defaults location to 'multer' when not provided", () => {
        const handler = multerErrorHandler();
        const req = makeReq();
        const res = makeRes();
        handler(new multer.MulterError("LIMIT_FILE_SIZE"), req, res, jest.fn());
        expect(res.body.error.location).toBe("multer");
    });

    test("tolerates a request without a trace id", () => {
        const handler = multerErrorHandler();
        const req = {}; // no requestId / traceId
        const res = makeRes();
        handler(new multer.MulterError("LIMIT_FILE_SIZE"), req, res, jest.fn());
        expect(res.body.error.traceId).toBe(null);
    });
});
