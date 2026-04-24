/**
 * ticket.ratelimit.orgCap.test.js — Plan E8 per-org daily cap lock test
 *
 * Scope: the per-org daily rate limit on ticket CREATION. Sister suites
 * (rateLimit.test.js, ticketRateLimit.unit.test.js) exercise the per-user
 * limit and confirm the message limiter skips the org check; this file
 * focuses on the org_daily scope.
 *
 * Phase 6: the limiter is backed by in-memory lru-cache — no Redis mock.
 * `_reset()` clears both user and org buckets between cases, and `_caches`
 * exposes the underlying LRU instances for introspection.
 *
 * Strategy:
 *   - Override `TICKET_DAILY_CAP_PER_ORG` via env to 3 (tiny so the test
 *     is fast and obvious), and `TICKET_USER_LIMIT_PER_MIN` to a large
 *     number so the org cap trips first, and `TICKET_MESSAGE_LIMIT_PER_MIN`
 *     to 2 so message spam tests run in a handful of calls.
 *   - `jest.isolateModules` to pick up the fresh env-bound constants,
 *     because the middleware reads env at module-load time.
 *   - Direct middleware invocation with fake req/res/next.
 */

"use strict";

jest.mock("@config/authConfig", () => ({ DEV_AUTH_MODE: false }), { virtual: true });

// ── Fresh middleware with env-bound constants ────────────────────────────

let ticketCreateRateLimit;
let ticketMessageRateLimit;
let resetLimiter;
let caches;

beforeAll(() => {
    // Capture pre-existing env so we can restore it after this suite runs.
    process.env.__ORIGINAL_TICKET_DAILY_CAP_PER_ORG =
        process.env.TICKET_DAILY_CAP_PER_ORG ?? "";
    process.env.__ORIGINAL_TICKET_USER_LIMIT_PER_MIN =
        process.env.TICKET_USER_LIMIT_PER_MIN ?? "";
    process.env.__ORIGINAL_TICKET_MESSAGE_LIMIT_PER_MIN =
        process.env.TICKET_MESSAGE_LIMIT_PER_MIN ?? "";

    // Set the constants BEFORE requiring the middleware. The daily cap is
    // tiny so the test is fast; the per-user ticket limit is high so the
    // org cap tests can prove org blocks even when users are under their
    // own buckets; the per-user message limit is tiny so the message
    // user-cap test runs in a handful of calls.
    process.env.TICKET_DAILY_CAP_PER_ORG = "3";
    process.env.TICKET_USER_LIMIT_PER_MIN = "1000";
    process.env.TICKET_MESSAGE_LIMIT_PER_MIN = "2";

    jest.isolateModules(() => {
        const mod = require("@middleware/ticketRateLimit.middleware");
        ticketCreateRateLimit = mod.ticketCreateRateLimit;
        ticketMessageRateLimit = mod.ticketMessageRateLimit;
        resetLimiter = mod._reset;
        caches = mod._caches;
    });
});

afterAll(() => {
    // Restore env so neighboring test files aren't contaminated.
    if (process.env.__ORIGINAL_TICKET_DAILY_CAP_PER_ORG) {
        process.env.TICKET_DAILY_CAP_PER_ORG =
            process.env.__ORIGINAL_TICKET_DAILY_CAP_PER_ORG;
    } else {
        delete process.env.TICKET_DAILY_CAP_PER_ORG;
    }
    if (process.env.__ORIGINAL_TICKET_USER_LIMIT_PER_MIN) {
        process.env.TICKET_USER_LIMIT_PER_MIN =
            process.env.__ORIGINAL_TICKET_USER_LIMIT_PER_MIN;
    } else {
        delete process.env.TICKET_USER_LIMIT_PER_MIN;
    }
    if (process.env.__ORIGINAL_TICKET_MESSAGE_LIMIT_PER_MIN) {
        process.env.TICKET_MESSAGE_LIMIT_PER_MIN =
            process.env.__ORIGINAL_TICKET_MESSAGE_LIMIT_PER_MIN;
    } else {
        delete process.env.TICKET_MESSAGE_LIMIT_PER_MIN;
    }
    delete process.env.__ORIGINAL_TICKET_DAILY_CAP_PER_ORG;
    delete process.env.__ORIGINAL_TICKET_USER_LIMIT_PER_MIN;
    delete process.env.__ORIGINAL_TICKET_MESSAGE_LIMIT_PER_MIN;
});

beforeEach(() => {
    resetLimiter();
});

// ── Test doubles ─────────────────────────────────────────────────────────

function mockReq({ userId, orgId }) {
    return {
        user: { _id: userId },
        context: { userId, organizationId: orgId },
        correlationId: "test-correlation",
    };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    return res;
}

async function invoke(middleware, { userId, orgId }) {
    const req = mockReq({ userId, orgId });
    const res = mockRes();
    const next = jest.fn();
    await middleware(req, res, next);
    return { req, res, next };
}

// ── Cases ────────────────────────────────────────────────────────────────

describe("ticketRateLimit — per-org daily cap (Plan E8)", () => {
    test("single user hits org cap: 3 pass, 4th → 429 scope=org_daily", async () => {
        const orgId = "org-alpha";
        const userId = "user-1";

        // 3 passing calls
        for (let i = 0; i < 3; i++) {
            const { res, next } = await invoke(ticketCreateRateLimit, { userId, orgId });
            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        }

        // 4th call — over the org cap
        const { res, next } = await invoke(ticketCreateRateLimit, { userId, orgId });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(429);

        const body = res.json.mock.calls[0][0];
        expect(body).toMatchObject({
            success: false,
            error: expect.objectContaining({
                code: "RATE_LIMITED",
                scope: "org_daily",
                limit: 3,
                windowSeconds: 86400,
            }),
        });
    });

    test("mixed users, same org: org bucket (not user bucket) is what blocks", async () => {
        const orgId = "org-beta";

        // user1: 2 tickets
        await invoke(ticketCreateRateLimit, { userId: "u-1", orgId });
        await invoke(ticketCreateRateLimit, { userId: "u-1", orgId });
        // user2: 1 ticket  → org count = 3
        await invoke(ticketCreateRateLimit, { userId: "u-2", orgId });

        // user3 is brand new (user bucket untouched) but the org cap is now
        // full, so this MUST still be rejected with scope=org_daily.
        const { res, next } = await invoke(ticketCreateRateLimit, {
            userId: "u-3",
            orgId,
        });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(429);

        const body = res.json.mock.calls[0][0];
        expect(body.error.scope).toBe("org_daily");

        // And critically: u-3's own per-user bucket IS incremented first
        // (the user check runs before the org check), so we assert the
        // per-user counter sits at exactly 1 for u-3.
        const userKey = "rl:ticket:ticket_create:user:u-3";
        expect(caches.user.get(userKey)).toBe(1);
    });

    test("429 body carries a numeric Retry-After matching the header", async () => {
        const orgId = "org-gamma";
        const userId = "user-1";

        // Saturate the org cap
        for (let i = 0; i < 3; i++) {
            await invoke(ticketCreateRateLimit, { userId, orgId });
        }

        const { res } = await invoke(ticketCreateRateLimit, { userId, orgId });
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.set).toHaveBeenCalledWith("Retry-After", expect.any(String));

        const [headerName, headerValue] = res.set.mock.calls[0];
        expect(headerName).toBe("Retry-After");
        const headerNum = Number(headerValue);
        expect(headerNum).toBeGreaterThan(0);
        expect(headerNum).toBeLessThanOrEqual(86400);

        const body = res.json.mock.calls[0][0];
        expect(typeof body.error.retryAfter).toBe("number");
        expect(body.error.retryAfter).toBe(headerNum);
    });

    test("message middleware does NOT increment the org counter (scope isolation)", async () => {
        const orgId = "org-delta";
        const userId = "user-1";

        // 2 message calls (within the per-user message cap of 2).
        for (let i = 0; i < 2; i++) {
            const { next } = await invoke(ticketMessageRateLimit, { userId, orgId });
            expect(next).toHaveBeenCalledTimes(1);
        }

        // The org bucket for ticket creation MUST be untouched — the
        // message limiter uses a different key space and never enters
        // the org branch.
        const orgKey = "rl:ticket:create:org:org-delta";
        expect(caches.org.has(orgKey)).toBe(false);

        // And a fresh ticket-create call for this org should still be
        // allowed (the org counter is at 0, not 10).
        const { res, next } = await invoke(ticketCreateRateLimit, { userId, orgId });
        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    // ── retryAfter progression across blocked calls ──────────────────

    test("retryAfter is non-increasing across consecutive blocked calls", async () => {
        const orgId = "org-zeta";
        const userId = "user-1";

        // Saturate the org cap.
        for (let i = 0; i < 3; i++) {
            await invoke(ticketCreateRateLimit, { userId, orgId });
        }

        // Two rejections in a row. With fixed-window semantics
        // (noUpdateTTL:true on increment of an existing key) the TTL is
        // locked to the first set(), so retryAfter is monotonically
        // non-increasing: `retryAfter[N+1] <= retryAfter[N]`. A bug that
        // reset the TTL mid-window would manifest as an upward jump.
        const r1 = await invoke(ticketCreateRateLimit, { userId, orgId });
        const first = r1.res.json.mock.calls[0][0].error.retryAfter;

        const r2 = await invoke(ticketCreateRateLimit, { userId, orgId });
        const second = r2.res.json.mock.calls[0][0].error.retryAfter;

        expect(typeof first).toBe("number");
        expect(typeof second).toBe("number");
        expect(second).toBeLessThanOrEqual(first);
        expect(first).toBeLessThanOrEqual(86400);
        expect(second).toBeLessThanOrEqual(86400);
    });

    // ── Message limiter still respects per-user cap ──────────────────

    test("message limiter still blocks per-user spam with scope=user", async () => {
        const orgId = "org-eta";
        const userId = "user-spammer";

        // TICKET_MESSAGE_LIMIT_PER_MIN is set to 2 for this suite, so the
        // first 2 calls pass and the 3rd is rejected.
        await invoke(ticketMessageRateLimit, { userId, orgId });
        await invoke(ticketMessageRateLimit, { userId, orgId });

        const { res, next } = await invoke(ticketMessageRateLimit, { userId, orgId });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(429);

        const body = res.json.mock.calls[0][0];
        expect(body).toMatchObject({
            success: false,
            error: expect.objectContaining({
                code: "RATE_LIMITED",
                scope: "user",
                limit: 2,
                windowSeconds: 60,
            }),
        });

        // And as before: the org counter for ticket creation MUST NOT have
        // been touched by any of the message calls.
        const orgKey = "rl:ticket:create:org:org-eta";
        expect(caches.org.has(orgKey)).toBe(false);
    });
});
