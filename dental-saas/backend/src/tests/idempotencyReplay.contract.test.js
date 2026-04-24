/**
 * idempotencyReplay.contract.test.js — H2 replay-rehydration hook.
 *
 * Covers the four behaviours of the `onReplay` contract:
 *   - no hook            → cached body replayed verbatim, X-Idempotency-Replay: true
 *   - hook returns null  → same as above
 *   - hook returns body  → replay merged body, header becomes "rehydrated"
 *   - hook throws        → fall back to cached body, never break replay
 *
 * The IdempotencyKey Mongoose model is mocked so this stays a pure contract
 * test (no Mongo boot). The focus is the middleware's control flow.
 */

"use strict";

jest.mock("../core/IdempotencyKey.model", () => {
    const findOneAndUpdate = jest.fn();
    const updateOne        = jest.fn(() => ({ catch: () => {} }));
    return {
        __esModule: true,
        default: { findOneAndUpdate, updateOne },
        findOneAndUpdate,
        updateOne,
    };
});

const IdempotencyKey = require("../core/IdempotencyKey.model").default;
const idempotency    = require("../middleware/idempotency.middleware");

function makeReq(overrides = {}) {
    return {
        get:       (name) => (name.toLowerCase() === "idempotency-key" ? "abcdefgh12345678" : null),
        context:   { organizationId: "org-1", userId: "user-1" },
        requestId: "trace-xyz",
        ...overrides,
    };
}

function makeRes() {
    const res = {};
    res.statusCode = null;
    res.body = null;
    res.headers = {};
    res.status    = jest.fn((code) => { res.statusCode = code; return res; });
    res.json      = jest.fn((body) => { res.body = body; return res; });
    res.setHeader = jest.fn((k, v) => { res.headers[k] = v; });
    return res;
}

function primeCompleted(cachedBody) {
    IdempotencyKey.findOneAndUpdate.mockImplementation(() => ({
        lean: () => Promise.resolve({
            key:            "abcdefgh12345678",
            organizationId: "org-1",
            status:         "completed",
            response:       { statusCode: 201, body: cachedBody },
        }),
    }));
}

describe("idempotency middleware — onReplay contract (H2)", () => {
    beforeEach(() => {
        IdempotencyKey.findOneAndUpdate.mockReset();
        IdempotencyKey.updateOne.mockReset();
    });

    test("factory validates onReplay must be a function when provided", () => {
        expect(() => idempotency({ scope: "x", onReplay: "not-a-fn" })).toThrow(/onReplay must be a function/);
        expect(() => idempotency({ scope: "x", onReplay: undefined })).not.toThrow();
    });

    test("no hook → replay cached body verbatim with X-Idempotency-Replay: true", async () => {
        const cached = { success: true, data: { uploaded: [{ id: "p1" }] } };
        primeCompleted(cached);
        const mw = idempotency({ scope: "imagePool.bulkUpload" });

        const res = makeRes();
        await mw(makeReq(), res, jest.fn());

        expect(res.statusCode).toBe(201);
        expect(res.body).toEqual(cached);
        expect(res.headers["X-Idempotency-Replay"]).toBe("true");
    });

    test("hook returns null → replay cached body verbatim", async () => {
        const cached = { success: true, data: { uploaded: [{ id: "p1" }] } };
        primeCompleted(cached);
        const onReplay = jest.fn().mockResolvedValue(null);
        const mw = idempotency({ scope: "imagePool.bulkUpload", onReplay });

        const res = makeRes();
        await mw(makeReq(), res, jest.fn());

        expect(onReplay).toHaveBeenCalled();
        expect(res.body).toEqual(cached);
        expect(res.headers["X-Idempotency-Replay"]).toBe("true");
    });

    test("hook returns { body } → merged body replayed, header becomes 'rehydrated'", async () => {
        const cached = { success: true, data: { uploaded: [{ id: "p1" }, { id: "p2" }] } };
        primeCompleted(cached);
        const rehydrated = {
            success: true,
            data: { uploaded: [{ id: "p1" }], rejected: [{ originalName: "p2", reason: "NOT_IN_POOL" }] },
        };
        const onReplay = jest.fn().mockResolvedValue({ body: rehydrated });
        const mw = idempotency({ scope: "imagePool.bulkUpload", onReplay });

        const res = makeRes();
        await mw(makeReq(), res, jest.fn());

        expect(res.statusCode).toBe(201);
        expect(res.body).toEqual(rehydrated);
        expect(res.headers["X-Idempotency-Replay"]).toBe("rehydrated");
    });

    test("hook returns { body, statusCode } → both override", async () => {
        const cached = { success: true, data: {} };
        primeCompleted(cached);
        const onReplay = jest.fn().mockResolvedValue({ body: { ok: false }, statusCode: 410 });
        const mw = idempotency({ scope: "imagePool.bulkUpload", onReplay });

        const res = makeRes();
        await mw(makeReq(), res, jest.fn());

        expect(res.statusCode).toBe(410);
        expect(res.body).toEqual({ ok: false });
    });

    test("hook throws → fall back to cached body; replay is never blocked", async () => {
        const cached = { success: true, data: { uploaded: [{ id: "p1" }] } };
        primeCompleted(cached);
        const onReplay = jest.fn().mockRejectedValue(new Error("db exploded"));
        const mw = idempotency({ scope: "imagePool.bulkUpload", onReplay });

        const res = makeRes();
        await mw(makeReq(), res, jest.fn());

        expect(res.statusCode).toBe(201);
        expect(res.body).toEqual(cached);
        // Header was set to "true" before the hook ran; hook throw leaves it as-is.
        expect(res.headers["X-Idempotency-Replay"]).toBe("true");
    });
});
