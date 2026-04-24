/**
 * dbManager.unit.test.js
 * Phase 3.7 — Behavioural unit tests for DB connection hardening
 *
 * Tests:
 *   1. Connection timeout — rejects after DB_CONNECTION_TIMEOUT_MS
 *   2. Stale connection recovery — evicts readyState≠1, recreates fresh
 *   3. Concurrent dedup — N parallel getConnection() → only 1 createConnection()
 *   4. Failure-count circuit breaker — trips after threshold, resets on success
 *
 * STRATEGY:
 *   - jest.isolateModules() gives a fresh dbManager instance per test suite
 *   - jest.useFakeTimers() controls setTimeout in createConnection
 *   - jest.advanceTimersByTime(n) is used instead of runAllTimers() to avoid
 *     triggering the setInterval eviction/health-check loops (60s / 30s)
 *   - Each test tracks its dbMgr and calls shutdown() + jest.clearAllTimers()
 *     in afterEach to cleanly stop background intervals
 *
 * RUN: jest src/tests/unit/dbManager.unit.test.js --no-coverage
 */

"use strict";

// ─── Shared mock handles (mutated per test) ──────────────────────────────────

let mockReadyState = 1;
let mockAsPromiseImpl = () => Promise.resolve();
let useDbCallCount = 0;

const mockConn = {
    get readyState() { return mockReadyState; },
    asPromise: jest.fn(() => mockAsPromiseImpl()),
    close: jest.fn().mockResolvedValue(undefined),
};

const mockUseDb = jest.fn(() => {
    useDbCallCount++;
    return mockConn;
});

jest.mock("mongoose", () => ({
    connection: { useDb: (...args) => mockUseDb(...args) },
}));

jest.mock("@utils/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock("@core/db/shardResolver", () => ({
    resolveShard: () => "shard-1",
}));

jest.mock("@core/db/connectionFactory", () => ({
    buildConnectionKey: ({ shard, orgId }) => `${shard}:${orgId}`,
    getShardUri: () => "mongodb://localhost:27017",
    buildDbName: (orgId) => `dental_org_${orgId}`,
    extractOrgIdFromKey: (key) => key.split(":")[1],
    extractShardFromKey: (key) => key.split(":")[0],
}));

jest.mock("@core/db/Semaphore", () => {
    return class Semaphore {
        constructor(max) { this.max = max; this.active = 0; this.waiting = 0; }
        async acquire() {
            this.active++;
            return () => { this.active--; };
        }
    };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetMocks() {
    mockReadyState = 1;
    mockAsPromiseImpl = () => Promise.resolve();
    useDbCallCount = 0;
    mockConn.asPromise.mockClear();
    mockConn.close.mockClear();
    mockUseDb.mockClear();
}

/**
 * Loads a fresh isolated dbManager with configurable timeout + failure threshold.
 * Returns the module. Caller MUST call dbMgr.shutdown() in afterEach.
 */
function loadDbManager(timeoutMs = 5000, maxFailures = 3) {
    let dbMgr;
    jest.isolateModules(() => {
        process.env.DB_CONNECTION_TIMEOUT_MS = String(timeoutMs);
        process.env.DB_MAX_FAILURES_BEFORE_CIRCUIT_OPEN = String(maxFailures);
        process.env.DB_MODE = "per-org";
        dbMgr = require("../../core/db/dbManager");
    });
    return dbMgr;
}

/**
 * Flush all pending microtasks (Promises) without touching timers.
 * Equivalent to yielding to the microtask queue N times.
 */
async function flushMicrotasks(rounds = 5) {
    for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DBManager Phase 3.7 — Hardening", () => {

    let managersToShutdown = [];

    beforeEach(() => {
        resetMocks();
        jest.useFakeTimers();
        managersToShutdown = [];
    });

    afterEach(async () => {
        // Cleanly stop all background intervals before restoring real timers
        jest.clearAllTimers();
        for (const dbMgr of managersToShutdown) {
            try { await dbMgr.shutdown(); } catch (_) { /* already shut down */ }
        }
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    // ─── 1. Connection Timeout ────────────────────────────────────────────────

    describe("1. Connection Timeout", () => {
        it("rejects with DB_CONNECTION_TIMEOUT when asPromise() hangs beyond timeoutMs", async () => {
            mockAsPromiseImpl = () => new Promise(() => {}); // never resolves

            const dbMgr = loadDbManager(200);
            managersToShutdown.push(dbMgr);

            const connectionPromise = dbMgr.getConnection("timeout-org-1");

            // Advance past the 200 ms timeout (but not the 30s/60s intervals)
            jest.advanceTimersByTime(300);
            await flushMicrotasks();

            await expect(connectionPromise).rejects.toThrow("DB_CONNECTION_TIMEOUT");
        });

        it("increments connectionTimeouts metric on timeout", async () => {
            mockAsPromiseImpl = () => new Promise(() => {});

            const dbMgr = loadDbManager(200);
            managersToShutdown.push(dbMgr);

            const p = dbMgr.getConnection("timeout-metric-org");
            jest.advanceTimersByTime(300);
            await flushMicrotasks();

            await expect(p).rejects.toThrow();
            expect(dbMgr._metrics.connectionTimeouts).toBe(1);
        });

        it("succeeds immediately when asPromise() resolves before timeoutMs", async () => {
            // asPromise() returns a resolved Promise — wins the race as a microtask
            mockAsPromiseImpl = () => Promise.resolve();
            mockReadyState = 1;

            const dbMgr = loadDbManager(5000);
            managersToShutdown.push(dbMgr);

            const connPromise = dbMgr.getConnection("fast-org");

            // Flush microtasks — no timer advance needed; Promise.resolve() wins the race
            await flushMicrotasks();

            const conn = await connPromise;
            expect(conn).toBeDefined();
            expect(conn.readyState).toBe(1);
        });
    });

    // ─── 2. Stale Connection Recovery ────────────────────────────────────────

    describe("2. Stale Connection Recovery", () => {
        it("evicts stale connection (readyState !== 1) and creates a fresh one", async () => {
            mockReadyState = 1;
            mockAsPromiseImpl = () => Promise.resolve();

            const dbMgr = loadDbManager();
            managersToShutdown.push(dbMgr);

            // Pre-seed cache with a stale entry (readyState = 0 = disconnected)
            const staleConn = { readyState: 0, close: jest.fn().mockResolvedValue(undefined) };
            dbMgr._cache.set("shard-1:stale-org", {
                conn: staleConn,
                dbName: "dental_org_stale-org",
                shard: "shard-1",
                orgId: "stale-org",
                createdAt: Date.now() - 60000,
                lastUsedAt: Date.now() - 60000,
                inUseCount: 0,
            });

            const connPromise = dbMgr.getConnection("stale-org");
            await flushMicrotasks();

            const conn = await connPromise;

            // Must return a healthy connection
            expect(conn.readyState).toBe(1);

            // Must have called useDb to create a fresh connection
            expect(useDbCallCount).toBe(1);

            // Metric must be incremented
            expect(dbMgr._metrics.staleConnectionsRecovered).toBe(1);
        });

        it("logs STALE_CONNECTION_RECOVERED event when stale connection is detected", async () => {
            const logger = require("@utils/logger");
            mockReadyState = 1;
            mockAsPromiseImpl = () => Promise.resolve();

            const dbMgr = loadDbManager();
            managersToShutdown.push(dbMgr);

            const staleConn = { readyState: 3, close: jest.fn().mockResolvedValue(undefined) };
            dbMgr._cache.set("shard-1:stale-log-org", {
                conn: staleConn,
                dbName: "dental_org_stale-log-org",
                shard: "shard-1",
                orgId: "stale-log-org",
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                inUseCount: 0,
            });

            const p = dbMgr.getConnection("stale-log-org");
            await flushMicrotasks();
            await p;

            const warnCalls = logger.warn.mock.calls.map((c) => c[0]);
            const recoveryLog = warnCalls.find((c) => c.event === "STALE_CONNECTION_RECOVERED");
            expect(recoveryLog).toBeDefined();
            expect(recoveryLog.orgId).toBe("stale-log-org");
        });
    });

    // ─── 3. Concurrent Request Dedup ─────────────────────────────────────────

    describe("3. Concurrent Request Dedup", () => {
        it("fires only 1 createConnection() for N parallel getConnection() calls to same org", async () => {
            // asPromise() returns a real Promise that we control via external resolve
            let resolveAsPromise;
            mockAsPromiseImpl = () => new Promise((resolve) => { resolveAsPromise = resolve; });
            mockReadyState = 1;

            const dbMgr = loadDbManager();
            managersToShutdown.push(dbMgr);

            // Fire 5 concurrent requests for the same org
            const promises = Array.from({ length: 5 }, () => dbMgr.getConnection("concurrent-org"));

            // Flush microtasks so all 5 calls register and the dedup kicks in
            await flushMicrotasks();

            // Now resolve the underlying connection
            resolveAsPromise();
            await flushMicrotasks(10);

            const conns = await Promise.all(promises);

            // Only ONE call to mongoose.connection.useDb
            expect(useDbCallCount).toBe(1);

            // All callers receive the same connection object
            expect(conns.every((c) => c === conns[0])).toBe(true);

            // 4 dedup hits (5 requests, 1 was the creator)
            expect(dbMgr._metrics.dedupHits).toBe(4);
        });

        it("each org gets its own independent connection", async () => {
            mockReadyState = 1;
            mockAsPromiseImpl = () => Promise.resolve();

            const dbMgr = loadDbManager();
            managersToShutdown.push(dbMgr);

            const [c1, c2] = await Promise.all([
                (async () => { const p = dbMgr.getConnection("org-alpha"); await flushMicrotasks(); return p; })(),
                (async () => { const p = dbMgr.getConnection("org-beta"); await flushMicrotasks(); return p; })(),
            ]);

            expect(dbMgr._cache.has("shard-1:org-alpha")).toBe(true);
            expect(dbMgr._cache.has("shard-1:org-beta")).toBe(true);
            expect(useDbCallCount).toBe(2);
        });
    });

    // ─── 4. Failure-Count Circuit Breaker ────────────────────────────────────

    describe("4. Failure-Count Circuit Breaker", () => {
        it("does NOT trip circuit breaker on the first failure", async () => {
            mockAsPromiseImpl = () => new Promise(() => {});

            const dbMgr = loadDbManager(100, 3);
            managersToShutdown.push(dbMgr);

            const p = dbMgr.getConnection("flaky-org");
            jest.advanceTimersByTime(200);
            await flushMicrotasks();
            await expect(p).rejects.toThrow();

            // 1 failure — circuit must remain closed
            expect(dbMgr._isCircuitOpen("shard-1:flaky-org")).toBe(false);
            expect(dbMgr._failureCountMap.get("shard-1:flaky-org")).toBe(1);
        });

        it("trips circuit breaker after MAX_FAILURES_BEFORE_CIRCUIT_OPEN failures", async () => {
            mockAsPromiseImpl = () => new Promise(() => {});

            const dbMgr = loadDbManager(100, 3);
            managersToShutdown.push(dbMgr);

            // 3 consecutive timeouts
            for (let i = 0; i < 3; i++) {
                const p = dbMgr.getConnection(`circuit-org`);
                jest.advanceTimersByTime(200);
                await flushMicrotasks();
                await expect(p).rejects.toThrow();
            }

            expect(dbMgr._isCircuitOpen("shard-1:circuit-org")).toBe(true);

            // Circuit is now open — next call must fail immediately
            jest.useRealTimers();
            await expect(dbMgr.getConnection("circuit-org")).rejects.toThrow("Circuit breaker OPEN");
            jest.useFakeTimers();
        });

        it("resets failure count and clears circuit after a successful connection", async () => {
            const dbMgr = loadDbManager(100, 3);
            managersToShutdown.push(dbMgr);

            const key = "shard-1:recovery-org";

            // Simulate 2 failures manually (below threshold, circuit stays closed)
            dbMgr._incrementFailureCount(key);
            dbMgr._incrementFailureCount(key);
            expect(dbMgr._failureCountMap.get(key)).toBe(2);
            expect(dbMgr._isCircuitOpen(key)).toBe(false);

            // Next connection succeeds
            mockReadyState = 1;
            mockAsPromiseImpl = () => Promise.resolve();

            const p = dbMgr.getConnection("recovery-org");
            await flushMicrotasks();
            await p;

            // Failure count and circuit must both be cleared
            expect(dbMgr._failureCountMap.has(key)).toBe(false);
            expect(dbMgr._isCircuitOpen(key)).toBe(false);
        });

        it("logs DB_CONNECTION_CREATED event on successful connection", async () => {
            const logger = require("@utils/logger");
            mockReadyState = 1;
            mockAsPromiseImpl = () => Promise.resolve();

            const dbMgr = loadDbManager();
            managersToShutdown.push(dbMgr);

            const p = dbMgr.getConnection("log-org");
            await flushMicrotasks();
            await p;

            const infoCalls = logger.info.mock.calls.map((c) => c[0]);
            const createdLog = infoCalls.find((c) => c.event === "DB_CONNECTION_CREATED");
            expect(createdLog).toBeDefined();
            expect(createdLog.orgId).toBe("log-org");
        });
    });
});
