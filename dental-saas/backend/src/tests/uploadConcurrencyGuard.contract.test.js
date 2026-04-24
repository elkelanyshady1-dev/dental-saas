/**
 * uploadConcurrencyGuard.contract.test.js — H3 process-local concurrency guard.
 *
 * Contract under test:
 *   - Requests up to `max` pass through.
 *   - Request #(max+1) short-circuits with 429 SERVER_BUSY and the canonical
 *     structured-error envelope (no next()).
 *   - `finish` releases a slot.
 *   - `close` also releases a slot (client aborted before finish).
 *   - The same response object firing BOTH finish and close only releases once.
 */

"use strict";

const { EventEmitter } = require("events");
const uploadConcurrencyGuard = require("../middleware/uploadConcurrencyGuard.middleware");

function makeReq() {
    return { requestId: "trace-abc", get: () => null };
}
function makeRes() {
    const res = new EventEmitter();
    res.statusCode = null;
    res.body = null;
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json   = jest.fn((body) => { res.body = body; return res; });
    // Express's `once` delegates to EventEmitter.once — EventEmitter already has it.
    return res;
}

describe("uploadConcurrencyGuard — H3", () => {
    test("factory rejects non-positive max", () => {
        expect(() => uploadConcurrencyGuard({ max: 0 })).toThrow(/positive integer/);
        expect(() => uploadConcurrencyGuard({ max: -1 })).toThrow();
        expect(() => uploadConcurrencyGuard({ max: 1.5 })).toThrow();
    });

    test("passes through up to `max` concurrent requests, then 429", () => {
        const guard = uploadConcurrencyGuard({ max: 2, label: "test.bulk" });
        const calls = [];
        const next = jest.fn(() => calls.push("next"));

        const r1 = makeRes();
        const r2 = makeRes();
        const r3 = makeRes();

        guard(makeReq(), r1, next);
        guard(makeReq(), r2, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(guard.getActive()).toBe(2);

        guard(makeReq(), r3, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(r3.statusCode).toBe(429);
        expect(r3.body).toEqual(expect.objectContaining({
            success: false,
            error: expect.objectContaining({
                code:     "SERVER_BUSY",
                location: "test.bulk",
                traceId:  "trace-abc",
            }),
        }));
    });

    test("finish releases a slot", () => {
        const guard = uploadConcurrencyGuard({ max: 1 });
        const next = jest.fn();

        const r1 = makeRes();
        guard(makeReq(), r1, next);
        expect(guard.getActive()).toBe(1);

        r1.emit("finish");
        expect(guard.getActive()).toBe(0);

        // Next request now admitted.
        const r2 = makeRes();
        guard(makeReq(), r2, next);
        expect(guard.getActive()).toBe(1);
        expect(next).toHaveBeenCalledTimes(2);
    });

    test("close also releases (aborted client before finish)", () => {
        const guard = uploadConcurrencyGuard({ max: 1 });
        const next = jest.fn();

        const r1 = makeRes();
        guard(makeReq(), r1, next);
        expect(guard.getActive()).toBe(1);

        r1.emit("close");
        expect(guard.getActive()).toBe(0);
    });

    test("finish + close on the same response only releases once", () => {
        const guard = uploadConcurrencyGuard({ max: 2 });
        const next = jest.fn();

        const r1 = makeRes();
        const r2 = makeRes();
        guard(makeReq(), r1, next);
        guard(makeReq(), r2, next);
        expect(guard.getActive()).toBe(2);

        r1.emit("finish");
        r1.emit("close");  // duplicate lifecycle event must not double-decrement
        expect(guard.getActive()).toBe(1);
    });

    test("getMax returns the configured ceiling", () => {
        const guard = uploadConcurrencyGuard({ max: 4 });
        expect(guard.getMax()).toBe(4);
    });
});
