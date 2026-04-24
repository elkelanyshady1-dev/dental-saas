/**
 * tests/billing/pricing/fxService.test.js
 * v4 — FX Service (Checkout Hot Path Cache)
 *
 * Covers:
 *   - Identity pair (USD→USD) → 1.0 with no resolver call
 *   - First call delegates to fxResolver; second call uses in-process cache
 *   - TTL expiry triggers re-fetch
 *   - invalidate() drops the cache so a freshly-pinned manual override is seen
 *   - invalidate(from, to) only drops the targeted key
 *   - Stale rate (>48h) still returns the value (warn, not throw)
 */

"use strict";

jest.mock("@platform/finance/services/fxResolver.service", () => ({
    resolveExchangeRate: jest.fn()
}));

const { resolveExchangeRate } = require("@platform/finance/services/fxResolver.service");
const fxService = require("@platform/billing/pricing/fxService");

beforeEach(() => {
    resolveExchangeRate.mockReset();
    fxService.invalidate();
});

describe("fxService.getRate", () => {
    test("identity pair bypasses resolver", async () => {
        const rate = await fxService.getRate("USD", "USD");
        expect(rate).toBe(1.0);
        expect(resolveExchangeRate).not.toHaveBeenCalled();
    });

    test("first call hits resolver; second call is cached", async () => {
        resolveExchangeRate.mockResolvedValueOnce({
            rate: 48.5,
            source: "auto",
            effectiveDate: new Date()
        });

        const r1 = await fxService.getRate("USD", "EGP");
        const r2 = await fxService.getRate("USD", "EGP");

        expect(r1).toBe(48.5);
        expect(r2).toBe(48.5);
        expect(resolveExchangeRate).toHaveBeenCalledTimes(1);
    });

    test("TTL expiry re-fetches", async () => {
        resolveExchangeRate
            .mockResolvedValueOnce({ rate: 48.0, source: "auto", effectiveDate: new Date() })
            .mockResolvedValueOnce({ rate: 49.0, source: "auto", effectiveDate: new Date() });

        const realNow = Date.now;
        const t0 = realNow();
        Date.now = jest.fn(() => t0);

        try {
            const r1 = await fxService.getRate("USD", "EGP");
            expect(r1).toBe(48.0);

            // Jump past TTL
            Date.now = jest.fn(() => t0 + fxService.TTL_MS + 1);

            const r2 = await fxService.getRate("USD", "EGP");
            expect(r2).toBe(49.0);
            expect(resolveExchangeRate).toHaveBeenCalledTimes(2);
        } finally {
            Date.now = realNow;
        }
    });

    test("stale rate (>48h) still returns the value in non-prod", async () => {
        const staleDate = new Date(Date.now() - 72 * 3600 * 1000); // 72h old
        resolveExchangeRate.mockResolvedValueOnce({
            rate: 47.5,
            source: "auto",
            effectiveDate: staleDate
        });

        const r = await fxService.getRate("USD", "EGP");
        expect(r).toBe(47.5);
    });
});

// ─── A4 — Hard-fail coverage ─────────────────────────────────────────────────
describe("fxService.getRate — A4 hard-fail", () => {
    test("Case 5: throws FX_RATE_UNAVAILABLE when resolver throws", async () => {
        resolveExchangeRate.mockRejectedValueOnce(new Error("no rate on record"));
        await expect(fxService.getRate("USD", "EGP")).rejects.toMatchObject({
            code: "FX_RATE_UNAVAILABLE"
        });
    });

    test("Case 5b: throws FX_RATE_UNAVAILABLE when resolver returns null", async () => {
        resolveExchangeRate.mockResolvedValueOnce(null);
        await expect(fxService.getRate("USD", "EGP")).rejects.toMatchObject({
            code: "FX_RATE_UNAVAILABLE"
        });
    });

    test("Case 6: throws FX_RATE_STALE when rate >48h in production (auto)", async () => {
        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            resolveExchangeRate.mockResolvedValueOnce({
                rate: 47.5,
                source: "auto",
                effectiveDate: new Date(Date.now() - 72 * 3600 * 1000)
            });
            await expect(fxService.getRate("USD", "EGP")).rejects.toMatchObject({
                code: "FX_RATE_STALE"
            });
        } finally {
            process.env.NODE_ENV = savedEnv;
        }
    });

    test("Case 7: allows stale rate when source=manual in production", async () => {
        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            resolveExchangeRate.mockResolvedValueOnce({
                rate: 50.0,
                source: "manual",
                isOverride: true,
                effectiveDate: new Date(Date.now() - 240 * 3600 * 1000)
            });
            const r = await fxService.getRate("USD", "EGP");
            expect(r).toBe(50.0);
        } finally {
            process.env.NODE_ENV = savedEnv;
        }
    });

    test("Case 6b: fresh auto rate in production does NOT throw", async () => {
        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            resolveExchangeRate.mockResolvedValueOnce({
                rate: 48.5,
                source: "auto",
                effectiveDate: new Date() // fresh
            });
            const r = await fxService.getRate("USD", "EGP");
            expect(r).toBe(48.5);
        } finally {
            process.env.NODE_ENV = savedEnv;
        }
    });
});

describe("fxService.invalidate", () => {
    test("clears cache globally when called without args", async () => {
        resolveExchangeRate
            .mockResolvedValueOnce({ rate: 48.0, source: "auto", effectiveDate: new Date() })
            .mockResolvedValueOnce({ rate: 52.0, source: "manual", effectiveDate: new Date() });

        await fxService.getRate("USD", "EGP");
        fxService.invalidate();
        const r2 = await fxService.getRate("USD", "EGP");

        expect(r2).toBe(52.0);
        expect(resolveExchangeRate).toHaveBeenCalledTimes(2);
    });

    test("targeted invalidate(from,to) only drops the matching key", async () => {
        resolveExchangeRate
            .mockResolvedValueOnce({ rate: 48.0, source: "auto", effectiveDate: new Date() })
            .mockResolvedValueOnce({ rate: 0.92, source: "auto", effectiveDate: new Date() })
            .mockResolvedValueOnce({ rate: 50.0, source: "manual", effectiveDate: new Date() });

        await fxService.getRate("USD", "EGP"); // populates USD>EGP
        await fxService.getRate("USD", "EUR"); // populates USD>EUR

        fxService.invalidate("USD", "EGP");

        const eurAgain = await fxService.getRate("USD", "EUR"); // still cached
        expect(eurAgain).toBe(0.92);

        const egpFresh = await fxService.getRate("USD", "EGP"); // re-fetched
        expect(egpFresh).toBe(50.0);

        expect(resolveExchangeRate).toHaveBeenCalledTimes(3);
    });
});
