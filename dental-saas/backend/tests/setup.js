/**
 * tests/setup.js
 * Global Jest Test Infrastructure — Transaction Rollback Edition
 *
 * ARCHITECTURE:
 *
 *   beforeAll  → Start MongoMemoryReplSet + connect Mongoose
 *              → bootstrapCollections() — ensures all collections exist
 *                before any transaction tries to write to them
 *
 *   beforeEach → startTestSession() — opens a MongoDB session + transaction
 *                Tests that wire the session through get automatic rollback isolation.
 *
 *   afterEach  → abortTestSession() — rolls back ALL writes from the test instantly.
 *                No deleteMany() needed for session-aware tests.
 *
 *   afterAll   → disconnect + stop MongoMemoryReplSet
 *
 * TWO CLEANUP MODES:
 *
 *   MODE A — TRANSACTION ROLLBACK (preferred, used by most contract tests)
 *     The test passes getSession() to services/models.
 *     afterEach abortTestSession() rolls everything back.
 *     Zero deleteMany() calls, 5-10× faster.
 *
 *   MODE B — DELETE CLEANUP (fallback, for services with internal session management)
 *     Some services (e.g. provisionOrganization) manage their own internal transactions.
 *     MongoDB does not support nested transactions, so these tests CANNOT be wrapped
 *     in an outer transaction. They must use deleteMany() for cleanup.
 *     Tests that need this should NOT use getSession() and should do their own cleanup.
 *
 * COLLECTION BOOTSTRAP:
 *   MongoDB replica set transactions cannot create new collections mid-transaction.
 *   bootstrapCollections() runs syncIndexes() on all models before any test,
 *   ensuring collections exist in the catalog AND in mongoose.connection.collections.
 */

"use strict";

const mongoose = require("mongoose");
const bootstrapCollections = require("./bootstrapCollections");

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock otplib to avoid ESM import issues in Jest (CJS)
jest.mock("otplib", () => ({
    authenticator: {
        generateSecret: jest.fn(() => "TESTSECRET"),
        keyuri: jest.fn(() => "otpauth://totp/test?secret=TESTSECRET"),
        verify: jest.fn(() => true),
    },
}));

// Mock Redis (ioredis) — not needed in unit/integration tests
jest.mock("ioredis", () => {
    const data = new Map();
    const listeners = new Set();
    return jest.fn().mockImplementation(() => ({
        set: jest.fn(async (key, value, px, ttl, nx) => {
            if (nx === "NX" && data.has(key)) return null;
            data.set(key, value);
            if (ttl) setTimeout(() => data.delete(key), ttl);
            return "OK";
        }),
        get: jest.fn(async (key) => data.get(key)),
        del: jest.fn(async (key) => data.delete(key)),
        publish: jest.fn(async (channel, message) => {
            listeners.forEach(cb => cb(channel, message));
            return 1;
        }),
        subscribe: jest.fn(async () => "OK"),
        unsubscribe: jest.fn(async () => "OK"),
        removeListener: jest.fn((event, callback) => {
            if (event === "message") listeners.delete(callback);
        }),
        eval: jest.fn(async (script, numKeys, key, token) => {
            if (data.get(key) === token) { data.delete(key); return 1; }
            return 0;
        }),
        on: jest.fn((event, callback) => {
            if (event === "message") listeners.add(callback);
        }),
        quit: jest.fn(async () => { }),
        disconnect: jest.fn(async () => { }),
    }));
});

// Mock BullMQ — job queues not needed in tests
jest.mock("bullmq", () => ({
    Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), on: jest.fn() })),
    Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

// ─── DB Lifecycle ──────────────────────────────────────────────────────────────

let mongoServer;

beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
        // MongoMemoryReplSet: required for MongoDB transactions (startSession).
        // Standalone MongoMemoryServer cannot run transactions (code 20: NotPrimary).
        const { MongoMemoryReplSet } = require("mongodb-memory-server");
        mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);
    }

    // Bootstrap all collections before any test starts.
    // This prevents "catalog changes" MongoServerError when a transaction tries
    // to write to a collection that doesn't exist yet in the replica set.
    await bootstrapCollections();
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

// ─── Per-Test Isolation ─────────────────────────────────────────────────────────

// NOTE: startTestSession / abortTestSession from tests/utils/testSession.js
// are OPT-IN per test file. They are NOT applied globally here.
// Reason: services like provisionOrganization manage their own internal MongoDB
// sessions/transactions. MongoDB does not support nested transactions, so a global
// outer session would conflict with those services (MODE B tests).
//
// MODE A (transaction rollback) — for tests on session-aware services:
//   import { startTestSession, abortTestSession } from "../utils/testSession";
//   beforeEach(async () => { await startTestSession(); });
//   afterEach(async () => { await abortTestSession(); });
//
// MODE B (deleteMany cleanup) — for tests on session-managing services:
//   Tests call provisionOrganization or other services with internal sessions.
//   The global afterEach deleteMany below handles cleanup.

afterEach(async () => {
    // Global deleteMany cleanup — MODE B fallback.
    // Clears all collections between tests for services that manage their own sessions.
    // MODE A tests (with transaction rollback) will have already rolled back their
    // writes; the deleteMany here is harmless but adds safety.
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({}).catch(() => { });
    }
});
