/**
 * tests/utils/testSession.js
 * Transaction Rollback Test Isolation Manager
 *
 * PURPOSE:
 * Provides a per-test MongoDB session that wraps each test in a transaction.
 * After each test, the transaction is ABORTED — instantly rolling back all writes
 * without any deleteMany() calls. This is the standard fintech/billing test pattern.
 *
 * ARCHITECTURE:
 *   beforeEach → startTestSession()  → opens session + startTransaction()
 *   [test runs]
 *   afterEach  → abortTestSession()  → abortTransaction() + endSession()
 *
 * KEY CONSTRAINT:
 * This pattern works for services that accept an external session parameter.
 * Services that internally manage their own session (e.g. provisionOrganization)
 * CANNOT be wrapped in an outer transaction — MongoDB does not support nested
 * transactions. For those services, use deleteMany() cleanup instead.
 *
 * USAGE IN TESTS:
 *   const { getSession } = require("../utils/testSession");
 *
 *   // Pass session to services or Mongoose calls:
 *   await OrgContract.create([data], { session: getSession() });
 *   await contractEngine.createContract(payload, actorId, { session: getSession() });
 *
 * PLANE: Test Infrastructure
 */

"use strict";

let _session = null;

/**
 * Start a new MongoDB session and begin a transaction.
 * Called in beforeEach — wraps the entire test in a single transaction.
 *
 * @returns {Promise<import("mongoose").ClientSession>}
 */
async function startTestSession() {
    const mongoose = require("mongoose");

    if (_session) {
        // Guard: abort stale session from a previously crashed test
        try {
            await _session.abortTransaction();
            await _session.endSession();
        } catch (_) {
            // Ignore — session may already be dead
        }
        _session = null;
    }

    _session = await mongoose.startSession();
    _session.startTransaction();
    return _session;
}

/**
 * Abort the current test transaction and end the session.
 * Rolling back all writes performed during the test — instant, no deleteMany needed.
 *
 * Called in afterEach.
 */
async function abortTestSession() {
    if (!_session) return;

    try {
        if (_session.inTransaction()) {
            await _session.abortTransaction();
        }
    } catch (err) {
        // Session may already be ended (e.g. if service committed it)
        // This is expected for services with internal session management.
    } finally {
        try {
            await _session.endSession();
        } catch (_) { /* ignore */ }
        _session = null;
    }
}

/**
 * Get the current active test session.
 * Returns null if no session is active (e.g. tests without rollback isolation).
 *
 * @returns {import("mongoose").ClientSession|null}
 */
function getSession() {
    return _session;
}

/**
 * Check whether a test session is currently active and in-transaction.
 * Useful for services that conditionally use a session.
 *
 * @returns {boolean}
 */
function hasActiveSession() {
    return _session !== null && _session.inTransaction();
}

module.exports = {
    startTestSession,
    abortTestSession,
    getSession,
    hasActiveSession,
};
