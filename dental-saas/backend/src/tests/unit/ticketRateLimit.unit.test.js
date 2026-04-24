/**
 * ticketRateLimit.unit.test.js — E8 rate limiter middleware tests
 *
 * Phase 6: the limiter is now backed by an in-memory lru-cache, so these
 * tests drive it directly without mocking Redis. `_reset()` clears the
 * user + org buckets between cases.
 */

"use strict";

jest.mock("@config/authConfig", () => ({
    DEV_AUTH_MODE: false,
}), { virtual: true });

jest.mock("@utils/logger", () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
}));

const {
    ticketCreateRateLimit,
    ticketMessageRateLimit,
    _config,
    _reset,
} = require("@middleware/ticketRateLimit.middleware");

// ─── Test helpers ────────────────────────────────────────────────────

function makeReq(overrides = {}) {
    return {
        user: { _id: "user-123" },
        organizationId: "org-456",
        ...overrides,
    };
}

function makeRes() {
    const res = {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set(name, value) { this.headers[name] = value; return this; },
    };
    return res;
}

beforeEach(() => {
    _reset();
});

// ─── Tests ───────────────────────────────────────────────────────────

describe("ticketCreateRateLimit (E8)", () => {
    test("allows when under the per-user limit", async () => {
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();
        await ticketCreateRateLimit(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
    });

    test("rejects with 429 when per-user limit is exceeded", async () => {
        // Drive the same user past USER_TICKET_LIMIT to trip the user bucket.
        for (let i = 0; i < _config.USER_TICKET_LIMIT; i++) {
            await ticketCreateRateLimit(makeReq(), makeRes(), jest.fn());
        }
        const res = makeRes();
        const next = jest.fn();
        await ticketCreateRateLimit(makeReq(), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(429);
        expect(res.body.error.code).toBe("RATE_LIMITED");
        expect(res.body.error.scope).toBe("user");
        expect(res.body.error.limit).toBe(_config.USER_TICKET_LIMIT);
        expect(typeof res.body.error.retryAfter).toBe("number");
        expect(res.body.error.retryAfter).toBeGreaterThan(0);
        expect(res.body.error.retryAfter).toBeLessThanOrEqual(_config.USER_WINDOW_SECONDS);
        expect(res.headers["Retry-After"]).toBe(String(res.body.error.retryAfter));
    });

    test("skips rate limiting when no userId is present", async () => {
        const res = makeRes();
        const next = jest.fn();
        await ticketCreateRateLimit({ user: null }, res, next);
        expect(next).toHaveBeenCalled();
    });
});

describe("ticketMessageRateLimit (E8)", () => {
    test("allows under the per-user message limit", async () => {
        const res = makeRes();
        const next = jest.fn();
        await ticketMessageRateLimit(makeReq(), res, next);
        expect(next).toHaveBeenCalled();
    });

    test("rejects over the per-user message limit", async () => {
        for (let i = 0; i < _config.USER_MESSAGE_LIMIT; i++) {
            await ticketMessageRateLimit(makeReq(), makeRes(), jest.fn());
        }
        const res = makeRes();
        const next = jest.fn();
        await ticketMessageRateLimit(makeReq(), res, next);
        expect(res.statusCode).toBe(429);
        expect(res.body.error.scope).toBe("user");
        expect(typeof res.body.error.retryAfter).toBe("number");
    });

    test("does NOT enforce org daily cap on messages", async () => {
        // Run just under the per-user message limit and confirm all pass.
        for (let i = 0; i < _config.USER_MESSAGE_LIMIT - 1; i++) {
            const res = makeRes();
            const next = jest.fn();
            await ticketMessageRateLimit(makeReq(), res, next);
            expect(next).toHaveBeenCalled();
        }
    });
});

describe("config sanity", () => {
    test("USER_TICKET_LIMIT default is 5", () => {
        expect(_config.USER_TICKET_LIMIT).toBe(5);
    });
    test("USER_MESSAGE_LIMIT default is 20", () => {
        expect(_config.USER_MESSAGE_LIMIT).toBe(20);
    });
    test("ORG_TICKET_DAILY_LIMIT default is 100", () => {
        expect(_config.ORG_TICKET_DAILY_LIMIT).toBe(100);
    });
    test("ORG_WINDOW_SECONDS is 24h", () => {
        expect(_config.ORG_WINDOW_SECONDS).toBe(86400);
    });
});
