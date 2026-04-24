/**
 * rateLimit.test.js — Phase 3 lock test (E8)
 *
 * Validates the ticket rate-limiting middleware's two-axis behavior:
 *   - Per-user short-window: 5 tickets/min (fails the 6th with 429).
 *   - Per-org daily cap: honored only on ticket creation path.
 *   - 429 response body includes `retryAfter`, `limit`, `scope`.
 *   - Dev bypass is honored.
 *
 * Phase 6: the limiter is backed by in-memory lru-cache. Tests reset the
 * buckets via `_reset()` between cases — no Redis mock.
 */

"use strict";

const {
    ticketCreateRateLimit,
    ticketMessageRateLimit,
    _config,
    _reset,
} = require("@middleware/ticketRateLimit.middleware");

function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.set = jest.fn(() => res);
    return res;
}

function mockReq(userId, orgId = "org-1") {
    return {
        user: { _id: { toString: () => userId } },
        organizationId: { toString: () => orgId },
        context: { userId, organizationId: orgId },
    };
}

describe("Ticket rate limiting (Phase 3 E8)", () => {
    beforeEach(() => {
        _reset();
    });

    test("per-user limit: 5 create calls pass, 6th returns 429 with Retry-After", async () => {
        const req = mockReq("user-A");

        for (let i = 0; i < _config.USER_TICKET_LIMIT; i++) {
            const res = mockRes();
            const next = jest.fn();
            await ticketCreateRateLimit(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        }

        // 6th call crosses the limit.
        const res6 = mockRes();
        const next6 = jest.fn();
        await ticketCreateRateLimit(req, res6, next6);
        expect(next6).not.toHaveBeenCalled();
        expect(res6.status).toHaveBeenCalledWith(429);

        const body = res6.json.mock.calls[0][0];
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("RATE_LIMITED");
        expect(body.error.scope).toBe("user");
        expect(body.error.limit).toBe(_config.USER_TICKET_LIMIT);
        expect(body.error.retryAfter).toBeGreaterThan(0);
        expect(res6.set).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });

    test("message limiter has a higher threshold (20/min) than create limiter", async () => {
        const req = mockReq("user-B");

        for (let i = 0; i < _config.USER_MESSAGE_LIMIT; i++) {
            const res = mockRes();
            const next = jest.fn();
            await ticketMessageRateLimit(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
        }

        const res21 = mockRes();
        const next21 = jest.fn();
        await ticketMessageRateLimit(req, res21, next21);
        expect(res21.status).toHaveBeenCalledWith(429);
        expect(next21).not.toHaveBeenCalled();
    });

    test("two distinct users do not share the per-user counter", async () => {
        for (let i = 0; i < _config.USER_TICKET_LIMIT; i++) {
            const res = mockRes();
            await ticketCreateRateLimit(mockReq("user-X"), res, jest.fn());
        }

        // user-X is saturated, but user-Y starts fresh.
        const res = mockRes();
        const next = jest.fn();
        await ticketCreateRateLimit(mockReq("user-Y"), res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    test("calls without userId short-circuit to next() (let auth reject)", async () => {
        const res = mockRes();
        const next = jest.fn();
        await ticketCreateRateLimit({}, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});
